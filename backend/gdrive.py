"""
gdrive.py — Google Drive backup integration.

Uses OAuth user delegation (refresh token model) so that uploaded files
are owned by the end user's Google account, not a service account.
This works with free Google accounts (service accounts can't own files
in personal Drive folders due to Google's 2024+ storage quota policy).

Flow:
  1. Admin clicks "Connect Google Drive" in app → calls /api/admin/gdrive/auth-url
  2. App opens that URL in browser → user grants permission
  3. Google redirects to /api/admin/gdrive/oauth-callback with auth code
  4. We exchange code for a long-lived refresh token, store in Mongo
  5. From then on, every nightly backup uses the refresh token to mint
     a fresh access token and uploads to the configured folder
  6. Retention: keep at least GDRIVE_BACKUP_KEEP_MIN most recent backups
     PLUS anything newer than GDRIVE_BACKUP_RETENTION_DAYS

The OAuth refresh token is stored in a dedicated Mongo doc keyed by
`_id: "gdrive_oauth"`. There's at most one connected account at a time;
re-connecting overwrites the previous token.
"""
from __future__ import annotations

import io
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.auth.exceptions import RefreshError
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaFileUpload

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
# Note: drive.file scope only sees files THIS app created — which is exactly
# what we want for backups. It's narrower / safer than full `drive` scope.

OAUTH_DOC_ID = "gdrive_oauth"


def _settings() -> Dict[str, str]:
    """Pull OAuth + folder settings from env. Raises if missing."""
    cfg = {
        "client_id": os.getenv("GDRIVE_OAUTH_CLIENT_ID", ""),
        "client_secret": os.getenv("GDRIVE_OAUTH_CLIENT_SECRET", ""),
        "redirect_uri": os.getenv("GDRIVE_OAUTH_REDIRECT_URI", ""),
        "folder_id": os.getenv("GDRIVE_FOLDER_ID", ""),
        "retention_days": os.getenv("GDRIVE_BACKUP_RETENTION_DAYS", "30"),
        "keep_min": os.getenv("GDRIVE_BACKUP_KEEP_MIN", "3"),
    }
    missing = [k for k, v in cfg.items() if not v]
    if missing:
        raise RuntimeError(f"Google Drive integration not configured: missing {missing}")
    return cfg


def _build_flow() -> Flow:
    cfg = _settings()
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [cfg["redirect_uri"]],
            }
        },
        scopes=SCOPES,
        redirect_uri=cfg["redirect_uri"],
    )
    # Disable PKCE — we're a server-side confidential client (we hold the
    # client_secret), so PKCE adds no security but complicates state across
    # the redirect. Newer google-auth-oauthlib auto-enables it; explicitly
    # blank the verifier so no challenge is generated.
    try:
        flow.code_verifier = None
    except Exception:
        pass
    return flow


async def build_authorize_url_async(db, state: str = "") -> str:
    """Build the auth URL. Persists any auto-generated code_verifier in DB
    so the OAuth callback (which runs in a different request) can reuse it."""
    flow = _build_flow()
    url, state_val = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state or "toolbox-vault",
    )
    # If the library auto-generated a verifier despite our attempt to disable,
    # stash it so exchange_code_for_token can recover it.
    verifier = getattr(flow, "code_verifier", None)
    await db.system_config.replace_one(
        {"_id": "gdrive_oauth_pending"},
        {"_id": "gdrive_oauth_pending", "state": state_val, "code_verifier": verifier},
        upsert=True,
    )
    return url


def build_authorize_url(state: str = "") -> str:
    """Legacy sync version — only used by tests. The real flow uses
    build_authorize_url_async so the verifier gets persisted."""
    flow = _build_flow()
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state or "toolbox-vault",
    )
    return url


