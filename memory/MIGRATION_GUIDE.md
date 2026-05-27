# Toolbox Vault — Complete Migration Guide

How to take everything you have (code + database + assets) off this dev container and run it under your own infrastructure. Designed so you do **NOT** have to rebuild anything from scratch.

**Estimated total time:** 1–3 hours depending on which hosting providers you choose.

---

## What You're Taking With You

| Asset | Where | Size |
|---|---|---|
| Frontend code (Expo / React Native) | tarball | ~75 MB |
| Backend code (FastAPI / Python) | included in tarball | (small) |
| Setup guides + legal templates | included in tarball | (tiny) |
| MongoDB full database dump (501 tools, all users, all dealers, etc.) | tarball | ~91 MB |
| Apple Developer account, App record, TestFlight build | Already yours, lives at apple.com | n/a |
| Google Play Console account | Already yours, lives at google.com | n/a |
| RevenueCat account (if created) | Already yours, lives at revenuecat.com | n/a |

**Apple, Google, and RevenueCat accounts are 100% yours and stay regardless of what platform you run the app on.** This guide covers the dev-container portion only.

---

## Step 1 — Download The Two Archives (5 min)

Two files have been prepared for you. Download each by pasting the URL into your browser. **The token is unique to your project — keep these URLs private until the download completes.**

**Code archive:**
```
https://asset-locator-12.preview.emergentagent.com/api/migration/toolbox-vault-code.tar.gz?token=LtFY0mK9hVsCC6_sYEJ6tAEQCm92knNREAjk36wufyU
```

**Database dump:**
```
https://asset-locator-12.preview.emergentagent.com/api/migration/mongo-dump.tar.gz?token=LtFY0mK9hVsCC6_sYEJ6tAEQCm92knNREAjk36wufyU
```

Save both to a folder on your computer (e.g., `~/Toolbox-Vault-Backup/`).

