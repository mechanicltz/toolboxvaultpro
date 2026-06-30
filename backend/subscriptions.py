"""
Toolbox Vault — Subscription / Entitlement module.

Phase 2 of the RevenueCat integration. Backend-only. The mobile app will
attach the user's RevenueCat App User ID to their account and call our
`/api/revenuecat/webhook` endpoint to keep entitlement state in sync.

Free tier rule (enforced server-side):
  - Free users may have at most FREE_TOOL_LIMIT (=15) tools.
  - POST /api/tools that would push the count above the limit returns 402.
  - Pro users (entitlement="pro" active OR a lifetime promo grant) are
    unlimited.

This module is intentionally self-contained. It exposes:
  - A FastAPI router at /api/* (mounted from server.py).
  - `enforce_tool_limit(user, db)` — call from POST /api/tools
    to raise HTTPException(402) when a free user is over the cap.
  - `is_pro(user)` — quick read check.
  - The `Subscription` Pydantic model (one document per user).
"""
from __future__ import annotations

import os
import hmac
import hashlib
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

# These are imported from server.py at mount time. We use TYPE-only
# imports to keep this module independently importable.
from typing import TYPE_CHECKING
if TYPE_CHECKING:  # pragma: no cover
    from motor.motor_asyncio import AsyncIOMotorDatabase  # noqa: F401


FREE_TOOL_LIMIT = 15
PRO_ENTITLEMENT_ID = "pro"


def active_tools_query(owner_id: str) -> dict:
    """
    Mongo filter matching a user's ACTIVE inventory — i.e. tools that count
    toward the free-tier limit and the free-tier visibility cap.

    Sold AND lost/stolen tools are EXCLUDED: they live in their own archives,
    are hidden from the default Inventory listing, and so must NOT consume a
    free-tier slot or trigger the "N hidden tools" paywall banner. Keeping this
    in one place guarantees the create-limit (`enforce_tool_limit`), the
    per-request visibility cap (server.py middleware) and the
    `hidden_tool_count` reported by GET /api/subscription all agree.
    """
    return {
        "owner_id": owner_id,
        # Set/bundle containers (is_bundle) are "Sets", not regular tools, and
        # don't consume a free-tier slot.
        "is_bundle": {"$ne": True},
        # not sold (missing field counts as not-sold)
        "is_sold": {"$ne": True},
        # not lost/stolen — lost_status is a dict when lost, None/absent otherwise
        "$and": [
            {"$or": [{"lost_status": None}, {"lost_status": {"$exists": False}}]},
            {"$or": [{"is_lost": {"$ne": True}}, {"is_lost": {"$exists": False}}]},
        ],
    }

# Loaded lazily so import doesn't blow up if env hasn't been configured
def _env(key: str, default: str = "") -> str:
    v = os.environ.get(key, "").strip()
    return v or default


# =============== Pydantic models ===============

class PromoCode(BaseModel):
    """Promo code stored in `promo_codes` collection (unrelated to RevenueCat)."""
    id: str
    code: str
    grant_type: str = "lifetime"  # lifetime | months
    months: int = 0               # only used if grant_type == 'months'
    max_redemptions: int = 1
    redeemed_count: int = 0
    redeemed_by: List[str] = Field(default_factory=list)  # user ids
    is_active: bool = True
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SubscriptionState(BaseModel):
    """Per-user subscription state — one doc per user in `subscriptions` collection."""
    user_id: str                                # our internal user id (also the RC app_user_id)
    entitlement: str = "free"                   # free | pro
    is_active: bool = False                     # alias for entitlement == 'pro' & not expired
    will_renew: bool = False
    product_id: Optional[str] = None            # pro_monthly / pro_yearly
    period_type: Optional[str] = None           # NORMAL / TRIAL / INTRO / PROMOTIONAL
    store: Optional[str] = None                 # APP_STORE / PLAY_STORE / PROMOTIONAL / STRIPE
    purchased_at: Optional[str] = None
    expires_at: Optional[str] = None            # ISO8601, may be far-future for lifetime
    unsubscribe_detected_at: Optional[str] = None
    is_lifetime: bool = False                   # set true when promo grants lifetime
    promo_code: Optional[str] = None            # which promo code granted access
    raw: Dict[str, Any] = Field(default_factory=dict)
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RedeemPromoBody(BaseModel):
    code: str


