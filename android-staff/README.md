# AutoFlow Staff Android

Native Android WebView shell for cleaning staff.

The app loads the deployed staff web UI and keeps native Android responsible for FCM token registration and lock-screen/background notifications.

## Scope

- WebView loads `https://autoflow-mvp.vercel.app/staff-chat`.
- Participant invite token (`?t=...`) is persisted in SharedPreferences and re-applied on cold start.
- Firebase Messaging obtains the native FCM token (only when `google-services.json` is present).
- The app registers `{ invite_token, fcm_token, device_key }` with `/api/staff/devices/register` only when both invite and FCM tokens exist.
- Native notification channels:
  - `autoflow_staff_messages`
  - `autoflow_staff_urgent`
- `StaffFirebaseMessagingService` displays notification sound, vibration, and heads-up eligible notifications.
- Deep links: `https://autoflow-mvp.vercel.app/staff-chat?...` open in this app (chooser if App Links verification is not configured).

## Local Setup

1. Create an Android Firebase app with package name `com.autoflow.staff`.
2. Download `google-services.json`.
3. Place it at `android-staff/app/google-services.json`.
4. Do not commit `google-services.json`; it is ignored by `android-staff/.gitignore`.
5. Open `android-staff/` in Android Studio and sync Gradle.
6. Build an APK from Android Studio or with Gradle.

The Google Services plugin is applied only when `app/google-services.json`
exists, so Android Studio can open and sync the skeleton before the private
Firebase file is present.

## Invite Token Flow

The web `/staff-chat` UI (unchanged) accepts:

| Source | Format |
|--------|--------|
| URL query | `?t=PARTICIPANT_TOKEN` (personal invite) |
| URL query | `?join=ENTRY_TOKEN` (entry QR — join form, then web saves `?t=` to localStorage) |
| WebView localStorage | `autoflow_staff_invite_token_v1` |

Native wrapper behavior:

1. **First launch with invite** — open a valid staff invite URL (deep link, adb, or “Open with app”).
2. **Capture** — `?t=` from URL or localStorage after join → `StaffPrefs`.
3. **Cold start** — if a participant token is saved, load `/staff-chat?t=SAVED_TOKEN`.
4. **No token** — load bare `/staff-chat` (web shows invalid invite until step 1).

FCM device registration runs only when **both** invite token and Firebase are available.

## Device Test Procedure

Use a physical Android device. Emulator behavior is not enough for lock-screen notification validation.

### A. No Firebase (dev skeleton)

1. Build/run without `google-services.json`.
2. Launch from app icon → invalid invite screen (expected if no token saved).
3. Logcat: `Firebase not configured; skipping FCM token refresh` — no crash.

### B. Invite token (required before chat works)

1. Copy a personal invite URL from PC `/chat` staff invite panel:  
   `https://autoflow-mvp.vercel.app/staff-chat?t=VALID_TOKEN`
2. Open in app via one of:
   - Tap link on device → choose AutoFlow Staff (deep link intent-filter)
   - adb explicit intent:
     ```bash
     adb shell am start -a android.intent.action.VIEW \
       -d "https://autoflow-mvp.vercel.app/staff-chat?t=VALID_TOKEN" \
       -n com.autoflow.staff/.MainActivity
     ```
3. Confirm chat UI loads (not invalid invite).
4. Logcat: `Saved participant invite token from URL (?t=)`
5. Force-stop app, relaunch from icon → chat loads again via saved token.
6. Logcat: `Using saved participant invite token in launch URL`

### C. Entry QR (`?join=`)

1. Scan/open entry QR link: `/staff-chat?join=ENTRY_TOKEN`
2. Complete join form in WebView.
3. After join, web saves participant token to localStorage; native captures it on page finish.
4. Next cold start uses saved `?t=` token.

### D. FCM (with google-services.json)

1. After invite token is saved, accept Android 13+ notification permission when shown.
2. Logcat: `FCM token obtained; attempting device register`
3. Confirm server logs show `/api/staff/devices/register` success.
4. From PC `/chat`, send a normal message.
5. Verify foreground / background / lock-screen notification behavior.
6. Tap notification and confirm `/staff-chat?open_message_id=...` opens (existing query params preserved when token was in URL).

### E. Revoke / reinstall

1. Revoke staff invite on PC → web shows revoked screen on next validation.
2. Clear app data → invalid invite until a new invite URL is opened again.

## Operational Notes

- React/Next.js staff UI changes still deploy through Vercel.
- APK updates are needed only for native WebView, Firebase, permission, or notification behavior changes.
- Existing PC Tauri shell under `src-tauri/` is unrelated.
- Do not hardcode invite tokens in source or committed build config.
