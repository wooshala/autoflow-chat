# Android Native FCM Notification Channel (PR1 P0)

**Scope:** 모바일 화면 OFF / background / lock — **웹(WebView/PWA)으로는 보장 불가**. Native FCM + `NotificationChannel` 필수.

관련: [native-staff-tts.md](./native-staff-tts.md)

---

## 채널 스펙

| 항목 | 값 |
|------|-----|
| Channel ID | `autoflow_staff_messages` |
| Name | `Staff messages` |
| Importance | `IMPORTANCE_HIGH` |
| Sound | `RingtoneManager.TYPE_NOTIFICATION` (default) |
| Vibration | enabled |
| Lights | optional |

Urgent 메시지용 별도 채널 (권장):

| Channel ID | `autoflow_staff_urgent` |
| Importance | `IMPORTANCE_HIGH` |
| Vibration | long pattern `[0, 400, 200, 400]` |

---

## Kotlin 초기화 (Application.onCreate)

```kotlin
private fun createStaffNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(NotificationManager::class.java)

    val normal = NotificationChannel(
        "autoflow_staff_messages",
        "Staff messages",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "New chat messages for cleaning staff"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 200, 100, 200)
        setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
    }

    val urgent = NotificationChannel(
        "autoflow_staff_urgent",
        "Urgent staff messages",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "Urgent room / repair alerts"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
        setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
    }

    mgr.createNotificationChannel(normal)
    mgr.createNotificationChannel(urgent)
}
```

---

## FCM 수신 (FirebaseMessagingService)

```kotlin
override fun onMessageReceived(msg: RemoteMessage) {
    val data = msg.data
    val urgency = data["urgency"] ?: "normal"
    val channelId = if (urgency == "urgent") "autoflow_staff_urgent" else "autoflow_staff_messages"
    val body = data["translated_text_ru"]?.takeIf { it.isNotBlank() }
        ?: data["original_text"]
        ?: return

    val notification = NotificationCompat.Builder(this, channelId)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle(data["room_no"]?.let { "${it}호" } ?: "AutoFlow")
        .setContentText(body)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .setContentIntent(openStaffChatPendingIntent(data["message_id"]))
        .build()

    NotificationManagerCompat.from(this).notify(data["message_id"]?.hashCode() ?: 0, notification)

    // Optional foreground TTS — see nativeStaffNotifyHandler.ts / planNativeStaffNotify()
}
```

**P0:** `notification` + `data` payload 모두 서버에서 전송 권장 (백그라운드 kill 시 data-only만으로는 헤드업 미표시 가능).

서버 payload: `lib/push/buildStaffFcmPayload.ts`

---

## 판정 (시나리오 C/D)

| 상태 | 기대 |
|------|------|
| App background | 시스템 알림창 + default sound + vibration |
| Screen lock | 동일 |
| Foreground | in-app + optional TTS (`auto_tts_enabled`) |

웹 `/staff-chat` hidden tab의 `Notification` API는 **보조**이며, 화면 OFF에서는 native FCM만 P0 충족.

---

## 서버 활성화

```env
STAFF_FCM_ENABLED=1
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

`sendStaffPushAfterMessage` → device token lookup → Firebase Admin `send` (TODO: `staff_device_tokens` migration).
