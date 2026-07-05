# sendStaffFcm.ts — Push Case Analysis (v4 §9)

File: `lib/push/sendStaffFcm.ts`

---

## Investigation

```typescript
return {
  token,
  notification,        // ← top-level notification payload
  data,
  android: { ... }      // ← Android-specific channel/sound
};
```

---

## Verdict: **Case A**

| Criterion | Finding |
|-----------|---------|
| Top-level `notification` | ✅ Present (line 57) |
| iOS banner without server change | ✅ Expected — FCM forwards `notification` to APNs |
| Android-only block | `android.notification.channelId` etc. — does not remove iOS delivery |

### Conclusion

**Server modification not required** for basic iPhone push banners in MVP.

---

## Optional future parity (not MVP-blocking)

If urgent/normal **sound differentiation** on iOS is required later, minimal allowed change:

```typescript
apns: {
  payload: {
    aps: {
      sound: data.urgency === 'urgent' ? 'default' : 'default',
      'mutable-content': 0
    }
  }
}
```

This is **Case B lite** — only if field testing shows iOS urgent messages need distinct handling.

---

## iOS client requirements (Layer 1)

Server Case A does not replace:

- APNs key in Firebase
- `GoogleService-Info.plist`
- Push capability + entitlements
- `UNUserNotificationCenter` delegate
- FCM token → `/api/staff/devices/register` with `platform: ios`

Implemented in `ios-staff/AutoFlowStaff/Services/StaffPushService.swift`.

---

## Regression note

If `sendStaffFcm.ts` is modified later for iOS parity, re-verify Android FCM delivery unchanged.
