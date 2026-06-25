"""CI-only helper: grant the guard-test user a lifetime (Pro) subscription.

The guard suite registers a brand-new `ryan@ryan.com` on a throwaway Mongo.
Registration seeds 15 demo tools — exactly the FREE-tier limit — so the very
first tool-creation guard test (`test_set_tool_lifecycle`) would otherwise hit
402 `free_limit_exceeded`. Tool-creation tests are meant to run against a Pro
account, so we flip this CI user to a lifetime subscription before the suite
runs. This only ever touches the disposable CI database.

Usage (from the workflow):  python tests/ci_grant_pro.py ryan@ryan.com
"""
from __future__ import annotations

import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient


async def main(email: str) -> int:
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "toolbox_ci")
    db = AsyncIOMotorClient(mongo_url)[db_name]

    user = await db.users.find_one({"email": email.strip().lower()}, {"_id": 0, "id": 1})
    if not user:
        print(f"::error::ci_grant_pro: user {email!r} not found in {db_name}")
        return 1

    uid = user["id"]
    await db.subscriptions.update_one(
        {"user_id": uid},
        {"$set": {
            "user_id": uid,
            "entitlement": "pro",
            "is_active": True,
            "is_lifetime": True,
            "store": "PROMOTIONAL",
            "product_id": "ci_lifetime",
        }},
        upsert=True,
    )
    print(f"ci_grant_pro: granted lifetime Pro to {email} (user_id={uid})")
    return 0


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "ryan@ryan.com"
    raise SystemExit(asyncio.run(main(target)))
