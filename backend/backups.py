"""
Database backup module (audit #17).

Provides:
  - Admin-only endpoints to create, list, download, and delete backups.
  - A monthly scheduled job that auto-creates a backup on the 1st of every
    month at ~03:00 UTC, retaining the last 12 (rolling year).
  - Backups are JSON dumps of all collections, gzipped, stored as base64
    inside a single `backups` Mongo collection (no external storage needed).

Design rationale:
  - Self-contained: no S3 / Atlas / external blob storage to configure.
  - Idempotent: re-running on the same day is harmless (named per timestamp).
  - Compressed: a 5,000-tool inventory typically lands at <10 MB after gzip.
  - Admin only: gated by the same _require_admin helper used by promo codes.
"""

from __future__ import annotations

import asyncio
import base64
import gzip
import io
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Collections we back up. Skips ephemeral / large-but-rebuildable ones.
BACKUP_COLLECTIONS = [
    "users",
    "tools",
    "locations",
    "tags",
    "categories",
    "borrowers",
    "dealers",
    "dealer_payment_accounts",
    "checkouts",
    "wishlist_items",
    "transactions",
    "warranty_claims",
    "maintenance_logs",
    "activity_log",
    "subscriptions",
    "promo_codes",
    "feedback",
]

# Retention: keep the 12 most recent backups; older ones auto-pruned.
MAX_BACKUPS_RETAINED = 12

# Compression-then-base64 encoded payloads can be large; cap at 100 MB.
MAX_BACKUP_BYTES = 100 * 1024 * 1024


class BackupListItem(BaseModel):
    id: str
    created_at: str
    size_bytes: int
    size_human: str
    trigger: str  # "manual" | "scheduled"
    collections: List[str]
    document_count: int


def _human_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}" if unit != "B" else f"{n}{unit}"
        n = n / 1024
    return f"{n:.1f}TB"


