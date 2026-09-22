package com.autoflow.staff

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri

object StaffNotificationChannels {
    /** Legacy channel (default system sound). Kept for existing installs; do not delete. */
    const val STAFF_MESSAGES = "autoflow_staff_messages"

    /** v2 — original notify-036 (quieter). Kept; do not delete. */
    const val STAFF_MESSAGES_V2 = "autoflow_staff_messages_v2"

    /** v3 — loudness-normalized notify-036. Current normal path. */
    const val STAFF_MESSAGES_V3 = "autoflow_staff_messages_v3"

    const val STAFF_URGENT = "autoflow_staff_urgent"

    fun create(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val legacyNormal = NotificationChannel(
            STAFF_MESSAGES,
            "Staff messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "New AutoFlow staff chat messages"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 200, 100, 200)
            setSound(defaultSound, attrs)
        }

        val v2Sound = Uri.parse(
            "${android.content.ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.autoflow_notify_036}"
        )
        val normalV2 = NotificationChannel(
            STAFF_MESSAGES_V2,
            "Staff messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "New AutoFlow staff chat messages (custom sound v2)"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 200, 100, 200)
            setSound(v2Sound, attrs)
        }

        val v3Sound = Uri.parse(
            "${android.content.ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.autoflow_notify_036_loud}"
        )
        val normalV3 = NotificationChannel(
            STAFF_MESSAGES_V3,
            "Staff messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "New AutoFlow staff chat messages (custom sound v3)"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 200, 100, 200)
            setSound(v3Sound, attrs)
        }

        val urgent = NotificationChannel(
            STAFF_URGENT,
            "Urgent staff messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Urgent AutoFlow staff chat messages"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
            setSound(defaultSound, attrs)
        }

        manager.createNotificationChannels(listOf(legacyNormal, normalV2, normalV3, urgent))
    }

    fun channelForUrgency(urgency: String): String {
        return if (urgency == "urgent") STAFF_URGENT else STAFF_MESSAGES_V3
    }
}