class CreatePromoBody(BaseModel):
    """Body for `POST /api/admin/promo-codes`."""
    code: Optional[str] = None        # auto-generated if blank
    grant_type: str = "lifetime"      # lifetime | months
    months: int = 12                  # only used when grant_type == 'months'
    max_redemptions: int = 1
    is_active: bool = True
    notes: str = ""


class PatchPromoBody(BaseModel):
    """Body for `PATCH /api/admin/promo-codes/{id}`. All fields optional."""
    code: Optional[str] = None
    grant_type: Optional[str] = None
    months: Optional[int] = None
    max_redemptions: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


# =============== Admin helpers ===============

def _admin_emails() -> List[str]:
    """Comma-separated email allow-list from `ADMIN_EMAILS` env var."""
    raw = _env("ADMIN_EMAILS")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def _user_email(user: Any) -> str:
    return ((getattr(user, "email", None) or
             (user.get("email") if isinstance(user, dict) else "")) or "").strip().lower()


def _user_id(user: Any) -> Optional[str]:
    return getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)


def _require_admin(user) -> None:
    """Raise 403 unless the authenticated user is in the ADMIN_EMAILS allow-list."""
    allow = _admin_emails()
    if not allow:
        # Fail closed: if no admins configured, no one can manage codes.
        raise HTTPException(403, "No admin accounts configured on the server")
    if _user_email(user) not in allow:
        raise HTTPException(403, "Admin access required")


def _gen_code(prefix: str = "PROMO") -> str:
    """Generate a short random promo code like `PROMO-A7K9-X2M1`."""
    import secrets
    import string
    pool = string.ascii_uppercase + string.digits
    chunks = ["".join(secrets.choice(pool) for _ in range(4)) for _ in range(2)]
    return f"{prefix.upper()}-{'-'.join(chunks)}"


# =============== Helpers ===============

async def get_subscription(db, user_id: str) -> SubscriptionState:
    """`db` here is the *raw* (unscoped) database. We always look up by user_id."""
    doc = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        return SubscriptionState(user_id=user_id)
    try:
        return SubscriptionState(**doc)
    except Exception:
        # Stale schema — return the safe default (free)
        return SubscriptionState(user_id=user_id, raw=doc)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_active(sub: SubscriptionState) -> bool:
    """Active if marked lifetime OR entitlement=pro with valid expires_at in the future."""
    if sub.is_lifetime:
        return True
    if sub.entitlement != "pro":
        return False
    if not sub.expires_at:
        return False
    try:
        exp = datetime.fromisoformat(sub.expires_at.replace("Z", "+00:00"))
        return exp > datetime.now(timezone.utc)
    except Exception:
        return False


async def is_pro(db, user_id: str) -> bool:
    return _is_active(await get_subscription(db, user_id))


async def enforce_tool_limit(db, user_id: str, *, additional: int = 1) -> None:
    """
    Raise HTTPException(402) if creating `additional` tools would push the
    user above the FREE tier limit. Pro / lifetime users always pass.

    Sold and lost tools are EXCLUDED from the count — they're not part of
    the active inventory the user manages, so they shouldn't consume a
    free-tier slot. This matches the user-visible Inventory listing which
    hides sold/lost items by default.

    `db` is expected to be the *raw* database (not the per-user scoped proxy)
    so we can explicitly count by owner_id.
    """
    if await is_pro(db, user_id):
        return
    # Active tools only — excludes sold + lost (see active_tools_query).
    current = await db.tools.count_documents(active_tools_query(user_id))
    if (current + additional) > FREE_TOOL_LIMIT:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "free_limit_exceeded",
                "limit": FREE_TOOL_LIMIT,
                "current": current,
                "message": (
                    f"Free plan is limited to {FREE_TOOL_LIMIT} tools. "
                    "Upgrade to Toolbox Vault Pro for unlimited."
                ),
            },
        )