To unzip them, on **macOS** or **Linux** the system already knows how to. On **Windows**, install **7-Zip** (free at https://www.7-zip.org) and right-click → 7-Zip → Extract.

After extraction you'll have:
```
~/Toolbox-Vault-Backup/
├── frontend/        ← all React Native / Expo source
├── backend/         ← all FastAPI / Python source
├── memory/          ← setup guides, roadmap notes
├── legal/           ← Privacy Policy + ToS HTML
└── mongo-dump/
    └── test_database/
        ├── tools.bson, tools.metadata.json
        ├── dealers.bson, dealers.metadata.json
        ... (one pair per collection)
```

⚠️ **Inside `backend/.env`** are secrets (Gmail password, JWT secret, MongoDB connection string from THIS dev container). You'll replace these values with new ones for your new hosting. **Do NOT commit this file to a public GitHub repo.**

---

## Step 2 — Push The Code To Your Own GitHub Repo (10 min)

Recommended so you have permanent ownership and a deploy source.

### 2.1 Create a new EMPTY repo on GitHub

1. Go to https://github.com/new
2. Name: `toolbox-vault` (or anything you like)
3. **Visibility: Private** (your code contains your business logic — keep it private)
4. **DON'T** initialize with README, .gitignore, or license — leave it empty
5. Click **Create repository**
6. Copy the URL it gives you, e.g. `https://github.com/mechanicltz/toolbox-vault.git`

### 2.2 Push from your computer

Open a terminal in `~/Toolbox-Vault-Backup/` and run:

```bash
# Create a .gitignore first to exclude secrets and bulky files
cat > .gitignore <<EOF
# secrets
**/.env
**/.env.local
**/.env.production
**/credentials.json
**/AuthKey_*.p8

# Build artifacts
node_modules/
__pycache__/
*.pyc
.venv/
.expo/
dist/
build/
.cache/

# OS / IDE
.DS_Store
.vscode/
.idea/

# Mongo dump should NOT go into the code repo (it has user data)
mongo-dump/
mongo-dump.tar.gz
toolbox-vault-code.tar.gz
EOF

git init
git add .
git commit -m "Initial migration from Emergent dev container"
git branch -M main
git remote add origin https://github.com/mechanicltz/toolbox-vault.git
git push -u origin main
```

If you've never used Git on your machine before, install it from https://git-scm.com/downloads first. You may need to authenticate with GitHub via personal access token — see https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

---

## Step 3 — Set Up A New MongoDB Database (15 min)

You need a permanent place for the database. **Free tier options:**

### Option A — MongoDB Atlas (recommended, free 512 MB tier)

1. Sign up at https://www.mongodb.com/cloud/atlas/register
2. Create a **free shared cluster** (M0). Pick the region closest to your users (e.g., AWS / us-east-1).
3. Wait for the cluster to provision (~2 minutes)
4. **Database Access** → Add new user. Set username/password. Save them.
5. **Network Access** → Add IP Address → "Allow access from anywhere" (`0.0.0.0/0`) for now. You can lock this down later.
6. **Connect → Drivers → Python** → copy the connection string. Looks like:
   ```
   mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. **Save this connection string** — you'll plug it into your backend.

### Option B — Other free Mongo hosts
- Railway: https://railway.app (one-click MongoDB)
- Render: https://render.com (managed databases)
- DigitalOcean App Platform Managed Databases (paid, $15/mo)

---

## Step 4 — Restore Your Data Into The New Database (5 min)

Install MongoDB Database Tools on your computer:
- macOS: `brew install mongodb-database-tools`
- Windows: download .msi installer from https://www.mongodb.com/try/download/database-tools
- Linux: https://www.mongodb.com/docs/database-tools/installation/installation/

Then in your `~/Toolbox-Vault-Backup/` folder run:

```bash
# Replace the URI with the one from Step 3 step 6
mongorestore --uri="mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/" \
             --db=toolbox_vault_prod \
             ./mongo-dump/test_database
```

This restores all 501 tools, all your users, all your dealers, claims, etc. into a **fresh** database called `toolbox_vault_prod` on your new cluster.

You can rename `toolbox_vault_prod` to anything — just remember to use the same name in `DB_NAME` later.

Verify by running in MongoDB Atlas → Browse Collections → you should see all 20 collections with their original counts.

---

## Step 5 — Deploy The Backend Somewhere (20 min)

Pick the host that fits your budget and skill level.

### Option A — Railway (recommended for ease)

**Pricing:** $5/month minimum, includes 500 hours of compute and 1 GB RAM. Plenty for your app.

1. Sign up at https://railway.app (use your GitHub account to sign in)
2. **+ New Project** → **Deploy from GitHub repo** → pick your `toolbox-vault` repo
3. After it imports, click on the service → **Settings** tab:
   - **Root Directory:** `/backend`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. **Variables** tab — add these (from your old `backend/.env`, but with NEW values):
   ```
   MONGO_URL=mongodb+srv://...    ← from Step 3
   DB_NAME=toolbox_vault_prod      ← from Step 4
   JWT_SECRET=<paste old value>    ← from old .env, OR generate fresh
   GMAIL_APP_PASSWORD=<paste>      ← from old .env (or regenerate at apple)
   GMAIL_FROM_ADDRESS=MechanicVault@gmail.com
   GMAIL_FROM_NAME=Toolbox Vault
   REVENUECAT_WEBHOOK_SECRET=<your real RevenueCat secret>
   REVENUECAT_SECRET_KEY=<your real RevenueCat sk_... key>
   ```
5. **Deploy** — Railway builds and starts automatically.
6. **Settings → Networking → Generate Domain** — gives you a public URL like `toolbox-vault-backend-production.up.railway.app`. **Save this URL.**

ℹ️ **Note on LLM keys:** The app no longer uses any AI/LLM service in its runtime path (the AI receipt-scan feature was removed in 2026-05). You do NOT need `EMERGENT_LLM_KEY`, `OPENAI_API_KEY`, or `emergentintegrations` for this app to run.

### Option B — Render (similar pricing, very simple)

Same idea as Railway. https://render.com → New → Web Service → connect GitHub.
- Root directory: `/backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
- Add the same env vars listed above.

### Option C — Fly.io (free tier good for low traffic)

Slightly more technical. https://fly.io has a CLI install + `fly launch` from inside the `/backend` folder.

### Option D — Self-hosted on a VPS (cheapest at scale)

DigitalOcean droplet, Hetzner, Linode — $6/month for a VPS, install Python, MongoDB, nginx, run with systemd. Most flexible, most work. If you're not comfortable in Linux command line, skip this option.

---

## Step 6 — Wire The Frontend To Your New Backend (5 min)

Once the backend is deployed and you have its public URL:

1. In your local `frontend/` folder, open `.env` (creating one if needed):
   ```
   EXPO_PUBLIC_BACKEND_URL=https://toolbox-vault-backend-production.up.railway.app
   ```
2. The frontend code reads this via `process.env.EXPO_PUBLIC_BACKEND_URL`. All API calls will route there.

---

## Step 7 — Set Up Your Own Expo / EAS Account For Builds (10 min)

This replaces Emergent's Mobile Build feature. EAS is Expo's official build service. **Free tier: 30 builds/month** which is plenty.

1. Sign up at https://expo.dev (you may already have an account from earlier)
2. Install the EAS CLI on your computer:
   ```bash
   npm install -g eas-cli
   eas login    # use the email/password from expo.dev
   ```
3. Inside your `frontend/` folder:
   ```bash
   npm install
   eas build:configure    # tells EAS this project is yours
   ```
4. **Run a build:**
   ```bash
   eas build --platform ios --profile production       # iOS .ipa
   eas build --platform android --profile production   # Android .aab
   ```
5. EAS will:
   - Generate signing keys for you the first time (asks if you want it to manage them — say YES)
   - Run the build on Expo's cloud
   - Give you a download URL when done (~20 min)

### ⚠️ About bundle/package IDs after migrating

When you build with **your own** EAS account, the bundle/package ID is now **fully under your control via `app.json`**. You can:
- **Keep `app.emergent.assetlocator128c92565d`** for iOS (matches your existing Apple App Store record + TestFlight history → no resubmit needed)
- **Keep `app.emergent.assetlocator12533f4c89`** for Android (matches what the existing AAB has and what Google Play Console expects after you upload your first AAB)
- **OR** change to a clean name like `com.toolboxvault.app` for both — but doing so means Apple App Record bundle ID won't match (you'd need a NEW Apple record + lose the May-4 TestFlight build) and Google Play would need a new package registration.

