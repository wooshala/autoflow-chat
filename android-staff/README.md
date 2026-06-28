# AutoFlow Staff Android

Native Android WebView shell for cleaning staff.

The app loads the deployed staff web UI and keeps native Android responsible for FCM token registration and lock-screen/background notifications.

## Scope

- WebView loads `https://autoflow-mvp.vercel.app/staff-chat`.
- Firebase Messaging obtains the native FCM token.
- The app registers `{ invite_token, fcm_token, device_key }` with `/api/staff/devices/register`.
- Native notification channels:
  - `autoflow_staff_messages`
  - `autoflow_staff_urgent`
- `StaffFirebaseMessagingService` displays notification sound, vibration, and heads-up eligible notifications.

## Local Setup

1. Create an Android Firebase app with package name `com.autoflow.staff`.
2. Download `google-services.json`.
3. Place it at `android-staff/app/google-services.json`.
4. Do not commit `google-services.json`; it is ignored by `android-staff/.gitignore`.
5. Open `android-staff/` in Android Studio and sync Gradle.
6. Build an APK from Android Studio or with Gradle.

## Token Registration

The app registers only after both values are available:

- FCM token from Firebase Messaging.
- staff invite token from either:
  - WebView URL query `?t=...`
  - WebView localStorage key `autoflow_staff_invite_token_v1`

If the staff page opens without an invite token, registration waits until the token appears.

## Device Test Procedure

Use a physical Android device. Emulator behavior is not enough for lock-screen notification validation.

1. Install APK.
2. Open the app with a valid `/staff-chat?t=...` invite link or complete invite login in the WebView.
3. Accept the Android 13+ notification permission prompt when shown.
4. Confirm server logs show `/api/staff/devices/register` success.
5. From PC `/chat`, send a normal message.
6. Verify foreground behavior:
   - WebView shows the message.
   - Native notification may appear depending on FCM foreground delivery.
7. Press Home, wait 30 seconds, send another message.
   - Verify Android notification appears.
   - Verify sound and vibration.
   - Tap notification and confirm `/staff-chat?open_message_id=...` opens.
8. Turn the screen off, wait 60 seconds, send another message.
   - Verify lock-screen notification, sound, and vibration.
9. Test urgent message.
   - Confirm channel `autoflow_staff_urgent` is used.
10. Revoke the staff invite.
   - Confirm new sends do not target the revoked token after server state updates.
11. Uninstall/reinstall or clear app data.
   - Confirm a fresh FCM token registers.

## Operational Notes

- React/Next.js staff UI changes still deploy through Vercel.
- APK updates are needed only for native WebView, Firebase, permission, or notification behavior changes.
- Existing PC Tauri shell under `src-tauri/` is unrelated.
