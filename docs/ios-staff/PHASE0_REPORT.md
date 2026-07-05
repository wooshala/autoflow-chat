# Phase 0 Report — iPhone Staff MVP

Date: 2026-07-05  
Branch: `feat/ios-staff-mvp` (based on `origin/main`)

---

## Phase 0-1: STT React branch investigation

| Item | Result |
|------|--------|
| Branch | `feature/staff-chat-stt-ru` |
| Tip commit | `8744b5f` (same as `origin/main`) |
| Commits not in main | **None** — already merged |
| Rebase needed | **No** |
| Merge conflicts | **N/A** |

### Files merged on main (STT only)

- `lib/hooks/useStaffPushToTalk.ts`
- `components/staff-chat/StaffSttOverlay.tsx`
- `app/staff-chat/StaffChatClient.tsx` (🎤 press-hold; bridge detection)
- `docs/design/staff-chat-stt.md`
- `lib/i18n/messages.ts` (STT strings)

### STT behavior (current main)

- 🎤 visible only when `window.AutoFlowStaffStt.start` exists
- **No auto-send** — transcript fills input; manual send (commit `8744b5f`)
- Android production APK: **no bridge** → 🎤 hidden (intentional per v4 §0-4)

---

## Phase 0-2: STT React main merge

**Status: ✅ Already complete on `origin/main`**

No additional merge required before iOS shell work.

Revert target (if regression): commits `8744b5f`, `2af4a10`, `b39e5d7` (single revert series).

---

## Phase 0-3: Regression Gate (pending — human execution)

Production WebView cannot preview pre-deploy React. Required sequence:

```
STT on main (done)
  → Deploy to Staging
  → Android Chrome → staging /staff-chat
  → Regression checklist
  → Production deploy (low-traffic window)
  → Android soak 1–2 days
  → iPhone TestFlight
```

### Checklist (Android Chrome + Staging)

- [ ] Cleaner PIN login
- [ ] Invite link login
- [ ] Chat send/receive
- [ ] Room selection
- [ ] Quick Phrase
- [ ] Photo upload
- [ ] Translation
- [ ] Telemetry / client_nonce (logs)
- [ ] 🎤 hidden in browser (expected)

Evidence: screenshots + `[STAFF_CHAT_*]` logs + signed report.

**Regression → block production deploy.**

---

## Phase 0-4: Android STT policy

| Policy | Status |
|--------|--------|
| android-staff modified | **No** (this project) |
| Android STT implemented | **No** |
| 🎤 on Android APK | Hidden (no bridge) — **intentional** |
| Prior stub (`voiceSoon`) | Replaced on web when bridge absent — **no operational loss** |

---

## Phase 0-5: Apple / Firebase readiness

See `APPLE_FIREBASE_READINESS.md` — **Day 1 parallel track required**.

---

## Push server analysis

See `PUSH_CASE_ANALYSIS.md` — **Case A** (top-level `notification` present); server change **not required for MVP banner**.

---

## Next steps

1. Complete Staging regression (Phase 0-3)
2. macOS: `xcodegen generate` + Firebase plist + TestFlight
3. Production flip per soak policy (§12 v4)
4. iPhone field test against production URL
