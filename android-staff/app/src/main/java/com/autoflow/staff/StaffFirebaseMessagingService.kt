package com.autoflow.staff

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class StaffFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        StaffPrefs.setFcmToken(this, token)
        StaffDeviceRegistrar.tryRegister(this)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val messageId = data["message_id"].orEmpty()
        val urgency = data["urgency"].orEmpty()
        val room = data["room_no"].orEmpty()
        val body = data["translated_text_ru"]?.takeIf { it.isNotBlank() }
            ?: data["original_text"]?.takeIf { it.isNotBlank() }
            ?: message.notification?.body
            ?: return

        val title = message.notification?.title
            ?: if (room.isNotBlank()) "$room AutoFlow" else "AutoFlow Staff"

        showNotification(
            messageId = messageId,
            channelId = StaffNotificationChannels.channelForUrgency(urgency),
            title = title,
            body = body
        )
    }

    private fun showNotification(messageId: String, channelId: String, title: String, body: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(MainActivity.EXTRA_OPEN_MESSAGE_ID, messageId)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            messageId.hashCode(),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = Notification.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .build()

        val id = messageId.takeIf { it.isNotBlank() }?.hashCode() ?: System.currentTimeMillis().toInt()
        getSystemService(NotificationManager::class.java).notify(id, notification)
    }
}
