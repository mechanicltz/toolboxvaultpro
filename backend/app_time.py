"""
app_time.py — single source of truth for the app's local timezone.

Everything user-facing that involves a DATE or a "today" boundary (backup
filenames, the once-per-day backup guard, the admin "today" stat window) must
use the app's local timezone, NOT UTC. Otherwise a backup taken at 8pm Central
gets stamped with tomorrow's UTC date, and "new users today" resets in the
early evening when UTC rolls over.

Timezone is configurable via APP_TIMEZONE (default America/Chicago = US Central,
which auto-handles daylight saving). Storage timestamps stay in UTC ISO8601 —
this module only affects how we *interpret* and *label* them locally.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

_DEFAULT_TZ = "America/Chicago"


def app_tz() -> ZoneInfo:
    name = os.getenv("APP_TIMEZONE", _DEFAULT_TZ) or _DEFAULT_TZ
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo(_DEFAULT_TZ)


def local_now() -> datetime:
    """Current time as an aware datetime in the app's local timezone."""
    return datetime.now(timezone.utc).astimezone(app_tz())


def to_local(dt: datetime) -> datetime:
    """Convert any datetime to the app's local timezone (assumes UTC if naive)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(app_tz())


def local_today_str() -> str:
    """Local calendar date as YYYY-MM-DD (used for the once-per-day guard)."""
    return local_now().strftime("%Y-%m-%d")


def local_stamp(dt: datetime | None = None) -> str:
    """Filename-friendly local timestamp: 'MM-DD-YYYY HH-MM'."""
    d = to_local(dt) if dt is not None else local_now()
    return d.strftime("%m-%d-%Y %H-%M")


def start_of_local_day_utc_iso() -> str:
    """UTC ISO8601 string for local midnight today — for '>= today' Mongo queries
    against `created_at` values stored as UTC ISO8601 strings."""
    now_local = local_now()
    midnight_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight_local.astimezone(timezone.utc).isoformat()