**Easiest path:** keep the existing IDs as-is, just build under your own EAS account.

⚠️ **Android keystore caveat:** If you choose to change `android.package` in `app.json`, EAS will generate a fresh keystore tied to that new package. The existing keystore Emergent has for `…12533f4c89` becomes irrelevant. Note that this means the SHA-256 fingerprint Google has on file for ownership verification (`AD:EB:4E:E7:99:04:CB:16:18:FC:51:03:4C:47:48:B5:72:B0:54:6D:02:C5:A9:38:C7:DB:B0:3B:F1:13:E6:11`) won't match new EAS builds. Google's verification step would still fail unless you change the package name to something Google has never seen.

**Cleanest workaround:** in your `app.json`, set:
```json
"android": {
  "package": "com.ryanoverby.toolboxvault"
}
```
…something Google has never seen before. Build with EAS. Upload to Play Console using THIS new package name. No verification challenge. Your Apple side stays as-is.

---

## Step 8 — Submit Builds To The Stores (10 min)

EAS has built-in submit commands:

```bash
# iOS — uses your Apple API key (App Store Connect API)
eas submit --platform ios --latest

# Android — uses your Google Play service account JSON
eas submit --platform android --latest
```

The first time you run each, EAS asks for your credentials:
- **iOS:** Apple ID + App-Specific Password OR App Store Connect API .p8 file (whichever you have)
- **Android:** the service account `credentials.json` file you downloaded from Google Cloud (Step 5 of the Google guide)

Once configured, future submits are one command, no more manual upload.

---

## Step 9 — Domain Name (Optional)

If you want a real domain like `api.toolboxvault.com` instead of `toolbox-vault-backend-production.up.railway.app`:

1. Buy a domain at Namecheap, Cloudflare, or Google Domains (~$12/year)
2. In Railway/Render → Settings → Networking → Custom Domain → enter `api.toolboxvault.com`
3. They give you DNS instructions (a `CNAME` record). Add that record at your domain registrar.
4. Wait ~10 min for DNS to propagate
5. Update `EXPO_PUBLIC_BACKEND_URL` in your frontend `.env` to the new domain
6. Rebuild + resubmit the apps

