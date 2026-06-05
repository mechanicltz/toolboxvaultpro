"""
Disaster-recovery: full snapshots (incl. source code) + restore engine.

This module adds the *restore* half of the backup system plus a true
"everything" snapshot. It complements backups.py (which handles the small,
in-Mongo daily DATA backups + Google Drive mirroring).

Endpoints (mounted under /api):
  ADMIN (logged-in):
    POST /api/admin/backups/full-snapshot      -> build code+data+env ZIP, push to Drive
    POST /api/admin/backups/restore            -> upload a backup ZIP, restore the DB
    POST /api/admin/backups/{id}/restore       -> restore from an in-Mongo backup
    POST /api/admin/backups/restore-from-drive -> restore from a Drive file id
    POST /api/admin/backups/verify             -> validate a backup (no DB writes)
    POST /api/admin/backups/test-sandbox       -> restore into a throwaway sandbox DB
  PUBLIC (only usable on a fresh / empty DB):
    GET  /api/bootstrap/status                 -> {fresh: bool, user_count}
    POST /api/bootstrap/restore                -> upload a backup ZIP on empty DB

Safety guards:
  - Restore lock (no concurrent / half restores).
  - Auto-snapshot of current state BEFORE any production restore.
  - Double-confirm (caller must echo their own email).
  - Bootstrap endpoint returns 410 the moment any user exists.
  - dry_run / sandbox restores never touch the production DB.
  - Every restore writes a `restore_log` audit entry.

NOTE: in-app restore repopulates the DATABASE (the thing that actually gets
lost). Source code + env/secrets are included in the snapshot for manual /
rescue-CLI recovery; the app never rewrites its own running code or clobbers
the live pod's connection env.
"""

from __future__ import annotations

import asyncio
import base64
import gzip
import io
import json
import logging
import os
import secrets
import string
import tarfile
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import pyzipper
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import backups  # reuse BACKUP_COLLECTIONS, _create_backup_doc, _human_size

logger = logging.getLogger(__name__)

# Only one restore may run at a time, per process.
_restore_lock = asyncio.Lock()

# Code-archive exclusions (keep the snapshot lean but complete). We drop
# build caches / generated output (rebuildable) but keep ALL hand-written
# source + design assets so the app can be rebuilt from the snapshot alone.
_FE_EXCLUDE_DIRS = {
    "node_modules", ".expo", ".git", "dist", "web-build", ".vercel", ".idea",
    ".metro-cache", ".turbo", "coverage", ".next", "test-results",
}
_BE_EXCLUDE_DIRS = {"__pycache__", ".git", ".pytest_cache", ".mypy_cache", "venv", ".venv"}
_EXCLUDE_SUFFIXES = (".pyc", ".log", ".DS_Store")


# ---------------------------------------------------------------------------
# Encryption (AES-256 password-protected ZIP) — Phase 3
#
# We build the snapshot as a WinZip-AES (AES-256) encrypted ZIP via pyzipper.
# That format is openable on ANY computer with 7-Zip / WinZip / Keka using the
# passphrase, so a user can recover their code+data even if this app is gone.
# A fresh random passphrase is generated per backup; the passphrase itself is
# stored next to the backup on Google Drive (see gdrive.upload_passphrase).
# ---------------------------------------------------------------------------
_PASSPHRASE_ALPHABET = string.ascii_letters + string.digits


def generate_passphrase(length: int = 40) -> str:
    """Cryptographically-strong random passphrase (alnum, no ambiguous syms)."""
    return "".join(secrets.choice(_PASSPHRASE_ALPHABET) for _ in range(length))


def _build_encrypted_zip(members: Dict[str, bytes], passphrase: str) -> bytes:
    """Pack {arcname: bytes} into an AES-256 password-protected ZIP."""
    buf = io.BytesIO()
    with pyzipper.AESZipFile(
        buf, "w", compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES
    ) as zf:
        zf.setpassword(passphrase.encode("utf-8"))
        zf.setencryption(pyzipper.WZ_AES, nbits=256)
        for name, data in members.items():
            zf.writestr(name, data)
    return buf.getvalue()


