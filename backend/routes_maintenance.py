"""Maintenance schedules & service events.

Extracted from server.py (god-file refactor B3). Registered on the shared
api_router via register_maintenance_routes(); all dependencies come from core/models/helpers so this
module never imports server (no cycle).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException

from core import db
from models import (
    now_iso, Tool,
    MaintenanceSchedule, MaintenanceScheduleCreate, MaintenanceScheduleUpdate,
    ServiceEvent, ServiceEventCreate,
)

logger = logging.getLogger("routes_maintenance")


def register_maintenance_routes(api_router: APIRouter) -> None:
    # ---------- Maintenance Schedules ----------
    def _calc_next_due(last: Optional[str], months: int) -> Optional[str]:
        if not last or not months:
            return None
        try:
            d = datetime.strptime(last, "%Y-%m-%d")
            # Approximate by adding months * 30.4 days; simpler than dateutil
            new_month = d.month + months
            new_year = d.year + (new_month - 1) // 12
            new_month = ((new_month - 1) % 12) + 1
            # Clamp day
            try:
                nd = d.replace(year=new_year, month=new_month)
            except ValueError:
                # Day overflow (e.g., Feb 30) — back off
                nd = d.replace(year=new_year, month=new_month, day=28)
            return nd.strftime("%Y-%m-%d")
        except Exception:
            return None


    @api_router.post("/tools/{tool_id}/maintenance", response_model=Tool)
    async def add_maintenance(tool_id: str, payload: MaintenanceScheduleCreate):
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        schedules = tool.get("maintenance") or []
        new_sch = MaintenanceSchedule(
            type=payload.type or "Service",
            interval_months=payload.interval_months or 12,
            last_done_date=payload.last_done_date,
            next_due_date=_calc_next_due(payload.last_done_date, payload.interval_months or 12),
            notes=payload.notes or "",
        ).model_dump()
        schedules.append(new_sch)
        await db.tools.update_one({"id": tool_id}, {"$set": {"maintenance": schedules, "updated_at": now_iso()}})
        return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


    @api_router.put("/tools/{tool_id}/maintenance/{sch_id}", response_model=Tool)
    async def update_maintenance(tool_id: str, sch_id: str, payload: MaintenanceScheduleUpdate):
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        schedules = tool.get("maintenance") or []
        found = False
        for sch in schedules:
            if sch.get("id") == sch_id:
                found = True
                if payload.type is not None:
                    sch["type"] = payload.type
                if payload.interval_months is not None:
                    sch["interval_months"] = payload.interval_months
                if payload.last_done_date is not None:
                    sch["last_done_date"] = payload.last_done_date
                if payload.notes is not None:
                    sch["notes"] = payload.notes
                sch["next_due_date"] = _calc_next_due(sch.get("last_done_date"), sch.get("interval_months", 12))
                break
        if not found:
            raise HTTPException(404, "Schedule not found")
        await db.tools.update_one({"id": tool_id}, {"$set": {"maintenance": schedules, "updated_at": now_iso()}})
        return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


    @api_router.delete("/tools/{tool_id}/maintenance/{sch_id}", response_model=Tool)
    async def delete_maintenance(tool_id: str, sch_id: str):
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        schedules = [s for s in (tool.get("maintenance") or []) if s.get("id") != sch_id]
        await db.tools.update_one({"id": tool_id}, {"$set": {"maintenance": schedules, "updated_at": now_iso()}})
        return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


    @api_router.post("/tools/{tool_id}/maintenance/{sch_id}/service", response_model=Tool)
    async def log_service_event(tool_id: str, sch_id: str, payload: ServiceEventCreate):
        tool = await db.tools.find_one({"id": tool_id}, {"_id": 0})
        if not tool:
            raise HTTPException(404, "Tool not found")
        schedules = tool.get("maintenance") or []
        found = False
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for sch in schedules:
            if sch.get("id") == sch_id:
                found = True
                event = ServiceEvent(
                    date=payload.date or today,
                    cost=payload.cost or 0.0,
                    technician=payload.technician or "",
                    notes=payload.notes or "",
                ).model_dump()
                sch.setdefault("history", []).append(event)
                sch["last_done_date"] = event["date"]
                sch["next_due_date"] = _calc_next_due(sch["last_done_date"], sch.get("interval_months", 12))
                break
        if not found:
            raise HTTPException(404, "Schedule not found")
        await db.tools.update_one({"id": tool_id}, {"$set": {"maintenance": schedules, "updated_at": now_iso()}})
        return Tool(**(await db.tools.find_one({"id": tool_id}, {"_id": 0})))


    @api_router.get("/maintenance/upcoming")
    async def upcoming_maintenance(days: int = 30):
        """Return all maintenance schedules with next_due in [today, today+days] OR overdue."""
        now = datetime.now(timezone.utc)
        horizon = (now + timedelta(days=days)).strftime("%Y-%m-%d")
        today = now.strftime("%Y-%m-%d")
        out: List[Dict[str, Any]] = []
        overdue_count = 0
        due_soon_count = 0
        async for tool in db.tools.find(
            {"maintenance": {"$exists": True, "$ne": []}},
            {"_id": 0, "id": 1, "name": 1, "photos": 1, "maintenance": 1},
        ):
            for sch in (tool.get("maintenance") or []):
                nd = sch.get("next_due_date") or ""
                if not nd:
                    continue
                if nd <= horizon:  # overdue or within horizon
                    is_overdue = nd < today
                    if is_overdue:
                        overdue_count += 1
                    else:
                        due_soon_count += 1
                    out.append({
                        "tool_id": tool.get("id"),
                        "tool_name": tool.get("name"),
                        "tool_photo": (tool.get("photos") or [None])[0] if tool.get("photos") else None,
                        "schedule_id": sch.get("id"),
                        "type": sch.get("type"),
                        "interval_months": sch.get("interval_months"),
                        "last_done_date": sch.get("last_done_date"),
                        "next_due_date": nd,
                        "is_overdue": is_overdue,
                        "notes": sch.get("notes", ""),
                    })
        out.sort(key=lambda x: x["next_due_date"] or "9999-12-31")
        return {
            "items": out,
            "total": len(out),
            "overdue": overdue_count,
            "due_soon": due_soon_count,
        }

