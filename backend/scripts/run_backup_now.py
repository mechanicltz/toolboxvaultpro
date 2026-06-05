"""One-off: create a backup right now and push it to Google Drive.

Run from /app/backend:  python scripts/run_backup_now.py

Uses the existing backups module so it's identical to the scheduled job.
This is a SAFETY snapshot before code changes — it does NOT modify any app data.
"""
import asyncio
import os
import sys

# Make the backend package importable when run from anywhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
import backups  # noqa: E402


async def main() -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    row = await backups._create_backup_doc(db, trigger="manual")
    print(
        f"[OK] Backup created: id={row['id']} size={row['size_human']} "
        f"docs={row['document_count']}"
    )
    try:
        await backups._push_latest_backup_to_drive(db, row["id"])
        print("[OK] Mirrored to Google Drive.")
    except Exception as exc:  # pragma: no cover
        print(f"[WARN] Drive push skipped/failed: {exc!r}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
