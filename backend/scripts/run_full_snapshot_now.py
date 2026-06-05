"""One-off: build a FULL SNAPSHOT (code + data + env) right now and push to
Google Drive. Safety baseline before making changes to the backup system.

Run from /app/backend:  python scripts/run_full_snapshot_now.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
import recovery  # noqa: E402


async def main() -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    snap = await recovery._build_full_snapshot(db, trigger="manual-baseline")
    print(f"[OK] Full snapshot built: {snap['filename']} "
          f"size={snap['size_human']} docs={snap['document_count']}")
    try:
        import gdrive
        status = await gdrive.get_status(db)
        if status.get("connected"):
            up = await gdrive.upload_backup(
                db, file_bytes=snap["zip_bytes"],
                filename=snap["filename"], mime_type="application/zip",
            )
            print(f"[OK] Mirrored to Google Drive: {up.get('name')} (id={up.get('id')})")
        else:
            print("[WARN] Drive not connected — snapshot built but not uploaded.")
    except Exception as exc:  # pragma: no cover
        print(f"[WARN] Drive push skipped/failed: {exc!r}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
