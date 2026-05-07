# Toolbox Vault — Versioning Cheat Sheet

## The 3 numbers in `MAJOR.MINOR.PATCH`

| Number | Bump it when... | Example |
|---|---|---|
| **PATCH** (last) | You fixed a bug. No new behaviour. | `1.0.3` → `1.0.4` |
| **MINOR** (middle) | Small visible change — colour, text, tweak, small feature. | `1.0.3` → `1.1.0` |
| **MAJOR** (first) | New feature, new tab, new big setting, big rewrite. | `1.0.3` → `2.0.0` |

> Note: bumping MINOR resets PATCH to `0`. Bumping MAJOR resets both to `0`.
> This is the universal industry standard ("Semantic Versioning") so it stays
> compatible with every tool you'll ever use.

## The hidden 4th number — **Build Number**

Apple and Google **require** a separate, always-increasing integer for every
upload, even if the version string is the same.
`app.json → ios.buildNumber` and `android.versionCode` hold this.

The bump script handles it for you — every time you run any bump (patch / minor
/ major / build), the build number goes up by **+1**. You never need to think
about it.

## How to bump (one command)

From `/app/frontend`:

```bash
yarn bump:patch    # bug fix       (1.0.3 -> 1.0.4)
yarn bump:minor    # small change  (1.0.3 -> 1.1.0)
yarn bump:major    # new feature   (1.0.3 -> 2.0.0)
yarn bump:build    # same version, just bump build number (re-upload)
yarn bump:show     # print current numbers, change nothing
```

The script will print **exactly** what to type into:

- **EAS Build / App Store Connect** → Version + Build Number
- **Google Play Console** → versionName + versionCode

…and update `app.json` + `package.json` for you.

## How the agent helps you

At the end of every work session, the agent will tell you which command to run,
based on what was changed. Examples:

- *"Fixed an iOS PDF crash."* → `yarn bump:patch`
- *"Added a Delete Account button."* → `yarn bump:major`
- *"Changed accent colour to blue."* → `yarn bump:minor`

If you ever forget what your current version is, just run:

```bash
yarn bump:show
```

## Where the version shows up in the app

- **Home tab** — tiny grey `v1.0.11` in the top-right of the header
- **More tab** — tiny grey `v1.0.11` in the top-right of the header

Both update automatically from `app.json` — no extra editing needed.
