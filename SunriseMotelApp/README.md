# SunriseMotelApp — Android WebView wrapper (no booking logic inside).
# The website URL lives in ONE place: app/build.gradle.kts -> buildConfigField BASE_URL.
# Currently: "https://sunrise-motel.vercel.app" (permanent).
# Never point it at a trycloudflare.com tunnel URL — those expire on restart.

## Release signing (ONE keystore forever — or users get duplicate icons)
1. Generate ONCE on any machine with Java (`C:\Program Files\Git\usr\bin\keytool.exe`
   works on this PC if plain `keytool` is missing):
   `keytool -genkey -v -keystore sunrise-motel-release.jks -alias sunrise -keyalg RSA -keysize 2048 -validity 10000`
   Passwords/alias must match `app/build.gradle.kts` signingConfigs (`Sunrise2026!` / `sunrise`).
   Place the file at `SunriseMotelApp/sunrise-motel-release.jks` (gitignored).
2. Encode + save as GitHub secret (run in Git Bash / repo root):
   `base64 -w0 SunriseMotelApp/sunrise-motel-release.jks` → copy output →
   repo Settings → Secrets → Actions → New secret `KEYSTORE_BASE64` → paste.
   The workflow restores it before every build, so every APK shares one signature.
3. NEVER delete the `.jks`. Lose it = new signature = duplicates forever.
   `versionCode` goes +1 every release (currently 4 / "1.3") with the same
   `applicationId com.sunrisemotel.app` → Android shows "Updating…".
   The manager app (`SunriseAdminApp`, `com.sunrisemotel.admin`) is signed with
   this SAME keystore by relative path, so there is still only one secret to keep.
4. Users already seeing 2 icons: keep the NEW one (v1.2+), uninstall the old v1.0.
5. Version truth for the in-app update prompt lives in `public/version.json`
   (bump `latestVersionCode` with every `versionCode`) — the guest app reads
   `/api/version`, the manager app reads `/api/version?app=admin`.

## Broadcast push (Firebase) — 2 files from YOU to activate
1. Firebase console (https://console.firebase.google.com) → Add project
   "sunrise-motel" → Add Android app, package `com.sunrisemotel.app` →
   download `google-services.json` → place at `SunriseMotelApp/app/google-services.json`
   (gitignored — never committed).
2. In `app/build.gradle.kts` uncomment the two lines:
   `id("com.google.gms.google-services")` and
   `implementation("com.google.firebase:firebase-messaging:23.4.0")`.
3. Project Settings → Service accounts → Generate new private key →
   paste the WHOLE JSON into Vercel env `FIREBASE_SERVICE_ACCOUNT_JSON`
   (or `FIREBASE_PROJECT_ID` + JSON). Redeploy.
4. Next cloud build subscribes every install to topic `all_users`;
   send from the site at `/admin/notifications` (admin login required).
