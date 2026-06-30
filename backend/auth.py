"""Auth utilities for Toolbox Vault.

JWT-based auth with bcrypt password hashing.

The app is 100% free — there are NO subscription tiers, NO free-tier limits,
and NO premium features. Every user has unlimited access to everything.
(Subscriptions may be reintroduced in a future release.)
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import HTTPException
from pydantic import BaseModel, EmailStr, Field


# ---------- Config ----------
JWT_SECRET = os.environ.get("JWT_SECRET", "tooltracker-dev-secret-change-in-prod-2025")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 90  # long-lived tokens for mobile apps


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    password_hash: str
    name: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class UserPublic(BaseModel):
    id: str
    email: str
    name: Optional[str] = ""
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
