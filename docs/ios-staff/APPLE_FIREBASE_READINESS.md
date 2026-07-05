# Apple / Firebase Readiness Checklist

Complete **Day 1** in parallel with iOS shell development.

---

## Apple Developer

| Item | Status | Owner | Notes |
|------|--------|-------|-------|
| Apple Developer Program active | ☐ | | $99/year |
| App ID `com.autoflow.staff` | ☐ | | Match Android package |
| Push Notifications capability | ☐ | | App ID + entitlements |
| Development signing cert | ☐ | | |
| Distribution cert | ☐ | | TestFlight |
| Provisioning (Development) | ☐ | | |
| Provisioning (App Store / TestFlight) | ☐ | | |
| App Store Connect app record | ☐ | | **Internal Testing only** — no public release |

---

## APNs

| Item | Status | Notes |
|------|--------|-------|
| APNs Auth Key (.p8) created | ☐ | Key ID + Team ID recorded |
| Key uploaded to Firebase Console | ☐ | Project Settings → Cloud Messaging |
| `aps-environment` in entitlements | ☐ | `development` for debug; production profile for TestFlight |

---

## Firebase

| Item | Status | Notes |
|------|--------|-------|
| iOS app added (`com.autoflow.staff`) | ☐ | Same Firebase project as Android |
| `GoogleService-Info.plist` downloaded | ☐ | **Never commit** — add to Xcode target |
| FCM enabled | ☐ | |
| APNs linked | ☐ | Required for iOS FCM tokens |

---

## TestFlight

| Item | Status | Notes |
|------|--------|-------|
| First build uploaded | ☐ | Release archive |
| Internal testing group | ☐ | Up to 100 testers |
| Tester invite link | ☐ | |
| Field device: Cleaner PIN login | ☐ | |
| Field device: push + tap | ☐ | |

---

## SHA / keys (if using Firebase Dynamic Links later)

Not required for MVP WebView shell.

---

## Blockers

If any **Firebase iOS** or **APNs** row is incomplete → **Push Layer 1 blocked** (chat still works; push manual test deferred).

Report completion in project channel before iPhone soak sign-off.
