"""
seed_community.py — DEV-ONLY demo data for the Community Product Database.

Creates a few simulated users + realistic overlapping tools so the shared
catalog has content to look up and browse in the preview. This is a faithful
simulation of what production bootstrap does (inserts tools + dual-writes
contributions via community.contribute_tool). Safe to re-run (idempotent by
fixed seed user ids). Never runs automatically; run manually:  python seed_community.py
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
import community

# Fixed ids so re-running replaces rather than duplicates.
USERS = [
    {"id": "seed-comm-user-a", "email": "seed_comm_a@example.com", "name": "Seed A"},
    {"id": "seed-comm-user-b", "email": "seed_comm_b@example.com", "name": "Seed B"},
    {"id": "seed-comm-user-c", "email": "seed_comm_c@example.com", "name": "Seed C"},
]

# (brand, model, name, category, tags, msrp, consumable)
PRODUCTS = [
    ("Milwaukee", "2767-20", 'M18 FUEL High Torque Impact Wrench 1/2"', "Power Tools", ["Impact", "Cordless"], 399, False),
    ("Milwaukee", "2860-20", 'M18 FUEL Mid-Torque Impact Wrench 3/8"', "Power Tools", ["Impact", "Cordless"], 279, False),
    ("DeWalt", "DCF899B", '20V MAX Impact Wrench 1/2"', "Power Tools", ["Impact", "Cordless"], 299, False),
    ("Milwaukee", "2853-20", 'M18 FUEL 1/4" Hex Impact Driver', "Power Tools", ["Driver", "Cordless"], 179, False),
    ("DeWalt", "DCD791B", "20V MAX XR Drill/Driver", "Power Tools", ["Drill", "Cordless"], 169, False),
    ("Makita", "XPH07Z", "18V LXT Hammer Driver-Drill", "Power Tools", ["Drill", "Cordless"], 199, False),
    ("Snap-on", "FHF80", '3/8" Drive Ratchet', "Hand Tools", ["Ratchet"], 189, False),
    ("Snap-on", "FHLF80", '3/8" Long Handle Ratchet', "Hand Tools", ["Ratchet"], 219, False),
    ("Snap-on", "SOEX710", "10pc Combination Wrench Set", "Hand Tools", ["Wrench", "Set"], 449, False),
    ("Klein Tools", "D213-9NE", 'Lineman\'s Pliers 9"', "Hand Tools", ["Pliers"], 39, False),
    ("Gearwrench", "9012", "12pc Ratcheting Wrench Set", "Hand Tools", ["Wrench", "Set"], 129, False),
    ("Milwaukee", "48-22-4025", "4pc Screwdriver Set", "Hand Tools", ["Screwdriver", "Set"], 29, False),
    ("Fluke", "87V", "Digital Multimeter", "Test Equipment", ["Electrical"], 449, False),
    ("WD-40", "490057", "Multi-Use Lubricant", "Consumables", ["Lubricant"], 8, True),
    ("Loctite", "242", "Threadlocker Blue", "Consumables", ["Adhesive"], 12, True),
]

# Which users own which product index (>=2 users -> passes consensus threshold).
# First 10 owned by A,B,C (count 3); rest by 2 users (count 2).
def owners_for(idx: int):
    if idx < 10:
        return ["seed-comm-user-a", "seed-comm-user-b", "seed-comm-user-c"]
    if idx % 2 == 0:
        return ["seed-comm-user-a", "seed-comm-user-b"]
    return ["seed-comm-user-b", "seed-comm-user-c"]


def _now():
    return datetime.now(timezone.utc).isoformat()


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "test_database")]

    # 1) Upsert simulated users (opted in).
    for u in USERS:
        await db.users.update_one(
            {"id": u["id"]},
            {"$set": {**u, "password_hash": "x", "community_opt_in": True,
                      "created_at": _now(), "updated_at": _now()}},
            upsert=True,
        )

    # 2) Clear any prior seed tools + their contributions.
    seed_ids = [u["id"] for u in USERS]
    old_tools = await db.tools.find({"owner_id": {"$in": seed_ids}}, {"id": 1}).to_list(10000)
    for t in old_tools:
        for uid in seed_ids:
            await community.retract_tool(db, uid, t["id"])
    await db.tools.delete_many({"owner_id": {"$in": seed_ids}})

    # 3) Insert tools + dual-write contributions (mirrors production path).
    n_tools = 0
    for idx, (brand, model, name, cat, tags, msrp, cons) in enumerate(PRODUCTS):
        for uid in owners_for(idx):
            tool = {
                "id": str(uuid.uuid4()),
                "owner_id": uid,
                "name": name,
                "brand": brand,
                "model_numbers": [model],
                "category_name": cat,
                "tag_names": tags,
                "msrp_price": float(msrp),
                "is_consumable": cons,
                "created_at": _now(),
            }
            await db.tools.insert_one(tool)
            await community.contribute_tool(db, uid, tool)
            n_tools += 1

    profiles = await db.community_profiles.count_documents({})
    visible = await db.community_profiles.count_documents(
        {"contributor_count": {"$gte": community.CONSENSUS_THRESHOLD}}
    )
    print(f"Seeded {len(USERS)} users, {n_tools} tools -> {profiles} profiles ({visible} visible).")


if __name__ == "__main__":
    asyncio.run(main())