def _zip_is_encrypted(raw: bytes) -> bool:
    """Best-effort: does this ZIP have any AES/encrypted entries?"""
    try:
        with pyzipper.AESZipFile(io.BytesIO(raw)) as zf:
            for zi in zf.infolist():
                # bit 0 of flag_bits set => encrypted entry
                if zi.flag_bits & 0x1:
                    return True
        return False
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Parsing / summarizing backup files
# ---------------------------------------------------------------------------
def _parse_backup_bytes(raw: bytes, passphrase: Optional[str] = None) -> Dict[str, Any]:
    """Accept a backup file (encrypted/plain ZIP, legacy .json.gz, or plain JSON)
    and return:
        { bundle: {coll: [rows]}, backend_env, frontend_env, manifest,
          has_code, encrypted }

    If the ZIP is AES-encrypted, a `passphrase` is required; passing the wrong
    (or no) passphrase raises a clear 400.
    """
    out: Dict[str, Any] = {
        "bundle": {}, "backend_env": None, "frontend_env": None,
        "manifest": None, "has_code": False, "encrypted": False,
    }
    if not raw:
        raise HTTPException(400, "Empty backup file")

    # ZIP (current format) — use pyzipper so we can read BOTH plain and
    # AES-encrypted archives with one code path.
    if raw[:2] == b"PK":
        encrypted = _zip_is_encrypted(raw)
        out["encrypted"] = encrypted
        if encrypted and not passphrase:
            raise HTTPException(
                400,
                "This backup is encrypted. Provide the passphrase "
                "(saved in the matching '… PASSPHRASE.txt' file).",
            )
        try:
            with pyzipper.AESZipFile(io.BytesIO(raw)) as zf:
                if passphrase:
                    zf.setpassword(passphrase.encode("utf-8"))
                names = set(zf.namelist())
                if "db.json" not in names:
                    raise HTTPException(400, "Invalid backup: db.json missing")
                try:
                    out["bundle"] = json.loads(zf.read("db.json").decode("utf-8"))
                except (RuntimeError, zipfile.BadZipFile) as dec_exc:
                    # Wrong password yields a decrypt/CRC error from pyzipper.
                    raise HTTPException(
                        400, "Could not decrypt backup — wrong passphrase."
                    ) from dec_exc
                if "backend.env" in names:
                    out["backend_env"] = zf.read("backend.env").decode("utf-8")
                if "frontend.env" in names:
                    out["frontend_env"] = zf.read("frontend.env").decode("utf-8")
                if "manifest.json" in names:
                    try:
                        out["manifest"] = json.loads(zf.read("manifest.json").decode("utf-8"))
                    except Exception:
                        pass
                out["has_code"] = any(n.startswith("code/") for n in names)
            return out
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, f"Corrupt ZIP backup: {exc}")

    # Legacy gzip JSON
    try:
        out["bundle"] = json.loads(gzip.decompress(raw).decode("utf-8"))
        return out
    except Exception:
        pass

    # Plain JSON
    try:
        out["bundle"] = json.loads(raw.decode("utf-8"))
        return out
    except Exception:
        raise HTTPException(400, "Unrecognized backup file format")


def _summarize(bundle: Dict[str, Any]) -> Dict[str, int]:
    return {k: len(v) for k, v in bundle.items() if isinstance(v, list)}


def _validate_bundle(bundle: Dict[str, Any]) -> None:
    if not isinstance(bundle, dict) or not bundle:
        raise HTTPException(400, "Backup contains no collections")
    if "users" not in bundle:
        raise HTTPException(400, "Backup missing the 'users' collection — not a full backup")


# ---------------------------------------------------------------------------
# Restore engine
# ---------------------------------------------------------------------------
async def _restore_bundle(target_db, bundle: Dict[str, Any], *, wipe: bool = True) -> Dict[str, int]:
    """Repopulate target_db from a parsed bundle. Wipes each collection first."""
    counts: Dict[str, int] = {}
    for coll, rows in bundle.items():
        if not isinstance(rows, list):
            continue
        if wipe:
            await target_db[coll].delete_many({})
        if rows:
            cleaned = [{k: v for k, v in r.items() if k != "_id"} for r in rows]
            CHUNK = 500
            for i in range(0, len(cleaned), CHUNK):
                await target_db[coll].insert_many(cleaned[i:i + CHUNK], ordered=False)
        counts[coll] = len(rows)
    return counts


