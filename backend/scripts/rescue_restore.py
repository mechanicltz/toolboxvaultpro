"""
RESCUE restore — Layer 3 of the recovery system.

Runs from inside the container even if the frontend is completely broken.
Restores the DATABASE from a backup ZIP (local file or the latest Google Drive
backup) into the live Mongo database.

Usage (from /app/backend):
    # Dry-run (shows what WOULD be restored, changes nothing):
    python scripts/rescue_restore.py --file "/path/to/backup.zip"

    # Actually restore from a local file:
    python scripts/rescue_restore.py --file "/path/to/backup.zip" --yes

    # Restore from the most recent Google Drive backup:
    python scripts/rescue_restore.py --drive-latest --yes

A safety snapshot of the CURRENT data is taken before any restore.
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
import backups  # noqa: E402
import recovery  # noqa: E402


async def _load_raw(db, args):
    """Return (raw_bytes, passphrase_or_None)."""
    if args.drive_latest:
        import gdrive
        items = await gdrive.list_backups(db)
        # newest .zip backup
        zips = [i for i in items if i.get("name", "").lower().endswith(".zip")]
        if not zips:
            raise SystemExit("No backups found on Google Drive.")
        latest = zips[0]
        print(f"[rescue] Using latest Drive backup: {latest.get('name')} ({latest.get('id')})")
        raw = await gdrive.download_backup(db, file_id=latest["id"])
        pw = args.passphrase
        if not pw:
            try:
                pw = await gdrive.fetch_passphrase_for_backup(db, file_id=latest["id"])
                if pw:
                    print("[rescue] Auto-loaded passphrase from Drive companion file.")
            except Exception as exc:
                print(f"[rescue] WARN passphrase auto-fetch failed: {exc!r}")
        return raw, pw
    if not args.file:
        raise SystemExit("Provide --file PATH or --drive-latest")
    with open(args.file, "rb") as fh:
        return fh.read(), args.passphrase


async def main() -> None:
    ap = argparse.ArgumentParser(description="Rescue restore for Toolbox Vault")
    ap.add_argument("--file", help="Path to a backup ZIP")
    ap.add_argument("--drive-latest", action="store_true", help="Use latest Google Drive backup")
    ap.add_argument("--passphrase", default="", help="Passphrase for an encrypted backup")
    ap.add_argument("--yes", action="store_true", help="Actually perform the restore (wipes data)")
    args = ap.parse_args()

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    raw, passphrase = await _load_raw(db, args)
    parsed = recovery._parse_backup_bytes(raw, passphrase=passphrase or None)
    recovery._validate_bundle(parsed["bundle"])
    summary = recovery._summarize(parsed["bundle"])
    print(f"[rescue] Backup contains {sum(summary.values())} documents:")
    for k, v in summary.items():
        print(f"           {k}: {v}")

    if not args.yes:
        print("[rescue] DRY RUN — nothing changed. Re-run with --yes to restore for real.")
        client.close()
        return

    print("[rescue] Taking a safety snapshot of current data first…")
    try:
        pre = await backups._create_backup_doc(db, trigger="pre-rescue")
        print(f"[rescue] Safety snapshot id={pre.get('id')}")
    except Exception as exc:
        print(f"[rescue] WARN safety snapshot failed: {exc!r}")

    counts = await recovery._restore_bundle(db, parsed["bundle"], wipe=True)
    print(f"[rescue] DONE. Restored: {counts}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