---

## Step 10 — Production Hardening Checklist (Recommended)

Before opening to public users:

- [ ] **MongoDB:** Lock down Network Access from `0.0.0.0/0` to only your backend host's IPs
- [ ] **JWT_SECRET:** Rotate to a fresh random value (`python3 -c "import secrets; print(secrets.token_urlsafe(64))"`)
- [ ] **Backups:** Enable MongoDB Atlas's free continuous backup, or schedule a weekly mongodump
- [ ] **Monitoring:** Set up Railway/Render's built-in alerts, or use https://uptimerobot.com (free)
- [ ] **HTTPS:** Already free on Railway/Render. If self-hosting, set up Let's Encrypt
- [ ] **Email deliverability:** Either use Gmail (works for low volume) or migrate to SendGrid/Postmark for higher reliability
- [ ] **Rate limiting:** Add `slowapi` to FastAPI for /api/auth/login, /api/auth/register, /api/auth/forgot-password — prevents brute-force
- [ ] **Sentry / error tracking:** Free tier at https://sentry.io — catches production bugs before users complain

I have NOT done any of those for you yet — they're future production hygiene tasks. The app works without them, but I recommend them before you have real paying users.

---

## What This Migration Does NOT Cover

- **RevenueCat keystore for Google Play package verification.** If Google's ownership challenge still triggers under the new package name, that's only a problem for the LEGACY package. As noted in Step 7, picking a fresh `android.package` like `com.ryanoverby.toolboxvault` sidesteps the entire problem because Google has never seen that package before.
- **The previous TestFlight build** (May 4, build 1.1.0/12) signed by Emergent's iOS keystore. Once you build a new iOS .ipa under YOUR EAS account, EAS will use a different distribution certificate. You'll need to delete the old TestFlight build and submit a fresh one. Apple allows this.
- **Migration of Emergent-specific features** (universal LLM key, mobile build pipeline). These do not exist on standard EAS — replacements are listed in Step 5 / Step 7.

---

## Estimated Total Cost After Migration

| Service | Free? | Paid |
|---|---|---|
| GitHub | ✅ Free for private repos | — |
| MongoDB Atlas | ✅ Free 512 MB | $0–$57/mo for larger |
| Railway / Render backend | ❌ | $5–$10/mo |
| EAS (Expo Application Services) builds | ✅ 30 builds/mo free | $19/mo for unlimited |
| Domain (optional) | ❌ | ~$12/year |
| Apple Developer | ❌ | $99/year (already have) |
| Google Play | ❌ | $25 one-time (already have) |
| RevenueCat | ✅ free up to $10k MRR | 1% revenue share above |

**Total ongoing minimum: ~$5/month** ($60/year) to host the backend, plus the Apple/Google annual fees you already pay.

---

## If You Hit Issues

The good news is **everything in this migration is industry-standard, widely-documented**. If you hit a wall:

- Railway / Render / Fly.io / Atlas all have excellent documentation and Discord support communities
- Stack Overflow has thousands of answers for "FastAPI deploy", "Expo EAS build", "mongorestore", etc.
- Posting in r/expo or r/FastAPI on Reddit usually gets you an answer within hours

You don't need Emergent-specific support to do any of this — it's all open-source standard tools.

---

## ⚠️ Important Reminders

1. **DO NOT commit `backend/.env` to GitHub.** It contains secrets. The `.gitignore` in Step 2.2 excludes it, but double-check before pushing.

2. **DO NOT delete this dev container** until you've verified your new deployment works end-to-end. Once you're confident, then you can stop using Emergent.

3. **Your Apple TestFlight build (May 4) and Apple Developer account are 100% yours** — they live at apple.com, not on Emergent's servers. Migrating off Emergent doesn't touch them.

4. **The 'subtest@example.com' / password123 account** in your migrated database is for testing. You can delete it from the `users` and `subscriptions` collections in MongoDB after migration if you want.

---

Good luck. The technical work to migrate is real but bounded — most of it is one-time setup, then you have a fully self-owned production app. 🚀
