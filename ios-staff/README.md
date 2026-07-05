# AutoFlow Staff — iOS (MVP)

Native **WKWebView** shell for cleaning staff on iPhone. Loads the same React `/staff-chat` as Android.

> **Regression Zero:** This project does **not** modify `android-staff/` or ship Android STT.

## Requirements

- macOS + Xcode 15+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- Apple Developer Program (TestFlight)
- Firebase iOS app (`com.autoflow.staff`) + `GoogleService-Info.plist`
- APNs Authentication Key (.p8) uploaded to Firebase Console

## Generate Xcode project

```bash
cd ios-staff
xcodegen generate
open AutoFlowStaff.xcodeproj
```

Add `GoogleService-Info.plist` to the `AutoFlowStaff` target (gitignored).

## URL policy

| Build | URL |
|-------|-----|
| **Release** | `https://autoflow-mvp.vercel.app/staff-chat` only |
| **Debug** | Production default; optional staging via scheme env `STAFF_STAGING_BASE_URL=https://your-preview.vercel.app` |

Never ship Debug/staging URLs in Release builds.

## Native features

| Feature | Implementation |
|---------|----------------|
| WebView | `StaffWebViewController` |
| Login / chat / room / phrases | React (unchanged) |
| Camera / gallery | `WKUIDelegate` + `UIImagePickerController` / `PHPicker` (no JS bridge) |
| STT (ru-RU) | `StaffSttBridge` → `window.AutoFlowStaffStt` |
| Push | Firebase Messaging + APNs |
| Notification tap | `open_message_id` → WebView reload |
| Session resume | `autoflow_staff_session_token_v1` in WebView localStorage |

## STT contract

See `docs/design/staff-chat-stt.md` (on `main`).

- Input assist only — **no auto-send**
- Transcript fills existing input; staff presses send manually

## Device registration

POST `https://autoflow-mvp.vercel.app/api/staff/devices/register`

- `platform: "ios"`
- Bearer session token (Cleaner PIN login) or `invite_token`

## TestFlight

1. Archive **Release** configuration
2. Upload to App Store Connect → **Internal Testing**
3. Add tester Google/Apple IDs (up to 100)

See `docs/ios-staff/APPLE_FIREBASE_READINESS.md`.

## Related docs

- `docs/ios-staff/PHASE0_REPORT.md` — STT merge / regression gate
- `docs/ios-staff/PUSH_CASE_ANALYSIS.md` — sendStaffFcm Case A/B
- `docs/ios-staff/REGRESSION_ROLLBACK.md` — production soak & revert
