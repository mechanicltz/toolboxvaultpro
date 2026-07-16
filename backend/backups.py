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
import io
import json
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from bson import ObjectId

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Payload storage — GridFS (NOT a single Mongo document).
# ---------------------------------------------------------------------------
# The backup ZIP (whole DB + env, incl. base64 photos) routinely exceeds
# MongoDB's hard 16MB per-document limit as a user's data grows. Storing it in a
# single `payload_b64` field therefore makes insert_one() fail once the payload
# crosses ~16MB — which silently killed all backups (manual + scheduled).
# We now stream the ZIP into GridFS (chunked, no size limit) and keep only tiny
# metadata + a `gridfs_id` in the `backups` collection. Legacy backups that
# still carry an inline `payload_b64` are read transparently for restore.
_BACKUP_BUCKET = "backups_fs"


def _backup_bucket(db) -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(db, bucket_name=_BACKUP_BUCKET)


async def _store_payload(db, backup_id: str, zip_bytes: bytes) -> str:
    """Upload the ZIP into GridFS and return the file id (as a string)."""
    gid = await _backup_bucket(db).upload_from_stream(f"{backup_id}.zip", zip_bytes)
    return str(gid)


async def _load_payload(db, doc: Dict[str, Any]) -> bytes:
    """Read a backup's raw ZIP bytes — from GridFS (new) or inline b64 (legacy)."""
    gid = doc.get("gridfs_id")
    if gid:
        stream = await _backup_bucket(db).open_download_stream(ObjectId(gid))
        return await stream.read()
    b64 = doc.get("payload_b64") or ""
    if not b64:
        raise HTTPException(500, "Backup payload missing — possibly corrupted")
    return base64.b64decode(b64)


async def _delete_payload(db, doc: Dict[str, Any]) -> None:
    """Best-effort delete of a backup's GridFS file (legacy docs are no-ops)."""
    gid = doc.get("gridfs_id")
    if not gid:
        return
    try:
        await _backup_bucket(db).delete(ObjectId(gid))
    except Exception as e:
        logger.warning("Could not delete GridFS backup file %s: %s", gid, e)

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

    backup_id = str(uuid.uuid4())
    # Store the (potentially >16MB) ZIP in GridFS, not inline in the document.
    gridfs_id = await _store_payload(db, backup_id, zip_bytes)

    doc = {
        "id": backup_id,
        "created_at": now.isoformat(),
        "trigger": trigger,
        "collections": BACKUP_COLLECTIONS,
        "document_count": total_docs,
        "size_bytes": len(zip_bytes),
        "gridfs_id": gridfs_id,
        "format": "zip",  # marker so future code can tell new ZIPs from old gzip
    }
    await db.backups.insert_one(doc)

    # Retention prune — keep MAX_BACKUPS_RETAINED most recent (delete GridFS too).
    old_docs = (
        await db.backups
        .find({}, {"id": 1, "gridfs_id": 1, "_id": 0})
        .sort("created_at", -1)
        .skip(MAX_BACKUPS_RETAINED)
        .to_list(length=None)
    )
    if old_docs:
        for od in old_docs:
            await _delete_payload(db, od)
        ids_to_delete = [od["id"] for od in old_docs if od.get("id")]
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
    """Build the FULL snapshot (code+data+env) as a PLAIN ZIP, self-check it,
    then upload it to Google Drive and apply retention. Skips silently if Drive
    isn't connected. Raises if the self-check fails (so a corrupt archive is
    never trusted/uploaded)."""
    import gdrive  # local import — avoids circular at module load
    import recovery

    status = await gdrive.get_status(db)
    if not status.get("connected"):
        logger.info("Drive not connected — skipping scheduled full snapshot.")
        return {"uploaded": False, "reason": "drive_not_connected"}

    snap = await recovery._build_full_snapshot(db, trigger=trigger, encrypt=False)
    zip_path = snap["zip_path"]
    try:
        check = await asyncio.to_thread(recovery.selfcheck_snapshot_file, zip_path)
        if not check.get("ok"):
            logger.error("Full snapshot self-check FAILED — NOT uploading: %s",
                         check.get("error") or check.get("missing"))
            raise RuntimeError(f"Snapshot self-check failed: {check.get('error')}")

        up = await gdrive.upload_backup(
            db, file_path=zip_path, filename=snap["filename"],
            mime_type="application/zip",
        )
    finally:
        try:
            os.remove(zip_path)
        except Exception:
            pass
    retention = await gdrive.apply_retention_policy(db)
    logger.info(
        "Scheduled FULL snapshot mirrored to Drive: %s (id=%s, selfcheck OK, "
        "retention=%s)", snap["filename"], up.get("id"), retention,
    )
    return {"uploaded": True, "filename": snap["filename"], "id": up.get("id"),
            "selfcheck": check, "retention": retention}


