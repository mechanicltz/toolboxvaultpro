#!/usr/bin/env node
/**
 * Toolbox Vault — Version Bump Script
 * ---------------------------------------------------
 * Usage:
 *   node scripts/bump-version.js patch   # bug fix:           1.0.3 -> 1.0.4
 *   node scripts/bump-version.js minor   # small change:      1.0.3 -> 1.1.0
 *   node scripts/bump-version.js major   # new feature:       1.0.3 -> 2.0.0
 *   node scripts/bump-version.js build   # re-upload only:    same version, +1 build number
 *   node scripts/bump-version.js show    # print current numbers and stop
 *
 * Or via yarn:
 *   yarn bump:patch | yarn bump:minor | yarn bump:major | yarn bump:build
 *
 * What it changes (atomically):
 *   - frontend/app.json      -> expo.version            (e.g. "1.0.11")
 *   - frontend/app.json      -> expo.ios.buildNumber    (e.g. "11"  — Apple requires +1 every upload)
 *   - frontend/app.json      -> expo.android.versionCode(e.g. 11    — Google requires +1 every upload)
 *   - frontend/package.json  -> version                 (kept in sync)
 *
 * Then it tells you exactly what to type into EAS / App Store Connect / Google Play.
 */

const fs = require("fs");
const path = require("path");

const FRONTEND = path.resolve(__dirname, "..");
const APP_JSON = path.join(FRONTEND, "app.json");
const PKG_JSON = path.join(FRONTEND, "package.json");

const KIND = (process.argv[2] || "show").toLowerCase();
const VALID = new Set(["patch", "minor", "major", "build", "show"]);

if (!VALID.has(KIND)) {
  console.error(`\n✖  Unknown bump type: "${KIND}"`);
  console.error(`   Valid options: patch | minor | major | build | show\n`);
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  // Preserve trailing newline that most tools/diffs expect.
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

const app = readJson(APP_JSON);
const pkg = readJson(PKG_JSON);

const expo = app.expo || (app.expo = {});
expo.ios = expo.ios || {};
expo.android = expo.android || {};

const currentVersion = String(expo.version || pkg.version || "1.0.0").trim();
const parts = currentVersion.split(".").map((s) => parseInt(s, 10));
while (parts.length < 3) parts.push(0);
let [maj, min, pat] = parts.map((n) => (Number.isFinite(n) ? n : 0));

// Build number / versionCode are kept in lock-step and ALWAYS strictly increasing.
const currentBuild = parseInt(
  String(expo.ios.buildNumber ?? expo.android.versionCode ?? 0),
  10,
) || 0;

if (KIND === "show") {
  console.log(`\nCurrent version : ${currentVersion}`);
  console.log(`iOS buildNumber : ${expo.ios.buildNumber ?? "(unset)"}`);
  console.log(`Android versionCode : ${expo.android.versionCode ?? "(unset)"}\n`);
  process.exit(0);
}

let nextMaj = maj,
  nextMin = min,
  nextPat = pat;

switch (KIND) {
  case "major":
    nextMaj = maj + 1;
    nextMin = 0;
    nextPat = 0;
    break;
  case "minor":
    nextMin = min + 1;
    nextPat = 0;
    break;
  case "patch":
    nextPat = pat + 1;
    break;
  case "build":
    /* version unchanged, only build counter goes up */
    break;
}

const nextVersion = `${nextMaj}.${nextMin}.${nextPat}`;
const nextBuild = currentBuild + 1;

expo.version = nextVersion;
expo.ios.buildNumber = String(nextBuild);
expo.android.versionCode = nextBuild;

pkg.version = nextVersion;

writeJson(APP_JSON, app);
writeJson(PKG_JSON, pkg);

const labelMap = {
  major: "MAJOR (new feature / big change)",
  minor: "MINOR (small update / tweak)",
  patch: "PATCH (bug fix)",
  build: "BUILD ONLY (re-upload, version unchanged)",
};

console.log("\n────────────────────────────────────────────────");
console.log(` Toolbox Vault · Version Bump (${labelMap[KIND]})`);
console.log("────────────────────────────────────────────────");
console.log(`  Old version        :  ${currentVersion}     build ${currentBuild || "(unset)"}`);
console.log(`  New version        :  ${nextVersion}     build ${nextBuild}`);
console.log("────────────────────────────────────────────────");
console.log("");
console.log("  When uploading to EAS / App Store Connect, enter:");
console.log("");
console.log(`     Version       (CFBundleShortVersionString) :  ${nextVersion}`);
console.log(`     Build number  (CFBundleVersion)            :  ${nextBuild}`);
console.log("");
console.log("  When uploading to Google Play, enter:");
console.log("");
console.log(`     versionName  :  ${nextVersion}`);
console.log(`     versionCode  :  ${nextBuild}`);
console.log("");
console.log("  Files updated:");
console.log("    • frontend/app.json");
console.log("    • frontend/package.json");
console.log("");
console.log("  Next:  eas build --platform ios   (or)   eas build --platform android");
console.log("────────────────────────────────────────────────\n");
