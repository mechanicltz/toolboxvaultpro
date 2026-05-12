"""
Nuke the entire database. Drops every collection — users, tools,
locations, tags, dealers, borrowers, claims, subscriptions, promo
codes, etc. — leaving a totally empty Mongo db. Indexes are recreated
automatically on the next backend restart.

Run with:
    python /app/backend/wipe_database.py --yes
"""

import asyncio
import os
import sys
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()


async def main():
    if "--yes" not in sys.argv:
        print("Refusing to wipe without --yes flag.")
        sys.exit(1)

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "test_database")
    if not mongo_url:
        print("MONGO_URL missing in env. Aborting.")
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    coll_names = await db.list_collection_names()
    print(f"Found {len(coll_names)} collections in '{db_name}':")
    for c in coll_names:
        count = await db[c].count_documents({})
        print(f"  - {c} ({count} docs)")

    print("\nDropping every collection ...")
    for c in coll_names:
        await db.drop_collection(c)
        print(f"  ✓ dropped {c}")

    print("\nDone. Database is now empty. Restart the backend to recreate indexes.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