def _sandbox_db(real_db):
    """A throwaway sibling database for dry-run / verification restores."""
    return real_db.client[real_db.name + "_sandbox"]


# ---------------------------------------------------------------------------
# Full snapshot (code + data + env) — for download / Google Drive
# ---------------------------------------------------------------------------
def _tar_dir_bytes(root: str, arcname: str, exclude_dirs: set, exclude_suffixes: tuple) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        def _filter(ti: tarfile.TarInfo):
            parts = ti.name.split("/")
            if any(p in exclude_dirs for p in parts):
                return None
            if ti.name.endswith(exclude_suffixes):
                return None
            return ti
        if os.path.isdir(root):
            tar.add(root, arcname=arcname, filter=_filter)
    return buf.getvalue()


async def _build_full_snapshot(
    real_db, *, trigger: str = "manual",
    encrypt: bool = False, passphrase: Optional[str] = None,
) -> Dict[str, Any]:
    """Build the complete code+data+env snapshot.

    When `encrypt` is True a fresh random `passphrase` is generated (unless one
    is supplied) and the archive is written as an AES-256 password-protected
    ZIP. The plaintext passphrase is returned in the result so the caller can
    mirror it to Drive — it is NEVER embedded in the archive.
    """
    now = datetime.now(timezone.utc)
    if encrypt and not passphrase:
        passphrase = generate_passphrase()

    bundle: Dict[str, List[Dict[str, Any]]] = {}
    total = 0
    for coll in backups.BACKUP_COLLECTIONS:
        rows = await real_db[coll].find({}, {"_id": 0}).to_list(length=None)
        bundle[coll] = rows
        total += len(rows)

    def _read(p: str) -> str:
        try:
            with open(p, "r") as f:
                return f.read()
        except Exception:
            return ""

    backend_env = _read("/app/backend/.env")
    frontend_env = _read("/app/frontend/.env")
    fe_pkg = _read("/app/frontend/package.json")
    app_version = ""
    try:
        app_version = json.loads(fe_pkg).get("version", "")
    except Exception:
        pass

    def _encode() -> bytes:
        fe = _tar_dir_bytes("/app/frontend", "frontend", _FE_EXCLUDE_DIRS, _EXCLUDE_SUFFIXES)
        be = _tar_dir_bytes("/app/backend", "backend", _BE_EXCLUDE_DIRS, _EXCLUDE_SUFFIXES)
        manifest = {
            "schema_version": 4,
            "kind": "full_snapshot",
            "created_at": now.isoformat(),
            "trigger": trigger,
            "app": "Toolbox Vault",
            "app_version": app_version,
            "collections": backups.BACKUP_COLLECTIONS,
            "document_count": total,
            "includes_code": True,
            "includes_env": bool(backend_env or frontend_env),
            "encrypted": bool(encrypt),
            "frontend_src_bytes": len(fe),
            "backend_src_bytes": len(be),
        }
        restore_md = (
            "# Toolbox Vault — FULL SNAPSHOT (code + data + env)\n\n"
            f"Created: {now.isoformat()}\nDocuments: {total:,}\n"
            f"Encrypted: {'YES (AES-256, password-protected ZIP)' if encrypt else 'no'}\n\n"
            "## Contents\n"
            "- `db.json` — every MongoDB collection (incl. base64 photos)\n"
            "- `backend.env` / `frontend.env` — secrets & config\n"
            "- `code/frontend_src.tar.gz` — full Expo app source (no node_modules)\n"
            "- `code/backend_src.tar.gz` — full FastAPI source (no caches)\n"
            "- `manifest.json` — metadata\n\n"
            "## Restore\n"
            "- PASSPHRASE: the matching '… PASSPHRASE.txt' file on Google Drive "
            "holds the password for this archive.\n"
            "- Open with 7-Zip / WinZip / Keka using that passphrase, OR\n"
            "- DATA: open the app → if DB is empty you'll see 'Fresh Install "
            "Detected' → Restore from Backup → pick this ZIP + paste the passphrase.\n"
            "- CODE: extract the tarballs, then rebuild.\n"
            "- ENV: copy values from backend.env/frontend.env into the new project.\n"
        )
        members = {
            "db.json": json.dumps(bundle, default=str).encode("utf-8"),
            "manifest.json": json.dumps(manifest, indent=2).encode("utf-8"),
            "RESTORE.md": restore_md.encode("utf-8"),
            "code/frontend_src.tar.gz": fe,
            "code/backend_src.tar.gz": be,
        }
        if backend_env:
            members["backend.env"] = backend_env.encode("utf-8")
        if frontend_env:
            members["frontend.env"] = frontend_env.encode("utf-8")

        if encrypt:
            return _build_encrypted_zip(members, passphrase)  # type: ignore[arg-type]
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for name, data in members.items():
                zf.writestr(name, data)
        return buf.getvalue()

    zip_bytes = await asyncio.to_thread(_encode)
    filename = f"{now.strftime('%m-%d-%Y %H-%M')} FULL SNAPSHOT.zip"
    return {
        "zip_bytes": zip_bytes,
        "filename": filename,
        "size_bytes": len(zip_bytes),
        "size_human": backups._human_size(len(zip_bytes)),
        "document_count": total,
        "created_at": now.isoformat(),
        "encrypted": bool(encrypt),
        "passphrase": passphrase,
    }


