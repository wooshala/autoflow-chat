# Regression, Production Soak & Rollback (v4 §12–13)

---

## Production flip sequence

```
1. Staging regression PASS (Android Chrome)
2. Production deploy (low-traffic window)
3. Android production soak: 1–2 days
4. iPhone TestFlight (after soak starts, not same hour)
```

During soak: 🎤 hidden on Android WebView/APK is **expected** (no native STT bridge).

---

## Android production soak checklist

Daily for 1–2 days after STT React hits production:

- [ ] Cleaner PIN login
- [ ] Chat send/receive
- [ ] Room + Quick Phrase
- [ ] Photo upload
- [ ] Translation on PC /chat receive
- [ ] No elevated error rate in Vercel logs
- [ ] No `[STAFF_CHAT_SEND_*]` regression reports from field

---

## Rollback trigger

Any of:

- Login failure spike
- send() / photo upload failure
- Translation/telemetry regression
- Unplanned 🎤 UI breaking text send

---

## Rollback procedure

**Scope:** STT React merge commits only.

```bash
# Identify merge commits (newest first)
git log --oneline -- docs/design/staff-chat-stt.md lib/hooks/useStaffPushToTalk.ts

# Revert series (example — verify SHAs on main)
git revert 8744b5f 2af4a10 b39e5d7

# Deploy production immediately
# Re-verify: login, chat, photo, send (🎤 returns to hidden/stub)
```

Do **not** revert iOS native code unless iOS-specific defect — iOS `ios-staff/` is independent of STT React revert.

---

## Post-rollback verification (minimal)

| Test | Required |
|------|----------|
| Cleaner PIN login | ✅ |
| Chat | ✅ |
| Photo | ✅ |
| Send | ✅ |

---

## Evidence template

```
Regression / Soak Report
Date:
Environment: staging | production
Tester device: Android Chrome / iPhone TestFlight
Result: PASS | FAIL
Notes:
Screenshots:
Log excerpts:
```
