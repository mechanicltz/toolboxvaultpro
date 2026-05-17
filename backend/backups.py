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
    """Dump every BACKUP_COLLECTIONS collection to a single gzip+base64 blob
    and insert one row into the `backups` collection. Returns the inserted
    row metadata (without the heavy payload).
    """
    import uuid

    now = datetime.now(timezone.utc)
    bundle: Dict[str, List[Dict[str, Any]]] = {}
    total_docs = 0

    for coll_name in BACKUP_COLLECTIONS:
        rows = await db[coll_name].find({}, {"_id": 0}).to_list(length=None)
        bundle[coll_name] = rows
        total_docs += len(rows)

    # Serialize → gzip → base64. Done in a thread-pool to avoid blocking
    # the event loop on big dumps (encoded base64 of a 10 MB gzip is ~13 MB).
    def _encode(data: Dict[str, Any]) -> bytes:
        raw = json.dumps(data, default=str).encode("utf-8")
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=6) as gz:
            gz.write(raw)
        return buf.getvalue()

    gz_bytes = await asyncio.to_thread(_encode, bundle)
    if len(gz_bytes) > MAX_BACKUP_BYTES:
        raise HTTPException(
            413,
            f"Backup payload {_human_size(len(gz_bytes))} exceeds the "
            f"{_human_size(MAX_BACKUP_BYTES)} cap. Migrate to external storage.",
        )

    payload_b64 = base64.b64encode(gz_bytes).decode("ascii")

    doc = {
        "id": str(uuid.uuid4()),
        "created_at": now.isoformat(),
        "trigger": trigger,
        "collections": BACKUP_COLLECTIONS,
        "document_count": total_docs,
        "size_bytes": len(gz_bytes),
        "payload_b64": payload_b64,
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
    """Return seconds until the next 1st-of-month 03:00 UTC."""
    now = datetime.now(timezone.utc)
    # Next month's 1st @ 03:00 UTC
    if now.month == 12:
        next_run = now.replace(year=now.year + 1, month=1, day=1, hour=3,
                               minute=0, second=0, microsecond=0)
    else:
        next_run = now.replace(month=now.month + 1, day=1, hour=3,
                               minute=0, second=0, microsecond=0)
    return (next_run - now).total_seconds()


async def _scheduler_loop(get_db):
    """Background task — runs forever, fires a backup once per month."""
    logger.info("Backup scheduler started (monthly, 1st @ 03:00 UTC, keep last %d)",
                MAX_BACKUPS_RETAINED)
    while True:
        try:
            sleep_for = await _seconds_until_next_run()
            await asyncio.sleep(sleep_for)
            db = get_db()
            try:
                row = await _create_backup_doc(db, trigger="scheduled")
                logger.info(
                    "Scheduled backup created: %s (%s, %d docs)",
                    row["id"], row["size_human"], row["document_count"],
                )
            except Exception as e:
                logger.exception("Scheduled backup failed: %s", e)
        except asyncio.CancelledError:
            logger.info("Backup scheduler cancelled")
            raise
        except Exception as e:
            # Don't let any error kill the loop — log and wait a day.
            logger.exception("Backup scheduler hiccup, retrying tomorrow: %s", e)
            await asyncio.sleep(86400)


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
    router: APIRouter,
    get_db,
    get_current_user,
    require_admin,
) -> None:
    """Register admin-only backup endpoints on `router`."""

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

        ts = doc.get("created_at", "").replace(":", "-").replace("+00:00", "")
        filename = f"toolbox-vault-backup-{ts}.json.gz"
        return Response(
            content=gz_bytes,
            media_type="application/gzip",
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

    @router.get("/admin/backups/config")
    async def backup_config(user=Depends(get_current_user)):
        """Tell the admin UI when the next scheduled backup will run and
        what the retention policy looks like, so the user can plan ahead."""
        require_admin(user)
        seconds = await _seconds_until_next_run()
        next_run = datetime.now(timezone.utc) + timedelta(seconds=seconds)
        return {
            "schedule": "monthly",
            "schedule_human": "1st of every month at 03:00 UTC",
            "next_run_at": next_run.isoformat(),
            "next_run_in_seconds": int(seconds),
            "max_retained": MAX_BACKUPS_RETAINED,
            "collections_backed_up": BACKUP_COLLECTIONS,
        }
