"""Auth + Subscription utilities for Tool Tracker.

JWT-based auth with bcrypt password hashing. Subscriptions are MOCKED — no
real payment is processed. Users can switch tiers freely.

Tiers:
  - free:     10 tools, 1 dealer, 1 agent per dealer
  - monthly:  unlimited (renews monthly, mock)
  - yearly:   unlimited (renews yearly, mock)
  - lifetime: unlimited (no expiry)
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr, Field


# ---------- Config ----------
JWT_SECRET = os.environ.get("JWT_SECRET", "tooltracker-dev-secret-change-in-prod-2025")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 90  # long-lived tokens for mobile apps


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Subscription Tiers ----------
TIER_FREE = "free"
TIER_MONTHLY = "monthly"
TIER_YEARLY = "yearly"
TIER_LIFETIME = "lifetime"
ALL_TIERS = [TIER_FREE, TIER_MONTHLY, TIER_YEARLY, TIER_LIFETIME]

TIER_PRICES = {
    TIER_FREE: 0.0,
    TIER_MONTHLY: 9.99,
    TIER_YEARLY: 100.0,
    TIER_LIFETIME: 499.0,
}

# Free tier limits
FREE_LIMITS = {
    "tools": 10,
    "dealers": 1,
    "agents_per_dealer": 1,
}


def is_premium_tier(tier: Optional[str]) -> bool:
    return tier in (TIER_MONTHLY, TIER_YEARLY, TIER_LIFETIME)


# ---------- Models ----------
class Subscription(BaseModel):
    tier: str = TIER_FREE
    status: str = "active"  # active | cancelled | expired
    started_at: Optional[str] = None
    expires_at: Optional[str] = None  # null for free / lifetime
    cancelled_at: Optional[str] = None
    auto_renew: bool = True


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    password_hash: str
    name: Optional[str] = ""
    subscription: Subscription = Field(default_factory=Subscription)
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class UserPublic(BaseModel):
    id: str
    email: str
    name: Optional[str] = ""
    subscription: Subscription
    created_at: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


class SubscribeRequest(BaseModel):
    tier: str  # monthly | yearly | lifetime


# ---------- Password Hashing ----------
def hash_password(password: str) -> str:
    if not password or len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


# ---------- JWT ----------
def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(401, "Invalid token")
        return sub
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


# ---------- Subscription Helpers ----------
def make_subscription_for_tier(tier: str) -> Subscription:
    if tier not in ALL_TIERS:
        raise HTTPException(400, f"Invalid tier. Must be one of {ALL_TIERS}")
    now = datetime.now(timezone.utc)
    if tier == TIER_FREE:
        return Subscription(tier=TIER_FREE, status="active", started_at=now.isoformat())
    if tier == TIER_MONTHLY:
        return Subscription(
            tier=TIER_MONTHLY,
            status="active",
            started_at=now.isoformat(),
            expires_at=(now + timedelta(days=30)).isoformat(),
            auto_renew=True,
        )
    if tier == TIER_YEARLY:
        return Subscription(
            tier=TIER_YEARLY,
            status="active",
            started_at=now.isoformat(),
            expires_at=(now + timedelta(days=365)).isoformat(),
            auto_renew=True,
        )
    if tier == TIER_LIFETIME:
        return Subscription(
            tier=TIER_LIFETIME,
            status="active",
            started_at=now.isoformat(),
            expires_at=None,
            auto_renew=False,
        )
    return Subscription()


def evaluate_subscription_status(sub: Dict[str, Any]) -> Dict[str, Any]:
    """If a paid subscription has expired and is cancelled (or not auto-renewing),
    downgrade it to free. Returns the (possibly updated) subscription dict.
    """
    if not sub:
        return Subscription().dict()
    tier = sub.get("tier", TIER_FREE)
    if tier in (TIER_FREE, TIER_LIFETIME):
        return sub
    expires_at = sub.get("expires_at")
    if not expires_at:
        return sub
    try:
        exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except Exception:
        return sub
    if datetime.now(timezone.utc) > exp_dt:
        # expired
        if not sub.get("auto_renew", True) or sub.get("status") == "cancelled":
            sub["tier"] = TIER_FREE
            sub["status"] = "expired"
            sub["expires_at"] = None
        else:
            # mock: auto-renew
            now = datetime.now(timezone.utc)
            days = 30 if tier == TIER_MONTHLY else 365
            sub["expires_at"] = (now + timedelta(days=days)).isoformat()
            sub["status"] = "active"
    return sub
