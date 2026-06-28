package com.autoflow.staff

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager

object StaffNotificationChannels {
    const val STAFF_MESSAGES = "autoflow_staff_messages"
    const val STAFF_URGENT = "autoflow_staff_urgent"

    fun create(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val normal = NotificationChannel(
            STAFF_MESSAGES,
            "Staff messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "New AutoFlow staff chat messages"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 200, 100, 200)
            setSound(sound, attrs)
        }

        val urgent = NotificationChannel(
            STAFF_URGENT,
            "Urgent staff messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Urgent AutoFlow staff chat messages"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
            setSound(sound, attrs)
        }

        manager.createNotificationChannels(listOf(normal, urgent))
    }

    fun channelForUrgency(urgency: String): String {
        return if (urgency == "urgent") STAFF_URGENT else STAFF_MESSAGES
    }
}