def passphrase_filename(backup_filename: str) -> str:
    """Companion passphrase filename for a backup, e.g.
    '06-05-2026 11-18 FULL SNAPSHOT.zip' -> '06-05-2026 11-18 FULL SNAPSHOT PASSPHRASE.txt'.
    """
    base = backup_filename
    if base.lower().endswith(".zip"):
        base = base[:-4]
    return f"{base} PASSPHRASE.txt"


def selfcheck_snapshot(zip_bytes: bytes, passphrase: Optional[str]) -> Dict[str, Any]:
    """Open the just-built archive and confirm it is restorable (db.json present,
    decrypts cleanly, has the users collection). Never writes to any DB.
    Returns {ok, total_documents, collections, error?}.
    """
    try:
        parsed = _parse_backup_bytes(zip_bytes, passphrase=passphrase)
        _validate_bundle(parsed["bundle"])
        summary = _summarize(parsed["bundle"])
        return {
            "ok": True,
            "total_documents": sum(summary.values()),
            "collections": len(summary),
            "has_code": parsed["has_code"],
        }
    except HTTPException as exc:
        return {"ok": False, "error": exc.detail}
    except Exception as exc:  # pragma: no cover
        return {"ok": False, "error": str(exc)}


async def _audit(real_db, action: str, detail: Dict[str, Any]) -> None:
    try:
        import uuid
        await real_db.restore_log.insert_one({
            "id": str(uuid.uuid4()),
            "action": action,
            "at": datetime.now(timezone.utc).isoformat(),
            "detail": detail,
        })
    except Exception as exc:
        logger.warning("restore_log write failed: %s", exc)


