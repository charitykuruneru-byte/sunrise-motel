# SunriseMotelApp — Android WebView wrapper (no booking logic inside).
# The website URL lives in ONE place: app/build.gradle.kts -> buildConfigField BASE_URL.
# Currently: "https://sunrise-motel.vercel.app" (permanent).
# Never point it at a trycloudflare.com tunnel URL — those expire on restart.

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