# ---------------------------------------------------------------------------
# Offsite-backup HEALTH ALERTS (email the admin if backups stop working).
# ---------------------------------------------------------------------------
# The daily scheduler verifies whether the offsite (Google Drive) backup is
# actually working. If it is NOT — Drive disconnected, OAuth token expired, or
# the upload failed — we EMAIL the admin so a dead backup can never be silently
# missed (even if the app hasn't been opened in months). Emails are throttled:
# one on first detection, then a reminder at most every ALERT_REMINDER_DAYS
# while still broken, plus a one-time "recovered" email when it's fixed.
ALERT_DOC_ID = "backup_alert_state"
ALERT_REMINDER_DAYS = 7


def _admin_emails() -> List[str]:
    raw = os.getenv("ADMIN_EMAILS", "") or ""
    return [e.strip() for e in raw.split(",") if e.strip()]


async def _evaluate_backup_health(db, snapshot_result: Dict[str, Any]) -> Dict[str, Any]:
    """Decide whether offsite backup is currently working and why not."""
    import gdrive  # local import — avoids circular import at module load

    if snapshot_result.get("uploaded"):
        return {
            "healthy": True,
            "reason": "ok",
            "detail": "Offsite backup uploaded to Google Drive successfully.",
        }
    # Snapshot didn't upload — inspect Drive status for the precise reason.
    try:
        status = await gdrive.get_status(db)
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "healthy": False,
            "reason": "status_error",
            "detail": f"Could not verify Google Drive status: {exc}",
        }
    if status.get("needs_reauth"):
        return {
            "healthy": False,
            "reason": "expired",
            "detail": (
                "Google Drive authorization has EXPIRED or was revoked. "
                "Your encrypted backups are NOT being saved offsite. "
                "Open the app → More → Database Backups → Reconnect Google Drive."
            ),
        }
    if not status.get("connected"):
        return {
            "healthy": False,
            "reason": "disconnected",
            "detail": (
                "Google Drive is NOT connected, so backups are NOT being saved "
                "offsite. Open the app → More → Database Backups → Connect Google Drive."
            ),
        }
    # Connected but the upload/self-check failed this cycle.
    return {
        "healthy": False,
        "reason": snapshot_result.get("reason") or "upload_failed",
        "detail": (
            "Google Drive is connected but the latest offsite backup did not "
            "complete. Check the app → Database Backups and tap Backup Now."
        ),
    }


