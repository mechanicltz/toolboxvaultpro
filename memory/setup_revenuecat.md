# RevenueCat — Setup Guide

You said you have a fresh RevenueCat account with a basic project but no
apps connected. This guide takes you from there to "ready for code".

**Time required:** ~30–45 minutes.
**Prerequisite:** Apple + Google subscription guides completed (this guide
needs the IDs/keys you produced there).

---

## Step 1 — Create the iOS App in your RevenueCat Project

1. Sign in to https://app.revenuecat.com/.
2. In your project, **+ New app**.
3. **Name:** `Toolbox Vault iOS`
4. **App store:** **App Store**
5. **App Bundle ID:** paste the bundle ID from your `app.json` (currently
   `app.emergent.assetlocator128c92565d`). Must match exactly.
6. **App Store Connect API:**
   - **Issuer ID:** paste the Issuer ID you noted in the Apple guide Step 6.
   - **Key ID:** paste the Key ID.
   - **Private key (.p8):** paste the contents of the `.p8` file you
     downloaded.
7. **App-Specific Shared Secret:** paste the secret from Apple guide Step 7.
8. **Save**.

After saving, RevenueCat will pull your subscription products from App
Store Connect. You should see `pro_monthly` and `pro_yearly` appear under
**Products** within a few seconds. If they don't, double-check the bundle
ID and that the Paid Apps Agreement is Active.

---

## Step 2 — Create the Android App in the Same Project

1. **+ New app** in the same project.
2. **Name:** `Toolbox Vault Android`
3. **App store:** **Google Play Store**
4. **Package name:** paste the Android package from your `app.json`.
5. **Service account credentials JSON:** paste the contents of the JSON
   file you downloaded in the Google guide Step 5.
6. **Save**.

Products `pro_monthly` and `pro_yearly` should appear here too.

---

## Step 3 — Create the **Entitlement** "pro"

The entitlement is the abstract "permission" your app checks. Both
subscriptions grant the same entitlement.

1. RevenueCat → **Entitlements** (left sidebar) → **+ New**.
2. **Identifier:** **`pro`** ← write this down. The app code checks for
   this exact string.
3. **Display name:** `Toolbox Vault Pro`
4. **Save**.

5. Inside the entitlement, click **Attach Products**. Attach BOTH:
   - `pro_monthly` (iOS) and `pro_monthly` (Android)
   - `pro_yearly` (iOS) and `pro_yearly` (Android)

   All four product entries should now show under "Attached products" with
   the entitlement linked.

---

## Step 4 — Create the **Offering** "default"

An offering is what the app fetches at runtime to display on the paywall.

1. RevenueCat → **Offerings** (left sidebar) → **+ New Offering**.
2. **Identifier:** `default`
3. **Display name:** `Default`
4. **Save**.

5. Inside the offering, **+ Add Package** twice:
   - **Package #1:**
     - Package type: **Monthly**
     - Identifier: `$rc_monthly` (RevenueCat default)
     - Attach products: `pro_monthly` (iOS) + `pro_monthly` (Android)
   - **Package #2:**
     - Package type: **Annual**
     - Identifier: `$rc_annual`
     - Attach products: `pro_yearly` (iOS) + `pro_yearly` (Android)

6. Mark this offering as **Current**.

---

## Step 5 — Get Your API Keys

1. RevenueCat → **API keys** (left sidebar).
2. Note the **Public app-specific** key for **Toolbox Vault iOS** —
   starts with `appl_…`. This goes in our React Native code.
3. Note the **Public app-specific** key for **Toolbox Vault Android** —
   starts with `goog_…`. Also goes in code.
4. Note the **Secret API key (server)** for the project — starts with
   `sk_…`. This goes in the BACKEND `.env` file ONLY. Never put it in
   client code.

⚠️ Keep `sk_…` secret. Anyone with that key can grant entitlements.

---

## Step 6 — Set Up the Webhook (for backend sync)

This is what keeps your backend's `entitlement` field in sync with reality
when subscriptions renew, cancel, expire, refund, etc.

1. RevenueCat → **Project settings → Integrations → Webhooks**.
2. **+ New webhook**.
3. **URL:** `https://[YOUR-PRODUCTION-API-DOMAIN]/api/revenuecat/webhook`
   - For now, use a placeholder like `https://example.com/api/webhook` —
     we'll update it once your production backend has a permanent URL.
4. **Authorization header:** generate a random 40-char secret, paste it,
   and SAVE it. We'll put the same secret in the backend `.env` as
   `REVENUECAT_WEBHOOK_SECRET`.
5. **Save**.

---

## Step 7 — Connect Google RTDN (return to Google guide Step 4)

1. RevenueCat → your project → **Project settings → Integrations →
   Google Play Real-time Developer Notifications**.
2. RevenueCat will display a **Pub/Sub topic name** like
   `projects/revenuecat-prod/topics/your-project-id`.
3. Copy that topic name.
4. Go back to **Play Console → Monetize setup → Real-time developer
   notifications** and paste it in.
5. **Send test notification** in Play Console — you should see it appear
   in RevenueCat's "Sandbox" customer view within a minute.

---

## Step 8 — Create a Promotional Entitlement (for Lifetime promo codes)

This is how you'll grant lifetime access via promo codes per your req #6a.
The user enters a code in the app → backend validates the code →
backend calls RevenueCat REST API to grant the `pro` entitlement to that
user's RevenueCat ID with a 100-year duration (effectively lifetime).

You don't have to create a separate entitlement — we reuse `pro`. But you
DO need to know:

- **Endpoint:** `POST https://api.revenuecat.com/v1/subscribers/{app_user_id}/entitlements/pro/promotional`
- **Auth:** `Authorization: Bearer sk_...` (the secret API key from Step 5)
- **Body:** `{"duration": "lifetime"}`

The promo code → entitlement mapping itself lives in **our** database,
not in RevenueCat. (RevenueCat's offer codes are limited to App Store-
specific promotions, which don't fit your "I generate codes manually for
my team" use case.)

---

## ✅ Phase-1 RevenueCat checklist

- [ ] iOS app `Toolbox Vault iOS` created and connected to App Store Connect.
- [ ] Android app `Toolbox Vault Android` created and connected to Play.
- [ ] Both apps show `pro_monthly` and `pro_yearly` under Products.
- [ ] Entitlement `pro` created with all 4 product entries attached.
- [ ] Offering `default` created with `$rc_monthly` and `$rc_annual`
      packages, marked **Current**.
- [ ] iOS public key (`appl_…`), Android public key (`goog_…`), and Secret
      key (`sk_…`) noted in a safe place.
- [ ] Webhook configured with placeholder URL + auth secret saved.
- [ ] Google RTDN topic name pasted into Play Console.
- [ ] Confirmed the entitlement appears as expected when you simulate a
      sandbox purchase later.

---

## What to give me when ready for Phase 2

When all three guides are complete, paste these into our chat (or I can
read them from a file you create at `/app/memory/credentials.md` — DON'T
commit that file to git):

```
APPLE_BUNDLE_ID = ...
APPLE_SHARED_SECRET = ...
GOOGLE_PACKAGE_NAME = ...
REVENUECAT_IOS_PUBLIC_KEY = appl_...
REVENUECAT_ANDROID_PUBLIC_KEY = goog_...
REVENUECAT_SECRET_KEY = sk_...
REVENUECAT_WEBHOOK_SECRET = (the random secret you set)
PRIVACY_POLICY_URL = https://...
TERMS_OF_SERVICE_URL = https://...
```

I will use these to wire up Phase 2 (backend) and Phase 3 (mobile SDK).