async def _create_backup_doc(db, *, trigger: str) -> Dict[str, Any]:
    """Build a FULL disaster-recovery snapshot and insert into the backups
    collection. The payload is a ZIP file containing:
        • db.json          — every MongoDB collection in BACKUP_COLLECTIONS
        • backend.env      — backend secrets (Mongo URL, API keys, etc.)
        • frontend.env     — frontend env vars
        • manifest.json    — metadata (timestamp, doc counts, schema version)
        • RESTORE.md       — human-readable recovery instructions

    The ZIP is base64-encoded for storage in Mongo. Future restore-from-snapshot
    flow extracts back the same files.
    """
    import uuid
    import zipfile

    now = datetime.now(timezone.utc)
    bundle: Dict[str, List[Dict[str, Any]]] = {}
    total_docs = 0

    for coll_name in BACKUP_COLLECTIONS:
        rows = await db[coll_name].find({}, {"_id": 0}).to_list(length=None)
        bundle[coll_name] = rows
        total_docs += len(rows)

    # Snapshot .env files (best-effort — if they don't exist we skip silently).
    def _read_env(path: str) -> str:
        try:
            with open(path, "r") as f:
                return f.read()
        except Exception:
            return ""

    backend_env = _read_env("/app/backend/.env")
    frontend_env = _read_env("/app/frontend/.env")

    manifest = {
        "schema_version": 2,
        "created_at": now.isoformat(),
        "trigger": trigger,
        "app": "Toolbox Vault",
        "collections": BACKUP_COLLECTIONS,
        "document_count": total_docs,
        "has_backend_env": bool(backend_env),
        "has_frontend_env": bool(frontend_env),
    }

    restore_md = (
        "# Toolbox Vault Full Backup\n\n"
        f"Created: {now.isoformat()}\n"
        f"Trigger: {trigger}\n"
        f"Documents: {total_docs:,}\n\n"
        "## Contents\n"
        "- `db.json` — All MongoDB collections (JSON)\n"
        "- `backend.env` — Backend secrets/config\n"
        "- `frontend.env` — Frontend env vars\n"
        "- `manifest.json` — Metadata\n\n"
        "## How to restore\n"
        "1. Open the app → More → Admin · Database Backups\n"
        "2. Tap 'Restore from Snapshot' and select this ZIP\n"
        "3. Confirm — DB is repopulated and env files written\n"
        "4. Restart backend if env was changed\n"
    )

    def _encode() -> bytes:
        """Build the ZIP in a worker thread (avoids blocking event loop)."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            zf.writestr("db.json", json.dumps(bundle, default=str, indent=2))
            if backend_env:
                zf.writestr("backend.env", backend_env)
            if frontend_env:
                zf.writestr("frontend.env", frontend_env)
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
            zf.writestr("RESTORE.md", restore_md)
        return buf.getvalue()

    zip_bytes = await asyncio.to_thread(_encode)
    if len(zip_bytes) > MAX_BACKUP_BYTES:
        raise HTTPException(
            413,
            f"Backup payload {_human_size(len(zip_bytes))} exceeds the "
            f"{_human_size(MAX_BACKUP_BYTES)} cap. Migrate to external storage.",
        )

    payload_b64 = base64.b64encode(zip_bytes).decode("ascii")

    doc = {
        "id": str(uuid.uuid4()),
        "created_at": now.isoformat(),
        "trigger": trigger,
        "collections": BACKUP_COLLECTIONS,
        "document_count": total_docs,
        "size_bytes": len(zip_bytes),
        "payload_b64": payload_b64,
        "format": "zip",  # marker so future code can tell new ZIPs from old gzip
    }
    await db.backups.insert_one(doc)

    # Retention prune — keep MAX_BACKUPS_RETAINED most recent.
    cursor = (
        db.backups.find({}, {"id": 1, "_id": 0})
        .sort("created_at", -1)
        .skip(MAX_BACKUPS_RETAINED)
    )
    ids_to_delete = [row["id"] async for row in cursor if row.get("id")]
    if ids_to_delete:
        await db.backups.delete_many({"id": {"$in": ids_to_delete}})
        logger.info(
            "Backup retention: pruned %d old snapshots", len(ids_to_delete)
        )

    return {
        "id": doc["id"],
        "created_at": doc["created_at"],
        "size_bytes": doc["size_bytes"],
        "size_human": _human_size(doc["size_bytes"]),
        "trigger": doc["trigger"],
        "collections": doc["collections"],
        "document_count": doc["document_count"],
    }


async def _seconds_until_next_run() -> float:
    """Return seconds until the next 03:00 UTC (i.e. once per day)."""
    now = datetime.now(timezone.utc)
    next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
    if next_run <= now:
        # 03:00 already passed today → schedule for tomorrow
        next_run = next_run + timedelta(days=1)
    return (next_run - now).total_seconds()


async def _run_full_snapshot_to_drive(db, *, trigger: str = "scheduled") -> Dict[str, Any]:
    """Build the FULL ENCRYPTED snapshot (code+data+env), self-check it, then
    upload it + its passphrase to Google Drive and apply retention. Skips
    silently if Drive isn't connected. Raises if the self-check fails (so a
    corrupt archive is never trusted/uploaded)."""
    import gdrive  # local import — avoids circular at module load
    import recovery

    status = await gdrive.get_status(db)
    if not status.get("connected"):
        logger.info("Drive not connected — skipping scheduled full snapshot.")
        return {"uploaded": False, "reason": "drive_not_connected"}

    snap = await recovery._build_full_snapshot(db, trigger=trigger, encrypt=True)
    check = await asyncio.to_thread(
        recovery.selfcheck_snapshot, snap["zip_bytes"], snap["passphrase"]
    )
    if not check.get("ok"):
        logger.error("Full snapshot self-check FAILED — NOT uploading: %s",
                     check.get("error"))
        raise RuntimeError(f"Snapshot self-check failed: {check.get('error')}")

    up = await gdrive.upload_backup(
        db, file_bytes=snap["zip_bytes"], filename=snap["filename"],
        mime_type="application/zip",
    )
    try:
        await gdrive.upload_passphrase(
            db, passphrase=snap["passphrase"], backup_filename=snap["filename"],
        )
    except Exception as pexc:
        logger.warning("Scheduled passphrase upload failed: %s", pexc)
    retention = await gdrive.apply_retention_policy(db)
    logger.info(
        "Scheduled FULL snapshot mirrored to Drive: %s (id=%s, selfcheck OK, "
        "retention=%s)", snap["filename"], up.get("id"), retention,
    )
    return {"uploaded": True, "filename": snap["filename"], "id": up.get("id"),
            "selfcheck": check, "retention": retention}


async def _scheduler_loop(get_db):
    """Background task — runs forever, fires a backup once per day at 03:00 UTC.

    Each cycle:
      1) Creates a small in-DB data backup (for the in-app restore list +
         pre-restore safety snapshots, prunes to MAX_BACKUPS_RETAINED).
      2) Builds the FULL ENCRYPTED snapshot (code+data+env), self-checks it,
         and uploads it + its passphrase to Google Drive (if connected).
      3) Applies the Drive retention policy (keep min N + delete >15 days old).
    """
    logger.info("Backup scheduler started (daily @ 03:00 UTC, keep last %d in DB)",
                MAX_BACKUPS_RETAINED)
    while True:
        try:
            sleep_for = await _seconds_until_next_run()
            await asyncio.sleep(sleep_for)
            db = get_db()
            try:
                row = await _create_backup_doc(db, trigger="scheduled")
                logger.info(
                    "Scheduled in-DB backup created: %s (%s, %d docs)",
                    row["id"], row["size_human"], row["document_count"],
                )
            except Exception as e:
                logger.exception("Scheduled in-DB backup failed: %s", e)
            # Push the FULL encrypted snapshot to Drive (best-effort).
            try:
                await _run_full_snapshot_to_drive(db, trigger="scheduled")
            except Exception as drive_exc:
                logger.warning("Scheduled full snapshot to Drive failed: %s", drive_exc)
        except asyncio.CancelledError:
            logger.info("Backup scheduler cancelled")
            raise
        except Exception as e:
            logger.exception("Backup scheduler hiccup, retrying tomorrow: %s", e)
            await asyncio.sleep(86400)


async def _push_latest_backup_to_drive(db, backup_id: str) -> None:
    """Download the just-created backup doc, upload to Drive, prune old Drive files."""
    import gdrive  # local import — avoids circular at module load
    # Skip silently if Drive not connected
    status = await gdrive.get_status(db)
    if not status.get("connected"):
        logger.info("Drive not connected — skipping Drive upload for %s", backup_id)
        return

    # Fetch full backup payload (ZIP file) — this IS our backup file
    doc = await db.backups.find_one({"id": backup_id})
    if not doc:
        raise RuntimeError(f"Backup {backup_id} not found")
    raw = base64.b64decode(doc["payload_b64"])

    # User-friendly filename: "MM-DD-YYYY HH-MM Full Backup.zip"
    # Use ISO created_at to format. Falls back to "Full Backup.zip" if parse fails.
    try:
        ts = datetime.fromisoformat(doc["created_at"])
        # Format like "05-30-2026 18-09 Full Backup.zip"
        filename = f"{ts.strftime('%m-%d-%Y %H-%M')} Full Backup.zip"
    except Exception:
        filename = "Full Backup.zip"

    # Pick mime based on backup format marker (legacy gzip-only backups
    # still exist in the collection from before schema_version=2).
    is_zip = doc.get("format") == "zip"
    mime = "application/zip" if is_zip else "application/gzip"
    if not is_zip:
        # Old format → keep .json.gz extension for clarity
        filename = filename.replace("Full Backup.zip", "Full Backup.json.gz")

    uploaded = await gdrive.upload_backup(
        db, file_bytes=raw, filename=filename, mime_type=mime,
    )
    logger.info("Backup mirrored to Drive: %s (id=%s)", filename, uploaded.get("id"))

    # Enforce retention on Drive (keep last N + everything <30 days)
    retention = await gdrive.apply_retention_policy(db)
    logger.info("Drive retention applied: %s", retention)


_scheduler_task: Optional[asyncio.Task] = None


def start_backup_scheduler(get_db):
    """Idempotently kick off the monthly scheduler. Safe to call on every
    backend boot — won't spawn multiple tasks per process.
    """
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        return
    _scheduler_task = asyncio.create_task(_scheduler_loop(get_db))


def make_backup_router(
    get_db,
    get_current_user,
    require_admin,
) -> APIRouter:
    """Build an admin-only `/api/admin/backups/*` router. Mirrors the pattern
    used by `subscriptions.make_router(...)`: returns a fully-built router so
    the caller can `app.include_router(...)` it once.
    """
    router = APIRouter(prefix="/api")

    @router.get("/admin/backups")
    async def list_backups(user=Depends(get_current_user)):
        """List recent backups (newest first) — excludes the heavy payload."""
        require_admin(user)
        db = get_db()
        rows = (
            await db.backups
            .find({}, {"_id": 0, "payload_b64": 0})
            .sort("created_at", -1)
            .to_list(length=MAX_BACKUPS_RETAINED * 2)
        )
        result = []
        for r in rows:
            size = int(r.get("size_bytes") or 0)
            result.append({
                "id": r.get("id"),
                "created_at": r.get("created_at"),
                "size_bytes": size,
                "size_human": _human_size(size),
                "trigger": r.get("trigger") or "manual",
                "collections": r.get("collections") or [],
                "document_count": int(r.get("document_count") or 0),
            })
        return result

    @router.post("/admin/backups/run")
    async def trigger_backup(user=Depends(get_current_user)):
        """Manually trigger a fresh backup right now."""
        require_admin(user)
        db = get_db()
        row = await _create_backup_doc(db, trigger="manual")
        return row

    @router.get("/admin/backups/config")
    async def backup_config(user=Depends(get_current_user)):
        """Tell the admin UI when the next scheduled backup will run and
        what the retention policy looks like, so the user can plan ahead."""
        require_admin(user)
        seconds = await _seconds_until_next_run()
        next_run = datetime.now(timezone.utc) + timedelta(seconds=seconds)
        return {
            "schedule": "daily",
            "schedule_human": "Every day at 03:00 UTC",
            "next_run_at": next_run.isoformat(),
            "next_run_in_seconds": int(seconds),
            "max_retained": MAX_BACKUPS_RETAINED,
            "collections_backed_up": BACKUP_COLLECTIONS,
        }

    @router.get("/admin/backups/{backup_id}/download")
    async def download_backup(backup_id: str, user=Depends(get_current_user)):
        """Stream the backup payload as a gzipped JSON download.
        The returned filename embeds the timestamp so saved files are unique.
        """
        require_admin(user)
        db = get_db()
        doc = await db.backups.find_one({"id": backup_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Backup not found")
        payload_b64 = doc.get("payload_b64") or ""
        if not payload_b64:
            raise HTTPException(500, "Backup payload missing — possibly corrupted")
        try:
            gz_bytes = base64.b64decode(payload_b64)
        except Exception:
            raise HTTPException(500, "Backup payload could not be decoded")

        is_zip = doc.get("format") == "zip"
        # Friendly filename — matches Drive: "MM-DD-YYYY HH-MM Full Backup.zip"
        try:
            ts_obj = datetime.fromisoformat(doc.get("created_at", ""))
            stamp = ts_obj.strftime("%m-%d-%Y %H-%M")
        except Exception:
            stamp = doc.get("created_at", "").replace(":", "-").replace("+00:00", "")
        if is_zip:
            filename = f"{stamp} Full Backup.zip"
            mime = "application/zip"
        else:
            filename = f"{stamp} Full Backup.json.gz"
            mime = "application/gzip"
        return Response(
            content=gz_bytes,
            media_type=mime,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    @router.delete("/admin/backups/{backup_id}")
    async def delete_backup(backup_id: str, user=Depends(get_current_user)):
        """Remove a single backup."""
        require_admin(user)
        db = get_db()
        res = await db.backups.delete_one({"id": backup_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Backup not found")
        return {"ok": True, "deleted_id": backup_id}

    # =========================================================================
    # GOOGLE DRIVE OAUTH + OFFSITE BACKUP ENDPOINTS
    # -------------------------------------------------------------------------
    # The OAuth callback intentionally has NO auth dependency — Google itself
    # initiates the redirect with the auth code in the query string, so we
    # can't require a Bearer token there. We still verify the request by
    # exchanging the code via Google's token endpoint (only the holder of
    # OUR client_secret can succeed).
    # =========================================================================

    @router.get("/admin/gdrive/status")
    async def gdrive_status(user=Depends(get_current_user)):
        """Return whether Drive is currently connected and to what account."""
        require_admin(user)
        import gdrive
        return await gdrive.get_status(get_db())

    @router.get("/admin/gdrive/auth-url")
    async def gdrive_auth_url(user=Depends(get_current_user)):
        """Generate the URL the user opens in their browser to authorize.
        Also persists any auto-generated PKCE code_verifier in DB so the
        callback (separate request) can complete the exchange."""
        require_admin(user)
        import gdrive
        url = await gdrive.build_authorize_url_async(get_db())
        return {"url": url}

    @router.get("/admin/gdrive/oauth-callback")
    async def gdrive_oauth_callback(code: str = "", state: str = "", error: str = ""):
        """Google redirects here after the user grants permission. We exchange
        the authorization code for a long-lived refresh token and stash it in
        Mongo. NOTE: no Bearer auth required (Google initiates this call)."""
        if error:
            return HTMLResponse(
                f"<h2>Google Drive authorization failed</h2><p>{error}</p>",
                status_code=400,
            )
        if not code:
            return HTMLResponse(
                "<h2>Missing authorization code</h2>", status_code=400,
            )
        import gdrive
        try:
            result = await gdrive.exchange_code_for_token(code, get_db())
        except Exception as exc:
            logger.exception("OAuth exchange failed")
            return HTMLResponse(
                f"<h2>Authorization failed</h2><pre>{exc}</pre>",
                status_code=500,
            )
        return HTMLResponse(
            f"""
            <!doctype html>
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Drive Connected</title>
            <style>
              body {{ font-family: -apple-system, system-ui, sans-serif;
                      background: #111; color: #eee; padding: 32px;
                      max-width: 480px; margin: 0 auto; }}
              h1   {{ color: #F97316; font-size: 22px; }}
              .ok  {{ font-size: 60px; }}
              .em  {{ color: #F97316; font-weight: 700; }}
            </style></head><body>
              <div class="ok">✅</div>
              <h1>Google Drive Connected</h1>
              <p>Backed up account: <span class="em">{result.get('connected_email')}</span></p>
              <p>You can close this tab and return to the app.</p>
            </body></html>
            """,
            status_code=200,
        )

    @router.post("/admin/gdrive/disconnect")
    async def gdrive_disconnect(user=Depends(get_current_user)):
        """Remove the stored refresh token. Daily backups will skip Drive
        upload until the user re-authorizes."""
        require_admin(user)
        import gdrive
        await gdrive.disconnect(get_db())
        return {"ok": True}

    @router.get("/admin/gdrive/files")
    async def gdrive_list_files(user=Depends(get_current_user)):
        """List backups currently sitting in the user's Drive folder."""
        require_admin(user)
        import gdrive
        files = await gdrive.list_backups(get_db())
        return {"files": files, "count": len(files)}

    @router.post("/admin/gdrive/upload-latest")
    async def gdrive_upload_latest(user=Depends(get_current_user)):
        """Force-push the most recent in-DB backup to Drive right now (test btn)."""
        require_admin(user)
        db = get_db()
        latest = await db.backups.find_one(sort=[("created_at", -1)])
        if not latest:
            raise HTTPException(404, "No in-DB backup exists yet — run a manual backup first.")
        await _push_latest_backup_to_drive(db, latest["id"])
        return {"ok": True, "uploaded_backup_id": latest["id"]}

    @router.post("/admin/backups/full-now")
    async def full_backup_now(user=Depends(get_current_user)):
        """ONE-CLICK FULL BACKUP — creates an in-DB snapshot AND pushes it to
        Drive (if connected). This is what the single 'BACKUP NOW' pill button
        on the admin screen calls."""
        require_admin(user)
        db = get_db()
        row = await _create_backup_doc(db, trigger="manual")
        gdrive_uploaded = False
        gdrive_filename: Optional[str] = None
        try:
            await _push_latest_backup_to_drive(db, row["id"])
            gdrive_uploaded = True
            # Look up the just-uploaded file's name for nicer messaging
            import gdrive as _gd
            files = await _gd.list_backups(db)
            if files:
                gdrive_filename = files[0]["name"]
        except Exception as exc:
            # Drive may simply not be connected — that's not fatal for the
            # in-DB backup which already succeeded.
            logger.info("Drive upload skipped after manual backup: %s", exc)
        return {
            "ok": True,
            "backup_id": row["id"],
            "size_human": row["size_human"],
            "document_count": row["document_count"],
            "gdrive_uploaded": gdrive_uploaded,
            "gdrive_filename": gdrive_filename,
        }

    @router.post("/admin/gdrive/retention")
    async def gdrive_apply_retention(user=Depends(get_current_user)):
        """Manually trigger Drive retention cleanup (also runs after each daily upload)."""
        require_admin(user)
        import gdrive
        summary = await gdrive.apply_retention_policy(get_db())
        return summary

    return router
