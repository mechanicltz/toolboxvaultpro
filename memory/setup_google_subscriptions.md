# Google Play Console — Subscription Setup

This guide walks you through creating the two subscriptions in Google Play
Console that RevenueCat and the app will use.

**Time required:** ~45 minutes.
**Prerequisite:** Active Google Play Developer account ($25 one-time).

---

## Pre-flight checklist (one time)

1. **Sign the Distribution Agreement** (if you haven't): Play Console →
   **Settings → Developer account → Account details**.

2. **Set up a Merchant account** (required to sell subscriptions):
   - Play Console → **Setup → Payments profile**.
   - Click **Set up payments profile** and complete the form
     (legal name, address, tax info, bank account).
   - This must be **Approved** (can take 24–72 hours) before subs can be
     activated. Submit it NOW even if you're not ready to launch.

3. **Create an App record:**
   - Play Console → **All apps → Create app**.
   - App name: `Toolbox Vault`
   - Default language: English (United States)
   - **App or game:** App
   - **Free or paid:** **Free** (the app is free; subscriptions are
     in-app purchases)
   - Accept the declarations → **Create app**.

4. **Set the App's package name** to match your `app.json` Android `package`
   value (currently `app.emergent.assetlocator12533f4c89`).
   - This is set when you upload your first APK/AAB. **Do NOT upload yet** —
     just have it ready in `app.json`.
   - **Important:** package name cannot be changed once a build is uploaded.
     If you plan to use a custom package, change `app.json` first.

5. **Privacy Policy URL** — required.
   - Play Console → **App content → Privacy Policy** → enter the public URL.

---

## Step 1 — Upload an internal testing build (REQUIRED before subscriptions)

Google requires at least one app build (any track, including internal
testing) before subscriptions can be created.

1. **Build an Android AAB:**
   ```bash
   cd /app/frontend
   eas build --platform android --profile production
   ```
   (If you don't have an Android `production` profile in `eas.json`, use
   `preview`.)

2. **Upload the AAB:**
   - Play Console → **Testing → Internal testing → Create new release**.
   - Upload the `.aab` file.
   - Release name: defaults to the version code (`12`).
   - Release notes: "Initial internal test build."
   - **Save → Review release → Start rollout to Internal testing**.

3. **Add yourself as an internal tester:**
   - Same screen → **Testers** tab → **Create email list**.
   - Name: `Internal Testers`, add your Google email.
   - Save → enable the list.

---

## Step 2 — Create "Pro Monthly" subscription

1. Play Console → your app → **Monetize → Products → Subscriptions**.
2. **Create subscription**.
3. **Product ID:** **`pro_monthly`** ← write this down (must match Apple +
   RevenueCat)
4. **Name:** `Pro Monthly`
5. **Description:** `Unlimited tools, full access. Auto-renews monthly.`
6. **Save**.

Now configure the **base plan** (Google's term for the actual price option):

7. Inside the subscription, **Base plans → Add base plan**.
8. **Base plan ID:** `monthly`
9. **Auto-renewing**.
10. **Billing period:** 1 month.
11. **Grace period:** 7 days (default).
12. **Account hold:** 30 days (default).
13. **Resubscribe:** Allow.
14. **Set price:** $7.99 USD → set countries (default all available).
15. **Activate** the base plan.

---

## Step 3 — Create "Pro Yearly" subscription

1. **Subscriptions → Create subscription**.
2. **Product ID:** **`pro_yearly`**
3. **Name:** `Pro Yearly`
4. **Description:** `Unlimited tools, full access. Auto-renews yearly. Best value.`
5. **Save**.
6. **Add base plan**:
   - Base plan ID: `yearly`
   - Auto-renewing
   - Billing period: 1 year
   - Grace period: 7 days
   - Account hold: 30 days
   - Price: $79.99 USD
7. **Activate** the base plan.

---

## Step 4 — Configure Real-Time Developer Notifications (RTDN)

This is what powers RevenueCat webhooks on the Google side. Without it,
subscription changes (renewals, cancellations) won't reach your backend
in real time.

1. Play Console → your app → **Monetize setup → Real-time developer notifications**.
2. **Topic name:** RevenueCat will give you this URL in their setup wizard
   (looks like `projects/revenuecat-prod/topics/[your-app-name]`).
   - You'll fill this in **AFTER** you complete the RevenueCat setup
     (Step 4 in the RevenueCat guide).
   - For now, leave this and come back.

---

## Step 5 — Create a Service Account (for RevenueCat)

RevenueCat needs read access to your Play Console to validate purchases.

1. **Google Cloud Console** (https://console.cloud.google.com) →
   pick the project automatically created with your Play account, OR
   create a new project named `toolbox-vault-prod`.
2. **IAM & Admin → Service Accounts → Create Service Account**.
3. Name: `revenuecat-integration`
4. **Create and continue**.
5. **Grant access** → role: **Pub/Sub Admin** (for RTDN).
   Click **Continue → Done**.
6. Click the new service account → **Keys** tab → **Add Key → Create new key → JSON**.
7. Download the `.json` file and save it securely.

Now grant it Play Console access:

8. **Play Console → Users and permissions → Invite new users**.
9. Email: paste the service account email (looks like
   `revenuecat-integration@toolbox-vault-prod.iam.gserviceaccount.com`).
10. **App permissions → Toolbox Vault**:
    - **View app information and download bulk reports**
    - **View financial data, orders, and cancellation surveys**
    - **Manage orders and subscriptions**
11. Send invitation. (Auto-accepts for service accounts.)

---

## Step 6 — Add a Test Account (for sandbox testing)

You can test purchases without being charged using "license testing":

1. Play Console → **Settings → License testing**.
2. Add the Gmail address you'll use on your test device.
3. **License response:** `RESPOND_NORMALLY`.
4. Save.

When that account installs the internal-test-track build and opens
the paywall, purchases will be free and clearly labelled "Test Card".

---

## ✅ Phase-1 Google checklist — verify before moving on

- [ ] Payments profile **Approved**.
- [ ] App record `Toolbox Vault` created with the right package name.
- [ ] Privacy Policy URL filled in.
- [ ] At least one internal-testing build uploaded.
- [ ] `pro_monthly` subscription created with `monthly` base plan, $7.99,
      base plan **Activated**.
- [ ] `pro_yearly` subscription created with `yearly` base plan, $79.99,
      base plan **Activated**.
- [ ] Service account JSON key downloaded.
- [ ] Service account invited to Play Console with the 3 required
      permissions.
- [ ] At least one license tester added.
- [ ] (Defer to RevenueCat step 4) RTDN topic — return to this after
      RevenueCat gives you the topic name.

When all ticked, move on to the **RevenueCat** guide.
