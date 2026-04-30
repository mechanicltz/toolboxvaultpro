"""
RevenueCat ↔ Toolbox Tracker subscription sync.

This module provides:

  POST /api/subscription/sync-revenuecat
    - Authenticated.
    - Called from the React Native client right after a successful
      paywall purchase OR whenever the SDK pushes an updated
      CustomerInfo. The client posts a small projection of the
      entitlement state and we write it onto user.subscription.

  POST /api/webhooks/revenuecat
    - Public endpoint, but authenticated via the
      `Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH>` header
      configured in the RevenueCat dashboard. RevenueCat will POST
      every subscription lifecycle event (INITIAL_PURCHASE, RENEWAL,
      CANCELLATION, EXPIRATION, …) — we use these to keep the user
      record in sync server-to-server, so the app stays correct even
      when the client never reopens the app.

The backend remains the canonical source of truth for `user.subscription`
— the only reason RevenueCat is involved is to actually charge the user.
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import (
    User,
    Subscription,
    TIER_FREE,
    TIER_MONTHLY,
    TIER_YEARLY,
    TIER_LIFETIME,
    ALL_TIERS,
    now_iso,
)

logger = logging.getLogger("revenuecat")

# Premium entitlement identifier configured in RevenueCat dashboard.
PREMIUM_ENTITLEMENT = os.environ.get("REVENUECAT_PREMIUM_ENTITLEMENT", "premium")

# Shared secret used to authenticate RevenueCat → backend webhook calls.
# Configure the SAME value in:
#    RevenueCat dashboard → Project → Integrations → Webhooks → Authorization header
WEBHOOK_AUTH = os.environ.get("REVENUECAT_WEBHOOK_AUTH", "")


# ---------- Request models ----------
class RCEntitlementPayload(BaseModel):
    """Projection of `CustomerInfo.entitlements.active['premium']` from the
    React Native SDK. All optional because a free user submits an empty
    payload."""

    is_active: bool = False
    product_identifier: Optional[str] = None
    expires_at: Optional[str] = None  # ISO-8601 string
    will_renew: Optional[bool] = None
    period_type: Optional[str] = None  # "NORMAL" | "TRIAL" | "INTRO"
    store: Optional[str] = None  # "APP_STORE" | "PLAY_STORE" | "STRIPE" | "UNKNOWN_STORE"
    original_app_user_id: Optional[str] = None
    revenuecat_app_user_id: Optional[str] = None


# ---------- Helpers ----------
def _tier_from_product_id(product_id: Optional[str]) -> str:
    """Map a RevenueCat / store product identifier to our tier label.

    We accept any reasonable product naming convention — anything that
    contains "life" → lifetime, "year" → yearly, "month" → monthly.
    """
    if not product_id:
        return TIER_MONTHLY  # safe default for an active premium entitlement
    p = product_id.lower()
    if "life" in p:
        return TIER_LIFETIME
    if "year" in p or "annual" in p:
        return TIER_YEARLY
    if "month" in p:
        return TIER_MONTHLY
    return TIER_MONTHLY


def _build_subscription(
    *,
    is_active: bool,
    product_id: Optional[str],
    expires_at: Optional[str],
    will_renew: Optional[bool],
) -> Subscription:
    """Construct a Subscription matching the existing app schema."""
    if not is_active:
        # Mark expired (auth.evaluate_subscription_status will normalise to
        # free tier downstream). We don't drop straight to FREE here so the
        # UI can still show "active until …" if the user has a grace period.
        return Subscription(
            tier=TIER_FREE,
            status="expired",
            expires_at=None,
            auto_renew=False,
            cancelled_at=None,
        )

    tier = _tier_from_product_id(product_id)

    if tier == TIER_LIFETIME:
        return Subscription(
            tier=TIER_LIFETIME,
            status="active",
            started_at=now_iso(),
            expires_at=None,
            auto_renew=False,
        )

    auto_renew = True if will_renew is None else bool(will_renew)
    status = "active" if auto_renew else "cancelled"
    cancelled_at = None if auto_renew else now_iso()

    return Subscription(
        tier=tier,
        status=status,
        started_at=now_iso(),
        expires_at=expires_at,
        auto_renew=auto_renew,
        cancelled_at=cancelled_at,
    )


async def _persist_subscription(db, user_id: str, sub: Subscription, *, source: str) -> None:
    extra: Dict[str, Any] = {
        "subscription": sub.dict(),
        "updated_at": now_iso(),
        "subscription_source": source,
        "subscription_synced_at": now_iso(),
    }
    await db.users.update_one({"id": user_id}, {"$set": extra})
    logger.info("[revenuecat] %s → user=%s tier=%s expires=%s", source, user_id, sub.tier, sub.expires_at)


# ---------- Router factory ----------
def make_revenuecat_router(get_db, get_current_user) -> APIRouter:
    """Build the RevenueCat router. We accept `get_db` and
    `get_current_user` as args so this module stays decoupled from
    server.py's import graph."""

    router = APIRouter(prefix="/api")

    # ---------- Client-driven sync ----------
    @router.post("/subscription/sync-revenuecat")
    async def sync_revenuecat(
        payload: RCEntitlementPayload,
        user: User = Depends(get_current_user),
    ):
        sub = _build_subscription(
            is_active=payload.is_active,
            product_id=payload.product_identifier,
            expires_at=payload.expires_at,
            will_renew=payload.will_renew,
        )
        db = get_db()
        await _persist_subscription(db, user.id, sub, source="client_sync")
        return {"ok": True, "subscription": sub.dict()}

    # ---------- Server-to-server webhook ----------
    @router.post("/webhooks/revenuecat")
    async def webhook(request: Request):
        # Authenticate via the shared bearer secret configured in the RC
        # dashboard. If WEBHOOK_AUTH is unset we run in "dev open mode"
        # and accept any request — log a loud warning so it's obvious in
        # production.
        if WEBHOOK_AUTH:
            auth_header = request.headers.get("authorization") or ""
            expected = f"Bearer {WEBHOOK_AUTH}"
            if auth_header != expected:
                # RevenueCat lets you set a freeform header value too —
                # check both styles to be tolerant.
                if auth_header != WEBHOOK_AUTH:
                    raise HTTPException(401, "Invalid webhook authorization")
        else:
            logger.warning("[revenuecat] webhook running unauthenticated — set REVENUECAT_WEBHOOK_AUTH")

        try:
            body = await request.json()
        except Exception as e:  # pragma: no cover
            raise HTTPException(400, f"Invalid JSON: {e}")

        event = (body or {}).get("event") or {}
        event_type = event.get("type") or "UNKNOWN"
        app_user_id = event.get("app_user_id") or event.get("original_app_user_id")

        if not app_user_id:
            logger.warning("[revenuecat webhook] %s — missing app_user_id; skipping", event_type)
            return {"ok": True, "skipped": True}

        # Look up the matching user in MongoDB.
        db = get_db()
        user_doc = await db.users.find_one({"id": app_user_id}, {"_id": 0})
        if not user_doc:
            logger.warning(
                "[revenuecat webhook] %s — user_id=%s not found", event_type, app_user_id
            )
            return {"ok": True, "user_not_found": True}

        # Translate the event into a Subscription update.
        product_id = event.get("product_id") or event.get("new_product_id")
        expiration_at_ms = event.get("expiration_at_ms")
        expires_iso: Optional[str] = None
        if expiration_at_ms:
            try:
                expires_iso = datetime.fromtimestamp(
                    int(expiration_at_ms) / 1000, tz=timezone.utc
                ).isoformat()
            except Exception:
                expires_iso = None

        # Active states — all the "user has access right now" event types.
        ACTIVE_EVENTS = {
            "INITIAL_PURCHASE",
            "RENEWAL",
            "PRODUCT_CHANGE",
            "UNCANCELLATION",
            "NON_RENEWING_PURCHASE",
            "TEMPORARY_ENTITLEMENT_GRANT",
        }
        # Inactive / loss-of-access events.
        INACTIVE_EVENTS = {
            "EXPIRATION",
            "BILLING_ISSUE",
            "REFUND",
            "SUBSCRIBER_ALIAS_DEPRECATED",
        }
        # CANCELLATION just toggles auto-renew off — user keeps access until expires.
        CANCELLED_KEEP_ACCESS_EVENTS = {"CANCELLATION"}

        if event_type in ACTIVE_EVENTS:
            sub = _build_subscription(
                is_active=True,
                product_id=product_id,
                expires_at=expires_iso,
                will_renew=True,
            )
        elif event_type in CANCELLED_KEEP_ACCESS_EVENTS:
            sub = _build_subscription(
                is_active=True,
                product_id=product_id,
                expires_at=expires_iso,
                will_renew=False,
            )
        elif event_type in INACTIVE_EVENTS:
            sub = _build_subscription(
                is_active=False,
                product_id=product_id,
                expires_at=expires_iso,
                will_renew=False,
            )
        else:
            # Unknown event — log and acknowledge so RC doesn't retry.
            logger.info("[revenuecat webhook] ignoring event_type=%s", event_type)
            return {"ok": True, "ignored": event_type}

        await _persist_subscription(
            db, app_user_id, sub, source=f"webhook:{event_type}"
        )
        return {"ok": True, "event": event_type, "tier": sub.tier}

    return router
