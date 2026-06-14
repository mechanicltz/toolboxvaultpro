"""
One-time (idempotent) migration: offload existing base64 photos stored inside
Mongo documents into GridFS, replacing each with a `/api/files/{id}` URL.

Safe to re-run: `media.offload_value()` passes through values that are not
`data:` URIs (already-migrated URLs stay untouched).

Run:  python migrate_media.py
"""

import asyncio
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

import media

load_dotenv()


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    media.init_media(db)

    stats = {}

    async def bump(key, n=1):
        stats[key] = stats.get(key, 0) + n

    # ---- tools: photos[], receipts[], documents[] ----
    async for t in db.tools.find({}, {"photos": 1, "receipts": 1, "documents": 1, "owner_id": 1}):
        owner = t.get("owner_id") or ""
        upd = {}
        for field in ("photos", "receipts", "documents"):
            vals = t.get(field) or []
            if any(media.is_data_uri(v) for v in vals):
                upd[field] = await media.offload_list(owner, vals)
                await bump(f"tools.{field}", sum(1 for v in vals if media.is_data_uri(v)))
        if upd:
            await db.tools.update_one({"_id": t["_id"]}, {"$set": upd})

    # ---- bundles: photos[] ----
    async for b in db.bundles.find({}, {"photos": 1, "owner_id": 1}):
        vals = b.get("photos") or []
        if any(media.is_data_uri(v) for v in vals):
            await db.bundles.update_one(
                {"_id": b["_id"]},
                {"$set": {"photos": await media.offload_list(b.get("owner_id") or "", vals)}},
            )
            await bump("bundles.photos", sum(1 for v in vals if media.is_data_uri(v)))

    # ---- wishlist_items: photos[] ----
    async for w in db.wishlist_items.find({}, {"photos": 1, "owner_id": 1}):
        vals = w.get("photos") or []
        if any(media.is_data_uri(v) for v in vals):
            await db.wishlist_items.update_one(
                {"_id": w["_id"]},
                {"$set": {"photos": await media.offload_list(w.get("owner_id") or "", vals)}},
            )
            await bump("wishlist.photos", sum(1 for v in vals if media.is_data_uri(v)))

    # ---- warranty_claims: broken_photo, tool_photo ----
    async for c in db.warranty_claims.find({}, {"broken_photo": 1, "tool_photo": 1, "owner_id": 1}):
        owner = c.get("owner_id") or ""
        upd = {}
        for field in ("broken_photo", "tool_photo"):
            v = c.get(field)
            if media.is_data_uri(v):
                upd[field] = await media.offload_value(owner, v)
                await bump(f"warranty.{field}")
        if upd:
            await db.warranty_claims.update_one({"_id": c["_id"]}, {"$set": upd})

    # ---- insurance_claims: evidence[].data ----
    async for ic in db.insurance_claims.find({}, {"evidence": 1, "owner_id": 1}):
        owner = ic.get("owner_id") or ""
        ev = ic.get("evidence") or []
        changed = False
        for item in ev:
            if isinstance(item, dict) and media.is_data_uri(item.get("data")):
                item["data"] = await media.offload_value(owner, item["data"])
                changed = True
                await bump("insurance.evidence")
        if changed:
            await db.insurance_claims.update_one({"_id": ic["_id"]}, {"$set": {"evidence": ev}})

    print("Migration complete. Offloaded blobs:")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")
    if not stats:
        print("  (nothing to migrate — all clean)")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
