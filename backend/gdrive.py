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
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

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
    return Flow.from_client_config(
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


def build_authorize_url(state: str = "") -> str:
    """Return the URL the user opens in their browser to grant access."""
    flow = _build_flow()
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",  # forces Google to return a refresh_token even on re-auth
        state=state or "toolbox-vault",
    )
    return url


async def exchange_code_for_token(code: str, db) -> Dict[str, Any]:
    """Exchange the auth code for refresh+access tokens, store in DB."""
    flow = _build_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    if not creds.refresh_token:
        # Google withholds refresh_token on subsequent grants unless prompt=consent.
        # Our flow above sets prompt=consent, so this shouldn't happen — but guard.
        raise RuntimeError(
            "Google did not return a refresh_token. "
            "Revoke previous access at https://myaccount.google.com/permissions and try again."
        )

    # Resolve the connected user's email for display
    try:
        userinfo = build("oauth2", "v2", credentials=creds, cache_discovery=False) \
            .userinfo().get().execute()
        email = userinfo.get("email", "unknown")
    except Exception:
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


async def get_status(db) -> Dict[str, Any]:
    """Return whether Drive is connected and what email."""
    doc = await db.system_config.find_one({"_id": OAUTH_DOC_ID})
    if not doc:
        return {"connected": False}
    return {
        "connected": True,
        "email": doc.get("connected_email", "unknown"),
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
    file_bytes: bytes,
    filename: str,
    mime_type: str = "application/zip",
) -> Dict[str, Any]:
    """Upload bytes to the configured folder. Returns Drive file metadata."""
    cfg = _settings()
    drive = await _build_drive_service(db)

    media = MediaIoBaseUpload(
        io.BytesIO(file_bytes),
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


async def delete_backup(db, *, file_id: str) -> None:
    drive = await _build_drive_service(db)
    drive.files().delete(fileId=file_id).execute()
    logger.info("[gdrive] Deleted backup file id=%s", file_id)


async def apply_retention_policy(db) -> Dict[str, Any]:
    """Enforce: keep at least GDRIVE_BACKUP_KEEP_MIN most-recent backups,
    delete anything older than GDRIVE_BACKUP_RETENTION_DAYS days.

    Returns a summary dict of how many were kept / deleted.
    """
    cfg = _settings()
    keep_min = int(cfg["keep_min"])
    retention_days = int(cfg["retention_days"])
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    files = await list_backups(db)  # already newest-first
    deleted: List[str] = []
    kept: List[str] = []

    for idx, f in enumerate(files):
        # Always keep the N most recent
        if idx < keep_min:
            kept.append(f["name"])
            continue
        # Older than cutoff → delete
        created = datetime.fromisoformat(f["createdTime"].replace("Z", "+00:00"))
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