async def exchange_code_for_token(code: str, db) -> Dict[str, Any]:
    """Exchange the auth code for refresh+access tokens, store in DB."""
    flow = _build_flow()

    # Recover the code_verifier that was generated when we built the auth URL
    # (PKCE links the two requests together). If the library auto-enabled PKCE
    # and we have a stored verifier, restore it onto this Flow instance so
    # fetch_token can send it to Google.
    pending = await db.system_config.find_one({"_id": "gdrive_oauth_pending"})
    if pending and pending.get("code_verifier"):
        flow.code_verifier = pending["code_verifier"]

    flow.fetch_token(code=code)
    creds = flow.credentials

    # Clean up pending state regardless of outcome
    await db.system_config.delete_one({"_id": "gdrive_oauth_pending"})

    if not creds.refresh_token:
        # Google withholds refresh_token on subsequent grants unless prompt=consent.
        # Our flow above sets prompt=consent, so this shouldn't happen — but guard.
        raise RuntimeError(
            "Google did not return a refresh_token. "
            "Revoke previous access at https://myaccount.google.com/permissions and try again."
        )

    # Resolve the connected user's email for display.
    # Use Drive's about().get() — works with drive.file scope (the scope we already have)
    # without needing the userinfo.email scope.
    try:
        about = build("drive", "v3", credentials=creds, cache_discovery=False) \
            .about().get(fields="user(emailAddress,displayName)").execute()
        user_info = about.get("user", {}) or {}
        email = user_info.get("emailAddress") or "unknown"
    except Exception as exc:
        logger.warning("Failed to resolve connected Drive email: %s", exc)
        email = "unknown"

    doc = {
        "_id": OAUTH_DOC_ID,
        "refresh_token": creds.refresh_token,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "token_uri": creds.token_uri,
        "scopes": list(creds.scopes or SCOPES),
        "connected_email": email,
        "connected_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.system_config.replace_one({"_id": OAUTH_DOC_ID}, doc, upsert=True)
    return {"connected_email": email}


def _credentials_from_doc(doc: Dict[str, Any]) -> Credentials:
    """Construct a Credentials object from a stored OAuth doc and refresh it.
    Shared helper so both get_status() and the Drive client can mint tokens.
    """
    creds = Credentials(
        token=None,
        refresh_token=doc["refresh_token"],
        token_uri=doc["token_uri"],
        client_id=doc["client_id"],
        client_secret=doc["client_secret"],
        scopes=doc.get("scopes") or SCOPES,
    )
    creds.refresh(GoogleAuthRequest())
    return creds


async def get_status(db) -> Dict[str, Any]:
    """Return whether Drive is *actually* usable right now.

    CRITICAL: a stored refresh-token string is NOT proof the connection works.
    Under Google's "Testing" OAuth publishing status, refresh tokens silently
    die after 7 days. So we VERIFY by minting a fresh access token from the
    refresh token. If that fails with invalid_grant we report disconnected +
    needs_reauth instead of falsely claiming "connected".
    """
    doc = await db.system_config.find_one({"_id": OAUTH_DOC_ID})
    if not doc:
        return {"connected": False}

    email = doc.get("connected_email") or "unknown"

    # Honest liveness check — actually refresh the token.
    try:
        creds = _credentials_from_doc(doc)  # calls creds.refresh()
    except RefreshError as exc:
        logger.warning("[gdrive] Refresh token invalid/expired/revoked: %s", exc)
        return {
            "connected": False,
            "needs_reauth": True,
            "reason": "expired",
            "email": None if email == "unknown" else email,
            "connected_at": doc.get("connected_at"),
            "detail": (
                "Google Drive authorization has expired or was revoked. "
                "Please reconnect Google Drive to resume backups."
            ),
        }
    except Exception as exc:
        # Network / transient Google outage — do NOT claim disconnected (that
        # would wrongly nag the user); flag degraded so the UI can soft-warn.
        logger.warning("[gdrive] Status check transient error: %s", exc)
        return {
            "connected": True,
            "degraded": True,
            "email": None if email == "unknown" else email,
            "connected_at": doc.get("connected_at"),
            "detail": "Could not verify Google Drive right now (temporary).",
        }

    # Token works. Backfill email if we never captured it.
    if email == "unknown":
        try:
            about = build("drive", "v3", credentials=creds, cache_discovery=False) \
                .about().get(fields="user(emailAddress,displayName)").execute()
            fetched = (about.get("user") or {}).get("emailAddress") or ""
            if fetched:
                email = fetched
                await db.system_config.update_one(
                    {"_id": OAUTH_DOC_ID},
                    {"$set": {"connected_email": fetched}},
                )
                logger.info("[gdrive] Backfilled connected_email -> %s", fetched)
        except Exception as exc:
            logger.warning("[gdrive] Email backfill failed: %s", exc)

    return {
        "connected": True,
        "email": email,
        "connected_at": doc.get("connected_at"),
    }



async def disconnect(db) -> None:
    """Forget the stored refresh token."""
    await db.system_config.delete_one({"_id": OAUTH_DOC_ID})


async def _build_drive_service(db):
    """Construct an authenticated Drive v3 client using the stored refresh token."""
    doc = await db.system_config.find_one({"_id": OAUTH_DOC_ID})
    if not doc:
        raise RuntimeError("Google Drive not connected. Visit Admin → Connect Drive.")

    creds = Credentials(
        token=None,  # access token is minted on demand from refresh token
        refresh_token=doc["refresh_token"],
        token_uri=doc["token_uri"],
        client_id=doc["client_id"],
        client_secret=doc["client_secret"],
        scopes=doc["scopes"],
    )
    # Mint a fresh access token
    creds.refresh(GoogleAuthRequest())
    return build("drive", "v3", credentials=creds, cache_discovery=False)


async def upload_backup(
    db,
    *,
    file_bytes: Optional[bytes] = None,
    file_path: Optional[str] = None,
    filename: str,
    mime_type: str = "application/zip",
) -> Dict[str, Any]:
    """Upload a backup to the configured folder. Returns Drive file metadata.

    Pass `file_path` for large snapshots — it streams from disk with a RESUMABLE
    chunked upload (low memory, survives big files). `file_bytes` is kept for
    small in-memory uploads (e.g. the tiny in-DB backup mirror).
    """
    cfg = _settings()
    drive = await _build_drive_service(db)

    if file_path is not None:
        # Streamed, resumable upload straight from disk — never loads the whole
        # file into memory (fixes OOM + single-shot timeout on large snapshots).
        media = MediaFileUpload(
            file_path, mimetype=mime_type, resumable=True, chunksize=8 * 1024 * 1024,
        )
    else:
        media = MediaIoBaseUpload(
            io.BytesIO(file_bytes or b""),
            mimetype=mime_type,
            resumable=False,
        )
    created = drive.files().create(
        body={
            "name": filename,
            "parents": [cfg["folder_id"]],
            "description": "Toolbox Vault automated backup",
        },
        media_body=media,
        fields="id,name,createdTime,size,webViewLink",
    ).execute()
    logger.info("[gdrive] Uploaded backup: %s (id=%s, size=%s)",
                created.get("name"), created.get("id"), created.get("size"))
    return created


async def list_backups(db) -> List[Dict[str, Any]]:
    """List all backup files in the configured folder, newest first."""
    cfg = _settings()
    drive = await _build_drive_service(db)
    res = drive.files().list(
        q=f"'{cfg['folder_id']}' in parents and trashed=false",
        spaces="drive",
        fields="files(id,name,createdTime,size,webViewLink)",
        orderBy="createdTime desc",
        pageSize=200,
    ).execute()
    return res.get("files", [])


# ---------------------------------------------------------------------------
# Passphrase companion files (Phase 3 — encrypted backups)
# ---------------------------------------------------------------------------
def _passphrase_name(backup_filename: str) -> str:
    """Companion passphrase filename: '<base> PASSPHRASE.txt'."""
    base = backup_filename
    if base.lower().endswith(".zip"):
        base = base[:-4]
    return f"{base} PASSPHRASE.txt"


async def upload_passphrase(db, *, passphrase: str, backup_filename: str) -> Dict[str, Any]:
    """Save the backup's passphrase as a sibling .txt file in the Drive folder.
    Named like the backup but with the word PASSPHRASE so they sort together."""
    cfg = _settings()
    drive = await _build_drive_service(db)
    name = _passphrase_name(backup_filename)
    content = (
        "Toolbox Vault — backup passphrase\n"
        "=================================\n"
        f"Backup file : {backup_filename}\n"
        f"Passphrase  : {passphrase}\n\n"
        "How to use: open the backup .zip with 7-Zip / WinZip / Keka and paste\n"
        "this passphrase, OR use the app's Restore screen (it can auto-read this\n"
        "file from Drive).\n"
    )
    media = MediaIoBaseUpload(
        io.BytesIO(content.encode("utf-8")), mimetype="text/plain", resumable=False,
    )
    created = drive.files().create(
        body={
            "name": name,
            "parents": [cfg["folder_id"]],
            "description": "Toolbox Vault backup passphrase",
        },
        media_body=media,
        fields="id,name",
    ).execute()
    logger.info("[gdrive] Uploaded passphrase file: %s (id=%s)",
                created.get("name"), created.get("id"))
    return created


async def fetch_passphrase_for_backup(db, *, file_id: str) -> Optional[str]:
    """Given a backup file id, locate its companion PASSPHRASE.txt in the same
    folder and return the parsed passphrase (or None)."""
    cfg = _settings()
    drive = await _build_drive_service(db)
    meta = drive.files().get(fileId=file_id, fields="name").execute()
    backup_name = meta.get("name", "")
    if not backup_name:
        return None
    pname = _passphrase_name(backup_name).replace("'", "\\'")
    res = drive.files().list(
        q=f"'{cfg['folder_id']}' in parents and name='{pname}' and trashed=false",
        spaces="drive", fields="files(id,name)", pageSize=5,
    ).execute()
    files = res.get("files", [])
    if not files:
        return None
    raw = await download_backup(db, file_id=files[0]["id"])
    text = raw.decode("utf-8", errors="replace")
    for line in text.splitlines():
        low = line.lower().strip()
        if low.startswith("passphrase"):
            # "Passphrase  : XXXX"
            if ":" in line:
                return line.split(":", 1)[1].strip()
    return text.strip() or None


async def delete_backup(db, *, file_id: str) -> None:
    drive = await _build_drive_service(db)
    drive.files().delete(fileId=file_id).execute()
    logger.info("[gdrive] Deleted backup file id=%s", file_id)


async def apply_retention_policy(db) -> Dict[str, Any]:
    """Enforce retention on the Drive folder:
      - Always keep the GDRIVE_BACKUP_KEEP_MIN most-recent backup ZIPs (and
        each one's companion PASSPHRASE.txt), even if older than the cutoff.
      - Delete everything else (old backups AND old passphrase files) older
        than GDRIVE_BACKUP_RETENTION_DAYS days.

    Returns a summary dict of how many were kept / deleted.
    """
    cfg = _settings()
    keep_min = int(cfg["keep_min"])
    retention_days = int(cfg["retention_days"])
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    files = await list_backups(db)  # all files, newest-first
    backup_zips = [f for f in files if f["name"].lower().endswith(".zip")]

    # Names we must never delete: the keep_min newest backups + their passphrases.
    keep_names: set = set()
    for f in backup_zips[:keep_min]:
        keep_names.add(f["name"])
        keep_names.add(_passphrase_name(f["name"]))

    deleted: List[str] = []
    kept: List[str] = []
    for f in files:
        if f["name"] in keep_names:
            kept.append(f["name"])
            continue
        try:
            created = datetime.fromisoformat(f["createdTime"].replace("Z", "+00:00"))
        except Exception:
            kept.append(f["name"])
            continue
        if created < cutoff:
            try:
                await delete_backup(db, file_id=f["id"])
                deleted.append(f["name"])
            except Exception as exc:
                logger.warning("[gdrive] Failed to delete %s: %s", f["name"], exc)
        else:
            kept.append(f["name"])

    return {
        "kept": len(kept),
        "deleted": len(deleted),
        "deleted_names": deleted,
        "retention_days": retention_days,
        "keep_min": keep_min,
    }


async def download_backup(db, *, file_id: str) -> bytes:
    """Download a backup file's bytes from Drive."""
    from googleapiclient.http import MediaIoBaseDownload

    drive = await _build_drive_service(db)
    req = drive.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, req)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue()