# =============== Webhook (RevenueCat → us) ===============

def _verify_revenuecat_auth(authorization: Optional[str]) -> None:
    """
    RevenueCat sends an `Authorization` header with whatever string you set
    in their dashboard. Compare with our REVENUECAT_WEBHOOK_SECRET env var.
    """
    expected = _env("REVENUECAT_WEBHOOK_SECRET")
    if not expected:
        # Never accept webhooks if the secret isn't configured. Avoids
        # silently writing entitlements with an unauthenticated source.
        raise HTTPException(401, "Webhook secret not configured")
    got = (authorization or "").strip()
    # Allow either bare or "Bearer <secret>"
    if got.startswith("Bearer "):
        got = got[len("Bearer "):].strip()
    if not hmac.compare_digest(got, expected):
        raise HTTPException(401, "Invalid webhook signature")


def _coerce_iso(ts_ms: Any) -> Optional[str]:
    """Convert RevenueCat ms-since-epoch to ISO8601, return None if invalid."""
    try:
        if ts_ms is None or ts_ms == "":
            return None
        ms = int(ts_ms)
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
    except Exception:
        return None


async def _apply_event(db, event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Update the subscriptions collection from a single RevenueCat webhook event.

    Returns a tiny summary dict for logging / response body.
    """
    user_id = event.get("app_user_id") or event.get("aliases", [None])[0]
    if not user_id:
        return {"ok": False, "reason": "missing_app_user_id"}

    etype = (event.get("type") or "").upper()

    sub = await get_subscription(db, user_id)
    sub.raw = event
    sub.updated_at = _now_iso()
    sub.product_id = event.get("product_id") or sub.product_id
    sub.period_type = event.get("period_type") or sub.period_type
    sub.store = event.get("store") or sub.store
    sub.purchased_at = _coerce_iso(event.get("purchased_at_ms")) or sub.purchased_at
    sub.expires_at = _coerce_iso(event.get("expiration_at_ms")) or sub.expires_at

    # Map the event types we care about. See:
    # https://www.revenuecat.com/docs/webhooks
    if etype in ("INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION"):
        sub.entitlement = "pro"
        sub.will_renew = True
    elif etype == "NON_RENEWING_PURCHASE":
        sub.entitlement = "pro"
        sub.will_renew = False
    elif etype == "CANCELLATION":
        # User cancelled — keep entitlement until expires_at; just mark not-renewing.
        sub.will_renew = False
        sub.unsubscribe_detected_at = _now_iso()
    elif etype in ("EXPIRATION", "REFUND", "BILLING_ISSUE"):
        # Lose access immediately for refund. EXPIRATION sometimes fires with a
        # past expires_at; the _is_active check will return False for those.
        if etype == "REFUND":
            sub.entitlement = "free"
            sub.will_renew = False
            sub.expires_at = None
        # For EXPIRATION/BILLING_ISSUE we leave entitlement to be derived from
        # expires_at — _is_active() will downgrade naturally.
    elif etype == "TRANSFER":
        # The subscription moved to a different app_user_id. Down-grade old.
        sub.entitlement = "free"
        sub.will_renew = False
    elif etype == "SUBSCRIPTION_PAUSED":
        sub.will_renew = False
    elif etype == "TEMPORARY_ENTITLEMENT_GRANT":
        sub.entitlement = "pro"

    sub.is_active = _is_active(sub)

    await db.subscriptions.update_one(
        {"user_id": user_id},
        {"$set": sub.dict()},
        upsert=True,
    )
    return {"ok": True, "user_id": user_id, "type": etype, "entitlement": sub.entitlement, "is_active": sub.is_active}


# =============== Router ===============

def make_router(db, get_current_user) -> APIRouter:
    """
    Build the subscription FastAPI router.
      - db: the scoped MongoDB collection container (server.py exports `db`).
      - get_current_user: the existing auth dependency from auth.py.
    """
    router = APIRouter(prefix="/api")

    @router.get("/subscription")
    async def my_subscription(user=Depends(get_current_user)):
        uid = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
        sub = await get_subscription(db, uid)
        # Compute the user's REAL (unfiltered) tool count so the client can
        # decide whether to show the "subscription expired — N hidden items"
        # banner at the end of a capped list. We use the raw db here (not
        # the per-user proxy) to bypass the free-tier visibility cap that
        # otherwise narrows queries to 15.
        try:
            total_owned = await db.tools.count_documents({"owner_id": uid})
            # Active = non-sold, non-lost. Only these consume a free-tier slot
            # and can be hidden behind the paywall — sold/lost live in archives.
            active_owned = await db.tools.count_documents(active_tools_query(uid))
        except Exception:
            total_owned = 0
            active_owned = 0
        active = _is_active(sub)
        return {
            **sub.dict(),
            "free_limit": FREE_TOOL_LIMIT,
            "is_active": active,
            "total_tools_owned": total_owned,
            # Convenience: how many tools are HIDDEN behind the paywall right
            # now. > 0 means the client should render the upgrade banner.
            "hidden_tool_count": (
                max(0, active_owned - FREE_TOOL_LIMIT)
                if not active and active_owned > FREE_TOOL_LIMIT
                else 0
            ),
        }

    @router.post("/subscription/sync")
    async def sync_subscription(request: Request, user=Depends(get_current_user)):
        """
        Client-side entitlement sync. Called by the mobile app right after
        a successful RevenueCat purchase or on app boot. The app passes the
        verified `customerInfo` payload from the RC SDK, and we mirror the
        entitlement state into our subscriptions collection so the
        free-tier limit unlocks instantly — no webhook round-trip required.

        Body shape (lenient — RC SDK fields):
          {
            "entitlement_active": bool,        # true if `pro` entitlement is active
            "expires_at": str | null,          # ISO8601 or RC millis
            "product_id": str | null,
            "store": "APP_STORE" | "PLAY_STORE" | null,
            "will_renew": bool,
            "period_type": str | null,
            "purchased_at": str | null,
          }
        """
        uid = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
        if not uid:
            raise HTTPException(401, "Unauthorized")
        body = await request.json()

        sub = await get_subscription(db, uid)
        # Don't downgrade promo-granted lifetime subscriptions if the app
        # happens to call sync with no active entitlement (e.g. the user
        # has a promo and the SDK doesn't see any subscription).
        if sub.is_lifetime:
            return {"ok": True, "skipped": "lifetime_promo_already_active", "is_active": True}

        active = bool(body.get("entitlement_active"))
        # Accept either ISO8601 or millis-since-epoch
        exp_raw = body.get("expires_at")
        if isinstance(exp_raw, (int, float)) or (isinstance(exp_raw, str) and exp_raw.isdigit()):
            sub.expires_at = _coerce_iso(int(exp_raw))
        elif isinstance(exp_raw, str) and exp_raw:
            sub.expires_at = exp_raw
        sub.product_id = body.get("product_id") or sub.product_id
        sub.store = body.get("store") or sub.store
        sub.period_type = body.get("period_type") or sub.period_type
        sub.will_renew = bool(body.get("will_renew", sub.will_renew))
        sub.purchased_at = body.get("purchased_at") or sub.purchased_at
        sub.entitlement = "pro" if active else "free"
        sub.updated_at = _now_iso()
        sub.is_active = _is_active(sub)

        await db.subscriptions.update_one(
            {"user_id": uid},
            {"$set": sub.dict()},
            upsert=True,
        )
        return {
            "ok": True,
            "entitlement": sub.entitlement,
            "is_active": sub.is_active,
            "expires_at": sub.expires_at,
        }

    @router.post("/revenuecat/webhook")
    async def revenuecat_webhook(
        request: Request,
        authorization: Optional[str] = Header(None),
    ):
        _verify_revenuecat_auth(authorization)
        body = await request.json()
        # RC sends {"event": {...}} or {"events": [{...}, ...]} depending on version
        events: List[Dict[str, Any]] = []
        if isinstance(body, dict):
            if "event" in body and isinstance(body["event"], dict):
                events = [body["event"]]
            elif "events" in body and isinstance(body["events"], list):
                events = body["events"]
            else:
                # Some test pings post the event at the top-level
                events = [body]
        results = []
        for ev in events:
            try:
                results.append(await _apply_event(db, ev))
            except Exception as e:  # noqa: BLE001
                results.append({"ok": False, "error": str(e)[:200]})
        return {"received": len(events), "results": results}

    @router.post("/promo/redeem")
    async def redeem_promo(body: RedeemPromoBody, user=Depends(get_current_user)):
        uid = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
        code = (body.code or "").strip().upper()
        if not code:
            raise HTTPException(400, "code is required")
        promo = await db.promo_codes.find_one({"code": code}, {"_id": 0})
        if not promo:
            raise HTTPException(404, "Code not found")
        if not promo.get("is_active", True):
            raise HTTPException(400, "Code is no longer active")
        if promo.get("redeemed_count", 0) >= promo.get("max_redemptions", 1):
            raise HTTPException(400, "Code has reached its redemption limit")
        if uid in (promo.get("redeemed_by") or []):
            raise HTTPException(400, "You have already redeemed this code")

        # Apply: write a lifetime subscription locally
        sub = await get_subscription(db, uid)
        sub.entitlement = "pro"
        sub.is_active = True
        sub.is_lifetime = (promo.get("grant_type") == "lifetime")
        sub.promo_code = code
        sub.store = "PROMOTIONAL"
        sub.product_id = "promo_lifetime" if sub.is_lifetime else "promo_months"
        if sub.is_lifetime:
            # 100 years from now is "lifetime" in RevenueCat parlance
            sub.expires_at = datetime(2125, 1, 1, tzinfo=timezone.utc).isoformat()
        else:
            from dateutil.relativedelta import relativedelta  # type: ignore
            sub.expires_at = (datetime.now(timezone.utc) + relativedelta(months=int(promo.get("months", 1)))).isoformat()
        sub.purchased_at = _now_iso()
        sub.will_renew = False
        sub.updated_at = _now_iso()

        await db.subscriptions.update_one(
            {"user_id": uid},
            {"$set": sub.dict()},
            upsert=True,
        )
        # Mark code as redeemed
        await db.promo_codes.update_one(
            {"id": promo["id"]},
            {
                "$inc": {"redeemed_count": 1},
                "$addToSet": {"redeemed_by": uid},
            },
        )

        # Best-effort: also push the entitlement to RevenueCat so the user's
        # phone gets it even when offline-first cache hits RC. We don't fail
        # the request if this errors — the local sub is the source of truth.
        rc_secret = _env("REVENUECAT_SECRET_KEY")
        if rc_secret:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(
                        f"https://api.revenuecat.com/v1/subscribers/{uid}/entitlements/{PRO_ENTITLEMENT_ID}/promotional",
                        headers={
                            "Authorization": f"Bearer {rc_secret}",
                            "Content-Type": "application/json",
                        },
                        json={"duration": "lifetime" if sub.is_lifetime else f"{int(promo.get('months', 1))}_month"},
                    )
            except Exception:
                pass

        return {"ok": True, "entitlement": sub.entitlement, "is_lifetime": sub.is_lifetime, "expires_at": sub.expires_at}

    # =============== ADMIN: promo code CRUD ===============
    # All endpoints below require the caller's email to be in ADMIN_EMAILS.
    # This lets you manage codes from the app itself — no rebuilds needed.

    @router.get("/admin/promo-codes")
    async def admin_list_promos(user=Depends(get_current_user)):
        _require_admin(user)
        rows = await db.promo_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=2000)
        return rows

    @router.get("/admin/me")
    async def admin_whoami(user=Depends(get_current_user)):
        """Light endpoint the app can probe to know whether to show the Admin link."""
        return {"is_admin": _user_email(user) in _admin_emails(),
                "email": _user_email(user)}

    @router.get("/admin/user-stats")
    async def admin_user_stats(user=Depends(get_current_user)):
        """Admin-only counts of free vs subscribed accounts. Surfaced next
        to the version badge on the Home screen so the admin can glance
        at the user base size without leaving the app.

        Definitions:
          • subscribed = any user whose subscription is currently active
            (entitlement != "free" AND is_active == true). This includes
            lifetime promo redemptions and active StoreKit / Play renewals.
          • free = total registered users - subscribed users.
            Users with NO subscription document yet are counted as free
            (everyone starts on the free tier).
        """
        _require_admin(user)
        total_users = await db.users.count_documents({})
        subscribed = await db.subscriptions.count_documents(
            {"is_active": True, "entitlement": {"$ne": "free"}}
        )
        free = max(0, total_users - subscribed)
        return {"free": free, "subscribed": subscribed, "total": total_users}

    @router.post("/admin/promo-codes")
    async def admin_create_promo(body: CreatePromoBody, user=Depends(get_current_user)):
        _require_admin(user)
        import uuid

        code = (body.code or "").strip().upper() or _gen_code("PROMO")
        if body.grant_type not in ("lifetime", "months"):
            raise HTTPException(400, "grant_type must be 'lifetime' or 'months'")
        if body.grant_type == "months" and (body.months or 0) <= 0:
            raise HTTPException(400, "months must be > 0 when grant_type='months'")
        if body.max_redemptions < 1:
            raise HTTPException(400, "max_redemptions must be >= 1")

        # Codes are unique. If a collision happens, error so the admin can retry.
        existing = await db.promo_codes.find_one({"code": code}, {"_id": 0, "id": 1})
        if existing:
            raise HTTPException(409, f"Code '{code}' already exists")

        doc = PromoCode(
            id=str(uuid.uuid4()),
            code=code,
            grant_type=body.grant_type,
            months=body.months or 0,
            max_redemptions=body.max_redemptions,
            is_active=body.is_active,
            notes=(body.notes or "").strip(),
        ).dict()
        await db.promo_codes.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.patch("/admin/promo-codes/{code_id}")
    async def admin_update_promo(code_id: str, body: PatchPromoBody, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.promo_codes.find_one({"id": code_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Promo code not found")

        updates: Dict[str, Any] = {}
        if body.code is not None:
            new_code = body.code.strip().upper()
            if not new_code:
                raise HTTPException(400, "code cannot be empty")
            if new_code != existing.get("code"):
                clash = await db.promo_codes.find_one({"code": new_code}, {"_id": 0, "id": 1})
                if clash:
                    raise HTTPException(409, f"Another code with name '{new_code}' already exists")
            updates["code"] = new_code
        if body.grant_type is not None:
            if body.grant_type not in ("lifetime", "months"):
                raise HTTPException(400, "grant_type must be 'lifetime' or 'months'")
            updates["grant_type"] = body.grant_type
        if body.months is not None:
            if body.months < 0:
                raise HTTPException(400, "months must be >= 0")
            updates["months"] = body.months
        if body.max_redemptions is not None:
            if body.max_redemptions < 1:
                raise HTTPException(400, "max_redemptions must be >= 1")
            if body.max_redemptions < existing.get("redeemed_count", 0):
                raise HTTPException(400, "max_redemptions cannot be lower than current redeemed_count")
            updates["max_redemptions"] = body.max_redemptions
        if body.is_active is not None:
            updates["is_active"] = bool(body.is_active)
        if body.notes is not None:
            updates["notes"] = (body.notes or "").strip()

        if not updates:
            raise HTTPException(400, "No fields to update")

        await db.promo_codes.update_one({"id": code_id}, {"$set": updates})
        merged = {**existing, **updates}
        merged.pop("_id", None)
        return merged

    @router.delete("/admin/promo-codes/{code_id}")
    async def admin_delete_promo(code_id: str, user=Depends(get_current_user)):
        _require_admin(user)
        res = await db.promo_codes.delete_one({"id": code_id})
        if not res.deleted_count:
            raise HTTPException(404, "Promo code not found")
        return {"ok": True, "deleted": code_id}

    return router


# =============== Public surface ===============
__all__ = [
    "FREE_TOOL_LIMIT",
    "PRO_ENTITLEMENT_ID",
    "active_tools_query",
    "SubscriptionState",
    "PromoCode",
    "RedeemPromoBody",
    "get_subscription",
    "is_pro",
    "enforce_tool_limit",
    "make_router",
]
