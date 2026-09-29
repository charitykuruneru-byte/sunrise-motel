# SunriseAdminApp — the Sunrise Manager app (Android, WebView only)

The manager app is the same idea as `SunriseMotelApp`, aimed at the desk instead
of the guest: a thin WebView wrapper around the signed-in portal, so the arrivals
board is one tap from the home screen.

- Package: `com.sunrisemotel.admin` (locked forever — never change it, or staff
  get a second icon instead of an update)
- Label: **Sunrise Manager**
- Opens: `BuildConfig.BASE_URL` + `BuildConfig.START_PATH` → `/admin`
- Version truth: `GET /api/version?app=admin` → `public/version-admin.json`
  (the guest app reads `/api/version`, which is `public/version.json`)
- Website URL lives in ONE place: `app/build.gradle.kts` → `buildConfigField BASE_URL`.
  Never point it at a trycloudflare.com tunnel — those expire on restart.

## What is deliberately NOT here

- **No Firebase / no push.** The portal already has its notification page, and a
  manager build would need its own Firebase Android app + its own
  `google-services.json` (the plugin fails hard when the config has no matching
  package). If staff push is ever wanted: add the plugin + the
  `firebase-messaging` dependency, paste a `google-services.json` that contains
  `com.sunrisemotel.admin`, and copy the subscription + service from
  `SunriseMotelApp` with a `staff` topic instead of `all_users`.
- **No location, camera or contacts permission.** Pictures go through the system
  file chooser, which hands back one file at a time.

## Release signing

Same keystore as the guest app, on purpose: one identity to protect, and updates
always replace the previous install. The file is referenced, not copied —
`app/build.gradle.kts` points at `../../SunriseMotelApp/sunrise-motel-release.jks`
(Gradle's `file()` is module-relative) — and CI restores it once from the
`KEYSTORE_BASE64` secret (see `SunriseMotelApp/README.md`).

- `versionCode` starts at 1 = `"1.0"`. Bump it by +1 for EVERY release and update
  `public/version-admin.json` to match, or phones will never be told to update.
- Two different `applicationId`s can share one signing key safely: Android treats
  them as unrelated apps, which is exactly what we want.

## Launcher icon

- `mipmap-anydpi-v26/ic_launcher*.xml` → adaptive icon (API 26+) on a charcoal
  `#171513` ground, so it never reads as the guest app's cream tile.
- `mipmap-nodpi/ic_launcher*.png` → the fallback for API 21-25, which have no
  adaptive icons.

## CI

`.github/workflows/build-apk.yml` builds both projects on every push that touches
either folder, renames the artefacts to `SunriseMotel.apk` / `SunriseManager.apk`
(so the download page URLs resolve) and attaches both to the GitHub release.