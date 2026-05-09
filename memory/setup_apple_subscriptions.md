# Apple App Store Connect — Subscription Setup

This guide walks you through creating the two auto-renewing subscriptions
("Pro Monthly" $7.99 and "Pro Yearly" $79.99) in App Store Connect that
RevenueCat and the app will use.

**Time required:** ~45 minutes.
**Prerequisite:** Active Apple Developer account ($99/yr).

---

## Pre-flight checklist (one time, before subscriptions)

You must complete these in App Store Connect BEFORE creating subscriptions:

1. **Sign the Paid Apps Agreement.**
   - App Store Connect → **Business** (top nav).
   - Under "Agreements", find **"Paid Apps"** and click **"Request"**.
   - Accept the agreement, fill in your bank/tax info, and contact info.
   - Status must say **"Active"** or you cannot sell subscriptions. This is
     the most common cause of "subscriptions not appearing in sandbox".

2. **Create the App record (if not already created):**
   - App Store Connect → **My Apps** → **+** → **New App**
   - Platforms: iOS
   - Name: **Toolbox Vault**
   - Primary language: English (U.S.)
   - Bundle ID: select the one matching your Xcode/EAS project
     (`app.emergent.assetlocator12533f4c89` based on your current `app.json`).
     **Important:** if you plan to launch under a custom domain (e.g.,
     `com.yourcompany.toolboxvault`), change it now in `app.json` BEFORE
     submitting subscriptions — bundle IDs cannot be changed later.
   - SKU: `toolbox-vault-ios`
   - User Access: Full Access

3. **Privacy Policy URL** — required for any subscription app. Add it
   under **App Information → General Information → Privacy Policy URL**.
   Use the URL where you publish the Privacy Policy template.

---

## Step 1 — Create the Subscription Group

A subscription group lets users upgrade/downgrade between Monthly and Yearly
seamlessly while only being subscribed to one at a time.

1. App Store Connect → **My Apps → Toolbox Vault**.
2. Left sidebar → **In-App Purchases → Subscriptions**.
3. Click **"+"** beside "Subscription Groups".
4. **Reference Name:** `Toolbox Vault Pro`
5. Click **Create**.

---

## Step 2 — Create "Pro Monthly" subscription

Inside the new group:

1. Click **"+"** beside "Subscriptions".
2. **Reference Name:** `Pro Monthly`
3. **Product ID:** **`pro_monthly`** ← write this down, exact match needed in RevenueCat
4. Click **Create**.

Now configure the subscription:

5. **Subscription Duration:** 1 Month
6. **Subscription Prices** → click **+** → choose your country (USD) →
   **Price:** $7.99 → Next → review countries → Confirm.
7. **App Store Localization** → **+ Add Localization** → English (U.S.):
   - **Subscription Display Name:** `Pro Monthly`
   - **Description:** `Unlimited tools, full access. Auto-renews monthly.`
   - Save.
8. **Review Information:**
   - **Review Notes:** `Pro Monthly subscription, $7.99/mo, used to unlock unlimited items in Toolbox Vault.`
   - **Screenshot:** upload a screenshot of your in-app paywall (you'll do
     this later, after Phase 4 — placeholder OK for now).
9. Click **Save** at top right.

---

## Step 3 — Create "Pro Yearly" subscription

1. Inside the same group, click **"+"** beside Subscriptions.
2. **Reference Name:** `Pro Yearly`
3. **Product ID:** **`pro_yearly`** ← write this down
4. Click **Create**.
5. **Subscription Duration:** 1 Year
6. **Subscription Prices:** $79.99 USD
7. **Localization (English U.S.):**
   - Display Name: `Pro Yearly`
   - Description: `Unlimited tools, full access. Auto-renews yearly. Best value.`
8. **Review Notes:** `Pro Yearly subscription, $79.99/yr.`
9. **Screenshot:** placeholder OK for now.
10. **Save**.

---

## Step 4 — Set Subscription Group Localization

1. Back in **Subscription Groups → Toolbox Vault Pro**.
2. **+ Add Localization** → English (U.S.):
   - **Subscription Group Display Name:** `Toolbox Vault Pro`
3. **Save**.

---

## Step 5 — Create a Sandbox Tester (for testing before launch)

You CANNOT test paid subscriptions with a real Apple ID — Apple requires a
separate "sandbox" tester account.

1. App Store Connect → **Users and Access** (top nav) → **Sandbox** tab.
2. **+ Test Account**.
3. Fill in:
   - First/Last Name: anything (e.g., "Test User")
   - **Email:** use a NEW email that has never been used with Apple before
     (you can use an alias like `yourname+sandbox@gmail.com`)
   - Password: anything strong
   - Region: United States
4. **Invite**. (No actual email is sent — it's a placeholder account.)

Repeat to make 2–3 sandbox accounts so you can test purchase, cancel, and
restore flows.

---

## Step 6 — Create an App Store Connect API Key (for RevenueCat)

RevenueCat needs an API key to fetch your subscription configuration:

1. App Store Connect → **Users and Access** → **Integrations** tab → **App Store Connect API**.
2. **+ Generate API Key**.
3. Name: `RevenueCat Integration`
4. **Access:** **Admin** (RevenueCat needs Admin to read all the IAP data).
5. **Generate**.
6. **Download** the `.p8` file (you can only download it ONCE — keep it safe).
7. Note the **Issuer ID** at the top of the page and the **Key ID** of the
   row you just created.

You'll paste these three things (`.p8` file, Issuer ID, Key ID) into
RevenueCat in the next guide.

---

## Step 7 — Generate an "App-Specific Shared Secret" (for receipt verification)

(This is used by RevenueCat to validate purchase receipts.)

1. App Store Connect → **My Apps → Toolbox Vault**.
2. Left sidebar → **App Information**.
3. Scroll to **"App-Specific Shared Secret"** → **Manage** → **Generate**.
4. Copy the secret. You'll paste this into RevenueCat too.

---

## ✅ Phase-1 Apple checklist — verify before moving on

- [ ] Paid Apps Agreement is **Active**.
- [ ] App record `Toolbox Vault` exists with bundle ID matching `app.json`.
- [ ] Privacy Policy URL filled in under App Information.
- [ ] Subscription Group `Toolbox Vault Pro` exists.
- [ ] `pro_monthly` subscription created at $7.99/mo, status:
      "Ready to Submit" or "Waiting for Review".
- [ ] `pro_yearly` subscription created at $79.99/yr, same status.
- [ ] At least 2 sandbox tester accounts created.
- [ ] App Store Connect API key downloaded (`.p8`) and Key ID + Issuer ID
      noted.
- [ ] App-Specific Shared Secret generated and noted.

**Status note:** Subscriptions will sit in "Ready to Submit" until you
attach them to a real app submission. **They DO work in sandbox immediately**
— they don't need to be approved by Apple to test.

When all checkboxes are ticked, move on to the **Google Play Console**
guide, then **RevenueCat**.
