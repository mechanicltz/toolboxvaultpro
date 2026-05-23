# 🏢 FUTURE FEATURE: Company / Multi-User Tier

> **Status:** Concept design, NOT IN IMPLEMENTATION. Document captured 2026-05-23.
> Picks up when user is ready to begin Phase 1.

## Concept Summary

Expand the app from individual mechanics → small mechanic shops / fleet shops / professional garages. Companies pay one subscription, get employee seats included, gain shared inventory + equipment + insurance reporting.

## Account Type Matrix

| Type | Created via | Sees | Can edit |
|---|---|---|---|
| **Individual** | Default sign-up | Own tools/dealers/etc | Own data |
| **Company Master** | Sign-up → "I'm a company" choice | Own + ALL company data + ALL employees' data | Everything in company |
| **Company Manager** | Master promotes a Master user via UI, OR Master invites with manager-level code | Own + company data + employees' data | Company data; cannot promote other managers (TBD) |
| **Company Employee** | Sign-up with company invite code, OR existing individual user enters code in More→Account | Own + company tools (read-only-ish: can check in/out, flag broken/needs maintenance but cannot edit specs/photos/etc) | Own data; LIMITED on company data |

## Data Model Changes (Phase 1)

### New collection: `companies`
```python
class Company(BaseModel):
    id: str
    name: str
    master_id: str            # User.id of the owner
    created_at: datetime
    subscription_tier: str    # "free" | "standard" | "pro" | "enterprise"
    subscription_status: str  # "active" | "lapsed" | "grace_period"
    seats_used: int           # employees + managers
    seats_max: int            # from tier
    items_max: int            # from tier
    notes: str
```

### New collection: `company_invite_codes`
```python
class CompanyInviteCode(BaseModel):
    id: str
    company_id: str
    code: str                 # e.g., "TBV-A8K3-MNP9" — short, unambiguous chars
    role: str                 # "manager" | "employee"
    max_uses: int             # 1 = single-use, 0 = unlimited until revoked
    uses: int
    created_by: str           # User.id of master/manager who minted it
    created_at: datetime
    expires_at: Optional[datetime]
    revoked: bool
```

### User model additions
```python
account_type: str               # "individual" | "company_master" | "company_manager" | "company_employee"
company_id: Optional[str]       # set when account_type is master/manager/employee
joined_company_at: Optional[datetime]
```

### Every existing record gains
```python
scope: str           # "personal" | "company"
company_id: Optional[str]  # set when scope == "company"
```
Records with `scope=personal` always show up via `owner_id` (existing flow).
Records with `scope=company` show up via `company_id` to anyone in that company.

### DBProxy expansion
The current `_ScopedCollection` auto-injects `owner_id` filter. Needs to grow:
- For `account_type=individual`: same as today, `owner_id` filter only
- For `account_type=company_employee/manager/master`: query becomes `{$or: [{owner_id: me}, {company_id: my_company}]}`
- Some endpoints (insurance reports, etc) might want company-only scope explicitly

## Equipment Concept

User wants a new entity: "Equipment" = shared company assets (oil-change machines, tire balancers, lifts) that:
- Aren't really "tools" you take home
- Need shared maintenance tracking
- Employees can flag "needs paper", "broken", "calibration due"
- Master/Manager gets notified

**Implementation decision (recommended):** Add a `type` field to Tools: `tool | equipment | consumable`. Don't make a separate Equipment collection — it would duplicate 70% of the Tool fields (location, dealer, photos, maintenance, etc).

Add a `status_flags` field on Tool: e.g., `["needs_paper", "low_fluid", "calibration_due"]` — UI shows a colored chip on the card. Employees can toggle these flags; Managers see them on company dashboard.

## Subscription Tier Proposal

**Recommendation: Flat-tier model (clearest for both Apple/Google review and user comprehension)**

| Tier | Price | Employees | Items | Reports |
|---|---|---|---|---|
| Company Free | $0 | 1 master + 1 mgr + 2 employees | 15 | Basic only |
| Standard | ~$29.99/mo | up to 5 employees | 100 | All standard reports |
| Pro | ~$99.99/mo | up to 25 employees | Unlimited | + Insurance + Compliance |
| Enterprise | ~$299.99/mo or contact | Unlimited | Unlimited | + Custom report builder, multi-location |

**Alternate: Per-seat ($6/employee/mo)** — cleaner economics but harder to manage seat limits via Apple IAP.

### Apple/Google Compliance Rules to Honor