def _user_email(user: Any) -> str:
    return ((getattr(user, "email", None) or
             (user.get("email") if isinstance(user, dict) else "")) or "").strip().lower()


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
def make_recovery_router(get_real_db, get_current_user, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api")

    # ---------------- Full snapshot ----------------
    @router.post("/admin/backups/full-snapshot")
    async def full_snapshot(user=Depends(get_current_user)):
        """Build the complete ENCRYPTED code+data+env snapshot, push it to Google
        Drive, mirror the passphrase next to it, run an integrity self-check, and
        apply 15-day retention."""
        require_admin(user)
        real_db = get_real_db()
        snap = await _build_full_snapshot(real_db, trigger="manual", encrypt=True)
        # Integrity self-check BEFORE we rely on it (decrypt + validate).
        check = await asyncio.to_thread(
            selfcheck_snapshot, snap["zip_bytes"], snap["passphrase"]
        )
        gdrive_uploaded = False
        gdrive_id = None
        passphrase_uploaded = False
        try:
            import gdrive
            status = await gdrive.get_status(real_db)
            if status.get("connected"):
                up = await gdrive.upload_backup(
                    real_db, file_bytes=snap["zip_bytes"],
                    filename=snap["filename"], mime_type="application/zip",
                )
                gdrive_uploaded = True
                gdrive_id = up.get("id")
                # Mirror the passphrase alongside the backup.
                try:
                    await gdrive.upload_passphrase(
                        real_db,
                        passphrase=snap["passphrase"],
                        backup_filename=snap["filename"],
                    )
                    passphrase_uploaded = True
                except Exception as pexc:
                    logger.warning("Passphrase upload failed: %s", pexc)
                # Enforce 15-day retention on Drive (backups + passphrases).
                try:
                    await gdrive.apply_retention_policy(real_db)
                except Exception as rexc:
                    logger.warning("Drive retention after full snapshot failed: %s", rexc)
        except Exception as exc:
            logger.warning("Full snapshot Drive upload failed: %s", exc)
        await _audit(real_db, "full_snapshot", {
            "filename": snap["filename"], "size": snap["size_human"],
            "encrypted": True, "selfcheck": check,
            "gdrive_uploaded": gdrive_uploaded,
            "passphrase_uploaded": passphrase_uploaded,
        })
        return {
            "ok": True,
            "filename": snap["filename"],
            "size_human": snap["size_human"],
            "size_bytes": snap["size_bytes"],
            "document_count": snap["document_count"],
            "encrypted": True,
            "selfcheck_ok": check.get("ok", False),
            "selfcheck": check,
            "gdrive_uploaded": gdrive_uploaded,
            "gdrive_id": gdrive_id,
            "passphrase_uploaded": passphrase_uploaded,
        }

    # ---------------- Verify (no writes) ----------------
    @router.post("/admin/backups/verify")
    async def verify_backup(
        user=Depends(get_current_user),
        file: UploadFile = File(...),
        passphrase: str = Form(""),
    ):
        require_admin(user)
        raw = await file.read()
        parsed = _parse_backup_bytes(raw, passphrase=passphrase or None)
        _validate_bundle(parsed["bundle"])
        summary = _summarize(parsed["bundle"])
        return {
            "ok": True,
            "valid": True,
            "encrypted": parsed.get("encrypted", False),
            "summary": summary,
            "total_documents": sum(summary.values()),
            "has_code": parsed["has_code"],
            "has_env": bool(parsed["backend_env"] or parsed["frontend_env"]),
            "manifest": parsed["manifest"],
        }

    # ---------------- Test restore to sandbox ----------------
    @router.post("/admin/backups/test-sandbox")
    async def test_sandbox(
        user=Depends(get_current_user),
        file: UploadFile = File(...),
        passphrase: str = Form(""),
    ):
        """Restore into a throwaway sandbox DB and compare to production. Prod untouched."""
        require_admin(user)
        real_db = get_real_db()
        raw = await file.read()
        parsed = _parse_backup_bytes(raw, passphrase=passphrase or None)
        _validate_bundle(parsed["bundle"])
        sandbox = _sandbox_db(real_db)
        # Clean sandbox first
        for coll in list(parsed["bundle"].keys()):
            await sandbox[coll].delete_many({})
        restored = await _restore_bundle(sandbox, parsed["bundle"], wipe=True)
        # Compare to prod counts
        comparison = {}
        for coll, n in restored.items():
            prod_n = await real_db[coll].count_documents({})
            comparison[coll] = {"sandbox": n, "production": prod_n, "match": n == prod_n}
        # Drop sandbox so it never lingers
        try:
            await real_db.client.drop_database(sandbox.name)
        except Exception:
            pass
        await _audit(real_db, "test_sandbox", {"restored": restored})
        return {"ok": True, "restored": restored, "comparison": comparison}

    # ---------------- Restore (production) ----------------
    async def _do_production_restore(real_db, parsed, *, source: str, actor: str) -> Dict[str, Any]:
        _validate_bundle(parsed["bundle"])
        async with _restore_lock:
            # Auto-snapshot current state first (so a bad restore is reversible)
            pre = None
            try:
                pre = await backups._create_backup_doc(real_db, trigger="pre-restore")
            except Exception as exc:
                logger.warning("Pre-restore snapshot failed (continuing): %s", exc)
            restored = await _restore_bundle(real_db, parsed["bundle"], wipe=True)
            await _audit(real_db, "restore", {
                "source": source, "actor": actor,
                "restored": restored,
                "pre_restore_backup_id": (pre or {}).get("id"),
            })
        return {
            "ok": True,
            "restored": restored,
            "total_documents": sum(restored.values()),
            "pre_restore_backup_id": (pre or {}).get("id"),
        }

    @router.post("/admin/backups/restore")
    async def restore_upload(
        user=Depends(get_current_user),
        file: UploadFile = File(...),
        confirm_email: str = Form(""),
        passphrase: str = Form(""),
    ):
        require_admin(user)
        if confirm_email.strip().lower() != _user_email(user):
            raise HTTPException(400, "Confirmation email does not match your account.")
        raw = await file.read()
        parsed = _parse_backup_bytes(raw, passphrase=passphrase or None)
        return await _do_production_restore(
            real_db=get_real_db(), parsed=parsed,
            source="upload", actor=_user_email(user),
        )

    @router.post("/admin/backups/{backup_id}/restore")
    async def restore_from_stored(backup_id: str, user=Depends(get_current_user),
                                  confirm_email: str = Form("")):
        require_admin(user)
        if confirm_email.strip().lower() != _user_email(user):
            raise HTTPException(400, "Confirmation email does not match your account.")
        real_db = get_real_db()
        doc = await real_db.backups.find_one({"id": backup_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Backup not found")
        raw = base64.b64decode(doc.get("payload_b64") or "")
        parsed = _parse_backup_bytes(raw)
        return await _do_production_restore(
            real_db=real_db, parsed=parsed,
            source=f"stored:{backup_id}", actor=_user_email(user),
        )

    @router.post("/admin/backups/restore-from-drive")
    async def restore_from_drive(user=Depends(get_current_user),
                                 file_id: str = Form(...), confirm_email: str = Form(""),
                                 passphrase: str = Form("")):
        require_admin(user)
        if confirm_email.strip().lower() != _user_email(user):
            raise HTTPException(400, "Confirmation email does not match your account.")
        real_db = get_real_db()
        import gdrive
        raw = await gdrive.download_backup(real_db, file_id=file_id)
        pw = passphrase or None
        # If the archive is encrypted and no passphrase supplied, auto-fetch the
        # companion '… PASSPHRASE.txt' from the same Drive folder.
        if pw is None and _zip_is_encrypted(raw):
            try:
                pw = await gdrive.fetch_passphrase_for_backup(real_db, file_id=file_id)
            except Exception as exc:
                logger.warning("Auto passphrase fetch failed: %s", exc)
        parsed = _parse_backup_bytes(raw, passphrase=pw)
        return await _do_production_restore(
            real_db=real_db, parsed=parsed,
            source=f"drive:{file_id}", actor=_user_email(user),
        )

    # ---------------- Bootstrap (public, empty DB only) ----------------
    @router.get("/bootstrap/status")
    async def bootstrap_status():
        real_db = get_real_db()
        user_count = await real_db.users.count_documents({})
        return {"fresh": user_count == 0, "user_count": user_count}

    @router.post("/bootstrap/restore")
    async def bootstrap_restore(
        file: UploadFile = File(...),
        dry_run: bool = Form(False),
        passphrase: str = Form(""),
    ):
        real_db = get_real_db()
        user_count = await real_db.users.count_documents({})
        if user_count > 0 and not dry_run:
            raise HTTPException(410, "Bootstrap window closed — the database already has data.")
        raw = await file.read()
        parsed = _parse_backup_bytes(raw, passphrase=passphrase or None)
        _validate_bundle(parsed["bundle"])
        if dry_run:
            sandbox = _sandbox_db(real_db)
            for coll in list(parsed["bundle"].keys()):
                await sandbox[coll].delete_many({})
            restored = await _restore_bundle(sandbox, parsed["bundle"], wipe=True)
            try:
                await real_db.client.drop_database(sandbox.name)
            except Exception:
                pass
            return {"ok": True, "dry_run": True, "would_restore": restored,
                    "total_documents": sum(restored.values())}
        async with _restore_lock:
            restored = await _restore_bundle(real_db, parsed["bundle"], wipe=True)
            await _audit(real_db, "bootstrap_restore", {"restored": restored})
        return {"ok": True, "restored": restored, "total_documents": sum(restored.values())}

    return router