def _alert_email_content(health: Dict[str, Any], when: datetime, *, first: bool):
    stamp = when.strftime("%b %d, %Y %H:%M UTC")
    head = "ACTION NEEDED" if first else "REMINDER"
    subject = f"⚠️ [{head}] Toolbox Vault offsite backup is DOWN"
    plain = (
        f"{head}: Your Toolbox Vault offsite backup is not working.\n\n"
        f"Detected: {stamp}\n"
        f"Problem: {health['detail']}\n\n"
        "Until this is fixed, your nightly backups are NOT being "
        "copied to Google Drive. Your existing backup files in Drive are still "
        "safe — the app just can't add new ones.\n\n"
        "How to fix: open Toolbox Vault → More → Database Backups, and tap "
        "Reconnect / Connect Google Drive.\n\n"
        "You'll get a follow-up email if it's still down in "
        f"{ALERT_REMINDER_DAYS} days, and a confirmation once it's working again.\n"
    )
    html = (
        '<div style="font-family:-apple-system,system-ui,sans-serif;max-width:520px;'
        'margin:0 auto;color:#222">'
        f'<div style="background:#B3261E;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">'
        f'<div style="font-size:13px;font-weight:800;letter-spacing:1px">{head}</div>'
        '<div style="font-size:19px;font-weight:800;margin-top:4px">Offsite backup is DOWN</div></div>'
        '<div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:20px">'
        f'<p style="margin:0 0 12px"><b>Detected:</b> {stamp}</p>'
        f'<p style="margin:0 0 12px;color:#B3261E"><b>Problem:</b> {health["detail"]}</p>'
        '<p style="margin:0 0 12px">Until this is fixed, nightly backups are '
        '<b>not</b> being copied to Google Drive. Your existing Drive backups are still safe.</p>'
        '<p style="margin:16px 0 6px;font-weight:700">How to fix</p>'
        '<p style="margin:0 0 12px">Open <b>Toolbox Vault → More → Database Backups</b> and tap '
        '<b>Reconnect / Connect Google Drive</b>.</p>'
        f'<p style="margin:14px 0 0;font-size:12px;color:#888">A reminder follows in '
        f'{ALERT_REMINDER_DAYS} days if still down, plus a confirmation once fixed.</p>'
        '</div></div>'
    )
    return subject, plain, html


def _recovery_email_content(when: datetime):
    stamp = when.strftime("%b %d, %Y %H:%M UTC")
    subject = "✅ Toolbox Vault offsite backup is working again"
    plain = (
        "Good news — your Toolbox Vault offsite backup is working again.\n\n"
        f"Confirmed: {stamp}\n\n"
        "Nightly encrypted backups are once again being copied to Google Drive.\n"
    )
    html = (
        '<div style="font-family:-apple-system,system-ui,sans-serif;max-width:520px;'
        'margin:0 auto;color:#222">'
        '<div style="background:#1B873F;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">'
        '<div style="font-size:19px;font-weight:800">✅ Offsite backup restored</div></div>'
        '<div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:20px">'
        f'<p style="margin:0 0 12px"><b>Confirmed:</b> {stamp}</p>'
        '<p style="margin:0">Nightly encrypted backups are once again being copied to '
        'Google Drive. No action needed.</p></div></div>'
    )
    return subject, plain, html


async def _maybe_send_backup_alert(db, health: Dict[str, Any]) -> Dict[str, Any]:
    """Throttled email alerting based on the evaluated backup health."""
    now = datetime.now(timezone.utc)
    state = await db.system_config.find_one({"_id": ALERT_DOC_ID}) or {}
    was_healthy = bool(state.get("healthy", True))
    recipients = _admin_emails()
    email_sent = False

    if not health["healthy"]:
        # Decide whether an email is due (first detection OR reminder window).
        due = True
        if not was_healthy:
            last = state.get("last_email_at")
            try:
                due = bool(last) and (
                    now - datetime.fromisoformat(last) >= timedelta(days=ALERT_REMINDER_DAYS)
                )
                if not last:
                    due = True
            except Exception:
                due = True

        if due and recipients:
            from email_sender import send_email  # local import
            subj, plain, html = _alert_email_content(health, now, first=was_healthy)
            for to in recipients:
                ok = await asyncio.to_thread(send_email, to, subj, plain, html)
                email_sent = email_sent or bool(ok)

        await db.system_config.replace_one(
            {"_id": ALERT_DOC_ID},
            {
                "_id": ALERT_DOC_ID,
                "healthy": False,
                "reason": health["reason"],
                "unhealthy_since": (
                    state.get("unhealthy_since") if not was_healthy else now.isoformat()
                ),
                "last_email_at": now.isoformat() if (due and recipients) else state.get("last_email_at"),
                "last_checked_at": now.isoformat(),
            },
            upsert=True,
        )
    else:
        # Healthy now — send a one-time "recovered" email if we were broken.
        if not was_healthy and recipients:
            from email_sender import send_email  # local import
            subj, plain, html = _recovery_email_content(now)
            for to in recipients:
                ok = await asyncio.to_thread(send_email, to, subj, plain, html)
                email_sent = email_sent or bool(ok)
        await db.system_config.replace_one(
            {"_id": ALERT_DOC_ID},
            {
                "_id": ALERT_DOC_ID,
                "healthy": True,
                "reason": "ok",
                "last_checked_at": now.isoformat(),
                "last_email_at": state.get("last_email_at"),
            },
            upsert=True,
        )

    return {"alert_sent": email_sent, "health": health, "recipients": recipients}


