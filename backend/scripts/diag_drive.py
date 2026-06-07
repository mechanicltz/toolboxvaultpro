"""Live diagnostic for the Google Drive backup system. READ-ONLY.
Run:  cd /app/backend && python scripts/diag_drive.py
"""
import asyncio
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
import gdrive  # noqa: E402


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    print("=== ENV / SETTINGS ===")
    print("GDRIVE_FOLDER_ID  =", repr(os.getenv("GDRIVE_FOLDER_ID", "")))
    print("GDRIVE_CLIENT_ID set:", bool(os.getenv("GDRIVE_CLIENT_ID")))
    print("GDRIVE_CLIENT_SECRET set:", bool(os.getenv("GDRIVE_CLIENT_SECRET")))

    print("\n=== get_status ===")
    try:
        st = await gdrive.get_status(db)
        print(st)
    except Exception:
        traceback.print_exc()

    print("\n=== OAuth doc in DB ===")
    doc = await db.system_config.find_one({"_id": gdrive.OAUTH_DOC_ID})
    if not doc:
        print("NO OAUTH DOC -> Drive considered NOT connected")
    else:
        print("doc keys:", sorted(doc.keys()))
        print("connected_email:", doc.get("connected_email"))
        print("has refresh_token:", bool(doc.get("refresh_token")))
        print("scopes:", doc.get("scopes"))

    print("\n=== build drive service (refresh token) ===")
    drive = None
    try:
        drive = await gdrive._build_drive_service(db)
        print("OK - drive service built (refresh token valid)")
    except Exception:
        traceback.print_exc()

    print("\n=== list_backups (configured folder) ===")
    try:
        files = await gdrive.list_backups(db)
        print("count:", len(files))
        for f in files[:20]:
            print(" -", f.get("name"), "|", f.get("size"), "|", f.get("id"))
    except Exception:
        traceback.print_exc()

    if drive is not None:
        print("\n=== Does the configured FOLDER exist / who owns it? ===")
        fid = os.getenv("GDRIVE_FOLDER_ID", "")
        try:
            meta = drive.files().get(
                fileId=fid, fields="id,name,owners(emailAddress),trashed,capabilities(canEdit)"
            ).execute()
            print("folder:", meta)
        except Exception:
            traceback.print_exc()

        print("\n=== ALL .zip files visible to the connected account (any folder) ===")
        try:
            res = drive.files().list(
                q="name contains '.zip' and trashed=false",
                spaces="drive",
                fields="files(id,name,size,parents,owners(emailAddress),createdTime)",
                orderBy="createdTime desc",
                pageSize=50,
            ).execute()
            zips = res.get("files", [])
            print("total .zip visible:", len(zips))
            for f in zips[:25]:
                print(" *", f.get("name"), "| parents:", f.get("parents"),
                      "| owner:", (f.get("owners") or [{}])[0].get("emailAddress"))
        except Exception:
            traceback.print_exc()

        print("\n=== Storage quota of connected account ===")
        try:
            about = drive.about().get(fields="user(emailAddress),storageQuota").execute()
            print(about)
        except Exception:
            traceback.print_exc()

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
