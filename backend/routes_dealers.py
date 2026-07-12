"""Dealer routes — dealers, agents, balance transactions and the per-account
recurring payment schedules.

Extracted from server.py (god-file refactor B3). Registered on the shared
api_router via register_dealer_routes(); dependencies come from core/models
so this module never imports server.
"""

from datetime import datetime, timezone, timedelta
from typing import List

from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user
from auth import User
from routes_taxonomy import _ensure_brand_saved
from models import (
    now_iso, Dealer, DealerCreate, DealerUpdate,
    Agent, AgentCreate, TransactionCreate, BalanceTransaction,
    AccountSchedule, PAYMENT_FREQUENCIES,
)


def register_dealer_routes(api_router: APIRouter) -> None:
    # ---------- Dealers ----------
    @api_router.post("/dealers", response_model=Dealer)
    async def create_dealer(payload: DealerCreate, user: User = Depends(get_current_user)):
        d = Dealer(**payload.dict())
        await db.dealers.insert_one(d.dict())
        # A dealer's name is also a brand the user buys — surface it in the
        # Brand typeahead automatically (idempotent).
        await _ensure_brand_saved(d.name)
        return d


    @api_router.get("/dealers", response_model=List[Dealer])
    async def list_dealers():
        items = await db.dealers.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
        return [Dealer(**i) for i in items]


    @api_router.get("/dealers/{dealer_id}", response_model=Dealer)
    async def get_dealer(dealer_id: str):
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        return Dealer(**d)


    @api_router.put("/dealers/{dealer_id}", response_model=Dealer)
    async def update_dealer(dealer_id: str, payload: DealerUpdate):
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        updates = {k: v for k, v in payload.dict().items() if v is not None}
        await db.dealers.update_one({"id": dealer_id}, {"$set": updates})
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})

        # Propagate name change to every tool with this dealer_id cached.
        if "name" in updates and updates["name"] != d.get("name"):
            await db.tools.update_many(
                {"dealer_id": dealer_id},
                {"$set": {"dealer_name": updates["name"]}},
            )

        return Dealer(**new)


    @api_router.delete("/dealers/{dealer_id}")
    async def delete_dealer(dealer_id: str):
        res = await db.dealers.delete_one({"id": dealer_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Dealer not found")
        return {"ok": True}


    @api_router.post("/dealers/{dealer_id}/agents", response_model=Dealer)
    async def add_agent(dealer_id: str, payload: AgentCreate, user: User = Depends(get_current_user)):
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        agent = Agent(**payload.dict())
        agents = d.get("agents") or []
        agents.append(agent.dict())
        update = {"agents": agents}
        if not d.get("current_agent_id"):
            update["current_agent_id"] = agent.id
        await db.dealers.update_one({"id": dealer_id}, {"$set": update})
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)


    @api_router.put("/dealers/{dealer_id}/agents/{agent_id}", response_model=Dealer)
    async def update_agent(dealer_id: str, agent_id: str, payload: AgentCreate):
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        agents = d.get("agents") or []
        found = False
        for a in agents:
            if a.get("id") == agent_id:
                a["name"] = payload.name
                a["phone"] = payload.phone or ""
                a["email"] = payload.email or ""
                a["location"] = payload.location or ""
                a["notes"] = payload.notes or ""
                found = True
                break
        if not found:
            raise HTTPException(404, "Agent not found")
        await db.dealers.update_one({"id": dealer_id}, {"$set": {"agents": agents}})
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)


    @api_router.delete("/dealers/{dealer_id}/agents/{agent_id}", response_model=Dealer)
    async def remove_agent(dealer_id: str, agent_id: str):
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        agents = [a for a in (d.get("agents") or []) if a.get("id") != agent_id]
        update = {"agents": agents}
        if d.get("current_agent_id") == agent_id:
            update["current_agent_id"] = agents[0]["id"] if agents else None
        await db.dealers.update_one({"id": dealer_id}, {"$set": update})
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)


    @api_router.post("/dealers/{dealer_id}/current-agent/{agent_id}", response_model=Dealer)
    async def set_current_agent(dealer_id: str, agent_id: str):
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        agents = d.get("agents") or []
        if not any(a.get("id") == agent_id for a in agents):
            raise HTTPException(400, "Agent not found in dealer")
        # Mark previous current's ended_at, mark this one's started_at if needed
        now = now_iso()
        for a in agents:
            if a.get("id") == d.get("current_agent_id") and a.get("id") != agent_id:
                if not a.get("ended_at"):
                    a["ended_at"] = now
            if a.get("id") == agent_id:
                a["ended_at"] = None
                if not a.get("started_at"):
                    a["started_at"] = now
        await db.dealers.update_one(
            {"id": dealer_id},
            {"$set": {"current_agent_id": agent_id, "agents": agents}},
        )
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)


    # ---------- Dealer Balance Transactions ----------
    @api_router.post("/dealers/{dealer_id}/transactions", response_model=Dealer)
    async def add_dealer_transaction(dealer_id: str, payload: TransactionCreate):
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        if payload.account not in ("credit", "personal"):
            raise HTTPException(400, "account must be 'credit' or 'personal'")
        if payload.type not in ("payment", "charge"):
            raise HTTPException(400, "type must be 'payment' or 'charge'")
        amount = float(payload.amount or 0)
        if amount <= 0:
            raise HTTPException(400, "amount must be > 0")
        tx = BalanceTransaction(
            account=payload.account,
            type=payload.type,
            amount=amount,
            note=payload.note or "",
            date=payload.date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        ).model_dump()
        txs = list(d.get("transactions") or [])
        txs.append(tx)
        # Update balance: payment decreases, charge increases
        delta = -amount if payload.type == "payment" else amount
        field = "credit_balance" if payload.account == "credit" else "personal_balance"
        new_balance = float(d.get(field) or 0.0) + delta
        await db.dealers.update_one(
            {"id": dealer_id},
            {"$set": {field: new_balance, "transactions": txs}},
        )
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)


    # ---------- Dealer Payment Accounts (scheduled recurring payments) ----------
    def _advance_payment_date(date_str: str, frequency: str) -> str:
        """Return the next due date after `date_str` for the given frequency."""
        import calendar
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
        if frequency == "weekly":
            d = d + timedelta(days=7)
        elif frequency == "biweekly":
            d = d + timedelta(days=14)
        else:  # monthly — add one calendar month, clamping the day
            month = d.month + 1
            year = d.year
            if month > 12:
                month, year = 1, year + 1
            day = min(d.day, calendar.monthrange(year, month)[1])
            d = d.replace(year=year, month=month, day=day)
        return d.isoformat()


    # ---------- Per-account payment schedules (Truck / Credit) ----------
    def _schedule_field(account: str) -> str:
        return "credit_schedule" if account == "credit" else "personal_schedule"


    @api_router.put("/dealers/{dealer_id}/accounts/{account}/schedule", response_model=Dealer)
    async def set_account_schedule(
        dealer_id: str,
        account: str,
        payload: AccountSchedule,
        user: User = Depends(get_current_user),
    ):
        """Create / update the recurring-payment schedule on a single dealer account
        (account = 'credit' or 'personal'/truck)."""
        if account not in ("credit", "personal"):
            raise HTTPException(400, "account must be 'credit' or 'personal'")
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        if payload.frequency not in PAYMENT_FREQUENCIES:
            raise HTTPException(400, "frequency must be weekly, biweekly, or monthly")
        sched = payload.model_dump()
        if not sched.get("next_due_date"):
            sched["next_due_date"] = ""
        await db.dealers.update_one(
            {"id": dealer_id}, {"$set": {_schedule_field(account): sched}},
        )
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)


    @api_router.delete("/dealers/{dealer_id}/accounts/{account}/schedule", response_model=Dealer)
    async def clear_account_schedule(
        dealer_id: str, account: str, user: User = Depends(get_current_user),
    ):
        if account not in ("credit", "personal"):
            raise HTTPException(400, "account must be 'credit' or 'personal'")
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        await db.dealers.update_one(
            {"id": dealer_id}, {"$set": {_schedule_field(account): None}},
        )
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)


    @api_router.post("/dealers/{dealer_id}/accounts/{account}/confirm-payment", response_model=Dealer)
    async def confirm_account_payment(
        dealer_id: str, account: str, user: User = Depends(get_current_user),
    ):
        """Record the scheduled payment as made today: logs a 'payment' transaction
        (decreases the balance), then advances next_due_date to the next cycle."""
        if account not in ("credit", "personal"):
            raise HTTPException(400, "account must be 'credit' or 'personal'")
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        sched = d.get(_schedule_field(account)) or {}
        if not sched or not sched.get("enabled"):
            raise HTTPException(400, "No active payment schedule for this account")
        amount = float(sched.get("amount") or 0)
        if amount <= 0:
            raise HTTPException(400, "Schedule amount must be greater than 0")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        due = sched.get("next_due_date") or today
        tx = BalanceTransaction(
            account=account, type="payment", amount=amount,
            note="Scheduled payment", date=today,
        ).model_dump()
        txs = list(d.get("transactions") or [])
        txs.append(tx)
        field = "credit_balance" if account == "credit" else "personal_balance"
        new_balance = float(d.get(field) or 0.0) - amount
        try:
            sched["next_due_date"] = _advance_payment_date(due, sched.get("frequency", "monthly"))
        except Exception:
            sched["next_due_date"] = _advance_payment_date(today, sched.get("frequency", "monthly"))
        sched["last_paid_date"] = today
        await db.dealers.update_one(
            {"id": dealer_id},
            {"$set": {field: new_balance, "transactions": txs, _schedule_field(account): sched}},
        )
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)


    @api_router.post("/dealers/{dealer_id}/accounts/{account}/skip-payment", response_model=Dealer)
    async def skip_account_payment(
        dealer_id: str, account: str, user: User = Depends(get_current_user),
    ):
        """Mark the current scheduled payment as SKIPPED (#27): no transaction is
        logged and the balance is unchanged. next_due_date simply advances to the
        next cycle so the app stops re-prompting for this date and moves on to the
        next scheduled payment."""
        if account not in ("credit", "personal"):
            raise HTTPException(400, "account must be 'credit' or 'personal'")
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        sched = d.get(_schedule_field(account)) or {}
        if not sched or not sched.get("enabled"):
            raise HTTPException(400, "No active payment schedule for this account")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        due = sched.get("next_due_date") or today
        try:
            sched["next_due_date"] = _advance_payment_date(due, sched.get("frequency", "monthly"))
        except Exception:
            sched["next_due_date"] = _advance_payment_date(today, sched.get("frequency", "monthly"))
        sched["last_skipped_date"] = today
        await db.dealers.update_one(
            {"id": dealer_id},
            {"$set": {_schedule_field(account): sched}},
        )
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)


    @api_router.get("/dealers/payments/upcoming")
    async def dealer_payments_upcoming(days: int = 7, user: User = Depends(get_current_user)):
        """Account schedules due within `days` days (negative days_until = overdue).
        Powers the Home banner, the per-dealer sub-line and local reminders."""
        dealers = await db.dealers.find({}, {"_id": 0}).to_list(2000)
        today = datetime.now(timezone.utc).date()
        horizon = today + timedelta(days=max(0, days))
        out = []
        for d in dealers:
            for account, label in (("personal", "Truck"), ("credit", "Credit")):
                sched = d.get(_schedule_field(account)) or {}
                if not sched or not sched.get("enabled"):
                    continue
                nd = sched.get("next_due_date")
                if not nd:
                    continue
                try:
                    due = datetime.strptime(nd, "%Y-%m-%d").date()
                except Exception:
                    continue
                if due <= horizon:
                    out.append({
                        "id": f"{d.get('id')}:{account}",
                        "dealer_id": d.get("id"),
                        "dealer_name": d.get("name", ""),
                        "account": account,
                        "account_label": label,
                        "amount": float(sched.get("amount") or 0),
                        "frequency": sched.get("frequency"),
                        "next_due_date": nd,
                        "remind_day_before": bool(sched.get("remind_day_before", True)),
                        "remind_day_of": bool(sched.get("remind_day_of", True)),
                        "days_until": (due - today).days,
                        "overdue": due < today,
                    })
        out.sort(key=lambda x: x["next_due_date"])
        return {"days": days, "count": len(out), "items": out}


    @api_router.delete("/dealers/{dealer_id}/transactions/{tx_id}", response_model=Dealer)
    async def delete_dealer_transaction(dealer_id: str, tx_id: str):
        d = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Dealer not found")
        txs = list(d.get("transactions") or [])
        target = next((t for t in txs if t.get("id") == tx_id), None)
        if not target:
            raise HTTPException(404, "Transaction not found")
        # Reverse the balance impact
        amount = float(target.get("amount") or 0)
        delta = amount if target.get("type") == "payment" else -amount
        field = "credit_balance" if target.get("account") == "credit" else "personal_balance"
        new_balance = float(d.get(field) or 0.0) + delta
        txs = [t for t in txs if t.get("id") != tx_id]
        await db.dealers.update_one(
            {"id": dealer_id},
            {"$set": {field: new_balance, "transactions": txs}},
        )
        new = await db.dealers.find_one({"id": dealer_id}, {"_id": 0})
        return Dealer(**new)