async def run_backup_health_check(db, snapshot_result: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Evaluate offsite-backup health and send a throttled alert if needed.
    Reused by both the daily scheduler and the on-demand admin endpoint."""
    health = await _evaluate_backup_health(db, snapshot_result or {"uploaded": False})
    return await _maybe_send_backup_alert(db, health)


async def _run_scheduled_cycle(db, *, reason: str = "scheduled") -> None:
    """One full backup cycle: in-DB snapshot → Drive full snapshot → health check.
    Shared by the daily 03:00 run and the self-healing catch-up run."""
    try:
        row = await _create_backup_doc(db, trigger="scheduled")
        logger.info(
            "Scheduled in-DB backup created (%s): %s (%s, %d docs)",
            reason, row["id"], row["size_human"], row["document_count"],
        )
    except Exception as e:
        logger.exception("Scheduled in-DB backup failed: %s", e)
    # Push the FULL snapshot to Drive (best-effort).
    snapshot_result: Dict[str, Any] = {"uploaded": False, "reason": "unknown"}
    try:
        snapshot_result = await _run_full_snapshot_to_drive(db, trigger="scheduled")
    except Exception as drive_exc:
        logger.warning("Scheduled full snapshot to Drive failed: %s", drive_exc)
        snapshot_result = {"uploaded": False, "reason": "snapshot_error",
                           "error": str(drive_exc)}
    # Daily HEALTH CHECK: email the admin if offsite backup is down.
    try:
        result = await run_backup_health_check(db, snapshot_result)
        if not result["health"]["healthy"]:
            logger.warning(
                "Backup health UNHEALTHY (%s) — alert_sent=%s",
                result["health"]["reason"], result["alert_sent"],
            )
    except Exception as alert_exc:
        logger.exception("Backup health alert check failed: %s", alert_exc)


async def _hours_since_last_backup(db) -> Optional[float]:
    """Hours since the most recent backup of ANY trigger, or None if there are
    no backups yet (treated as 'stale' → catch up immediately)."""
    try:
        last = await db.backups.find_one({}, sort=[("created_at", -1)])
        if not last or not last.get("created_at"):
            return None
        created = datetime.fromisoformat(last["created_at"])
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - created).total_seconds() / 3600.0
    except Exception:
        return None


async def _scheduler_loop(get_db):
    """Background task — runs forever, fires a backup daily at 03:00 UTC.

    SELF-HEALING: on every boot (and each loop), if no backup has succeeded in
    the last 24h — because the process was asleep/restarted across 03:00, or a
    previous run was failing — it runs a catch-up backup IMMEDIATELY instead of
    waiting a whole day. This makes backups resilient to the daily window being
    missed in production.
    """
    logger.info("Backup scheduler started (daily @ 03:00 UTC + self-heal, keep last %d in DB)",
                MAX_BACKUPS_RETAINED)
    while True:
        try:
            db = get_db()
            # Catch up a missed/failed backup right away.
            hrs = await _hours_since_last_backup(db)
            if hrs is None or hrs >= 24.0:
                logger.info(
                    "Self-heal: last backup was %s → running catch-up now",
                    "never" if hrs is None else f"{hrs:.1f}h ago",
                )
                await _run_scheduled_cycle(db, reason="catch-up")
            # Wait for the next daily 03:00 UTC window, then run.
            sleep_for = await _seconds_until_next_run()
            await asyncio.sleep(sleep_for)
            await _run_scheduled_cycle(get_db(), reason="daily")
        except asyncio.CancelledError:
            logger.info("Backup scheduler cancelled")
            raise
        except Exception as e:
            logger.exception("Backup scheduler hiccup, retrying in 1h: %s", e)
            await asyncio.sleep(3600)


async def _push_latest_backup_to_drive(db, backup_id: str) -> None:
    """Download the just-created backup doc, upload to Drive, prune old Drive files."""
    import gdrive  # local import — avoids circular at module load
    # Skip silently if Drive not connected
    status = await gdrive.get_status(db)
    if not status.get("connected"):
        logger.info("Drive not connected — skipping Drive upload for %s", backup_id)
        return

    # Fetch backup metadata, then load the ZIP bytes (GridFS or legacy inline).
    doc = await db.backups.find_one({"id": backup_id})
    if not doc:
        raise RuntimeError(f"Backup {backup_id} not found")
    raw = await _load_payload(db, doc)

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
        try:
            gz_bytes = await _load_payload(db, doc)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(500, "Backup payload could not be read")

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
        doc = await db.backups.find_one({"id": backup_id}, {"gridfs_id": 1, "_id": 0})
        if not doc:
            raise HTTPException(404, "Backup not found")
        await _delete_payload(db, doc)
        await db.backups.delete_one({"id": backup_id})
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
        """List backups currently sitting in the user's Drive folder.

        IMPORTANT: distinguish an AUTH failure (expired/revoked token) from a
        genuinely empty folder so the UI can show "Reconnect Google Drive"
        instead of the misleading "No backup ZIPs in Drive yet".
        """
        require_admin(user)
        import gdrive
        from google.auth.exceptions import RefreshError
        try:
            files = await gdrive.list_backups(get_db())
        except RefreshError as exc:
            logger.warning("Drive list — refresh token expired/revoked: %s", exc)
            return {
                "files": [],
                "count": 0,
                "drive_status": "disconnected",
                "needs_reauth": True,
                "error": "auth_expired",
                "message": (
                    "Google Drive authorization expired or was revoked. "
                    "Reconnect Google Drive to see your backups — your existing "
                    "ZIPs are still safe in Drive."
                ),
            }
        except Exception as exc:
            logger.warning("Drive list failed (non-auth): %s", exc)
            return {
                "files": [],
                "count": 0,
                "drive_status": "error",
                "error": "list_failed",
                "message": f"Couldn't reach Google Drive: {exc}",
            }
        return {"files": files, "count": len(files), "drive_status": "connected"}

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

    @router.get("/admin/backup-health")
    async def backup_health(user=Depends(get_current_user)):
        """Return the current offsite-backup health + last alert state (no email)."""
        require_admin(user)
        db = get_db()
        health = await _evaluate_backup_health(db, {"uploaded": False})
        state = await db.system_config.find_one({"_id": ALERT_DOC_ID}) or {}
        state.pop("_id", None)
        return {
            "health": health,
            "alert_state": state,
            "recipients": _admin_emails(),
            "reminder_days": ALERT_REMINDER_DAYS,
        }

    @router.post("/admin/backup-health/run-now")
    async def backup_health_run_now(test: bool = False, user=Depends(get_current_user)):
        """Run the health check on-demand.

        - test=false (default): real check. If offsite backup is actually down,
          this sends the throttled admin alert email immediately.
        - test=true: sends a SAMPLE alert email to the admin(s) right now so
          deliverability can be verified even when backups are healthy. Does
          NOT change the stored alert state.
        """
        require_admin(user)
        db = get_db()
        if test:
            from email_sender import send_email  # local import
            recipients = _admin_emails()
            sample = {
                "healthy": False,
                "reason": "test",
                "detail": (
                    "This is a TEST of the backup-down email alert. If you receive "
                    "this, alerting is working — you'll get a real email like this "
                    "only if your offsite backup ever stops working."
                ),
            }
            subj, plain, html = _alert_email_content(sample, datetime.now(timezone.utc), first=True)
            subj = "[TEST] " + subj
            sent_to = []
            for to in recipients:
                ok = await asyncio.to_thread(send_email, to, subj, plain, html)
                if ok:
                    sent_to.append(to)
            return {"test": True, "recipients": recipients, "sent_to": sent_to,
                    "ok": len(sent_to) > 0}
        result = await run_backup_health_check(db, {"uploaded": False})
        return {"test": False, **result}

    return router