1. **Subscription MUST be purchased via IAP** if happening in-app. No Stripe/web payment for IAP-eligible accounts. Both stores explicitly forbid linking out to web payment for digital services (Apple 3.1.1, Google equivalent).
2. **Invite code redemption flow is allowed** — Master subs via IAP → Master generates codes in app → Employees enter code at signup → Employee accounts are free. Both stores allow this (Slack, Microsoft 365, etc., all do it).
3. **Small Business Program (Apple)**: Apply when revenue < $1M/year for 15% (not 30%) commission. https://developer.apple.com/app-store/small-business-program/
4. **Google has identical Business Tier program** — automatically applied for first $1M.
5. **Subscription tiers need to be created in App Store Connect + Google Play Console + RevenueCat** as separate products (e.g., `company_standard_monthly`, `company_pro_monthly`, etc.) — your existing pro_monthly / pro_yearly are individual-tier.
6. **No "promo codes" in app UI** (Apple 3.1.1 violation — already learned this). Codes are for company-employee invite, not subscription discounts.
7. **Lapsed subscription handling**: 30-day grace period before downgrade (Apple recommendation). After lapse:
   - Company tools become read-only for everyone except master
   - Employees revert to individual free tier (keep personal data)
   - Master can reactivate by re-subscribing → everything restores

## Permission Matrix (Manager vs Master)

Open question — user to decide. My recommendation:

| Action | Master | Manager | Employee |
|---|---|---|---|
| View company tools/equipment | ✅ | ✅ | ✅ |
| Add company tools/equipment | ✅ | ✅ | ❌ |
| Edit company tool specs (price, model #, etc) | ✅ | ✅ | ❌ |
| Delete company tools | ✅ | ❌ (master only — destructive) | ❌ |
| Check out / check in company tools | ✅ | ✅ | ✅ |
| Flag company tools "broken" / "needs maintenance" | ✅ | ✅ | ✅ |
| Add maintenance log entries on company tools | ✅ | ✅ | ✅ |
| View employee personal data | ❌ | ❌ | ❌ (PRIVACY — never) |
| Invite new employees | ✅ | ✅ | ❌ |
| Promote employee → manager | ✅ | ❌ (master only) | ❌ |
| Sever employee | ✅ | ✅ | n/a |
| Edit subscription | ✅ | ❌ | ❌ |
| Run company reports | ✅ | ✅ | ❌ (employees can run personal reports only) |

## When Employee Severs Company OR Switches Company

**Default policy (RECOMMENDED):**
- Personal data: always travels with the employee
- Company data: stays with the company (employee loses view access)
- Maintenance entries the employee made on company tools: stay attached to the company tool (immutable history)
- Checkout history: stays with the company tool
- Photos employee uploaded to a company tool: stays with the company tool

**Edge case:** If employee was mid-checkout of a company tool when they sever, what happens?
→ Auto check-in to company, log the sever event in tool's history.

## Open Questions for User (re-ask when implementing)

1. Equipment = separate entity OR Tools with type-flag? *(recommendation: type-flag, not separate)*
2. Should Managers be able to promote/demote other Managers? *(recommendation: master only)*
3. Can employees see ALL company tools, or only assigned/checked-out to them? *(recommendation: all by default; filter UI)*
4. Subscription model — flat tier vs per-seat? *(recommendation: flat tier)*
5. Specific seat/item counts per tier — user to confirm
6. Lapsed sub grace period length?
7. Multi-shop support (one company with multiple physical locations)? Out of scope for v1?
8. Specific reports company tier needs (insurance aggregate, maintenance compliance, others)?

## Implementation Phases (Recommended Order)

| Phase | Scope | Risk | Credits Est. |
|---|---|---|---|
| **1. Foundation** | account_type field, Company entity, invite codes, signup flow choice screen, migrate existing users → individual | HIGH (data migration) | 100-150 |
| **2. Employee Read View** | Employees can VIEW company tools, check-in/out only | Low | 100-150 |
| **3. Manager Editing** | Manager UI: add/edit company tools, generate codes | Medium | 80-120 |
| **4. Equipment Type** | Type field on Tools, status flags, equipment-specific UI | Low | 60-100 |
| **5. Subscription Tiers** | Create products in stores + RC, wire up IAP, seat enforcement | High (store re-review) | 80-150 |
| **6. Company Reports** | Insurance aggregate, compliance, audit log | Medium | 80-120 |
| **7. Polish + Testing + Store Submission** | Edge cases, permission audit, both store re-review | High | 100-150 |
| | | **TOTAL** | **~600-940** |

## Architectural Risks to Watch

1. **Permission audit**: every endpoint (~80+) needs role-check. Easy to miss one → privilege escalation.
2. **DBProxy expansion**: the auto-scoping is currently dead simple. Adding company logic makes it complex. Risk of accidentally leaking another company's data.
3. **Subscription state machine**: trial → active → grace → lapsed → reactivated. Each has different access rules. Test exhaustively.
4. **Store re-submission**: both stores will re-review the entire app when subscription tiers change significantly. Plan a ~2 week buffer.
5. **Apple Family Sharing vs Business Subscriptions**: family sharing applies to individual subs but NOT B2B subs. Make sure company subs are configured as Auto-Renewable + Not Eligible for Family Sharing.

## Marketing Positioning (Future)

- "From your toolbox to your shop floor"
- Target: independent mechanic shops, mobile mechanic businesses, fleet maintenance shops, dealership service departments
- Pricing pitched against per-seat ERP tools ($50-100/seat) — Toolbox Vault at $30-100 flat per shop is a clear value win.

---
**End of concept doc. Reopen this file when ready to begin Phase 1.**
