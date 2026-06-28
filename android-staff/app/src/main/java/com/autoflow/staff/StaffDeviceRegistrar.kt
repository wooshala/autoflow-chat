package com.autoflow.staff

import android.content.Context
import android.os.Build
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

object StaffDeviceRegistrar {
    private val executor = Executors.newSingleThreadExecutor()

    fun tryRegister(context: Context) {
        val appContext = context.applicationContext
        val fcmToken = StaffPrefs.getFcmToken(appContext)
        val inviteToken = StaffPrefs.getInviteToken(appContext)
        if (fcmToken.isBlank() || inviteToken.isBlank()) return

        executor.execute {
            try {
                val payload = buildJson(
                    mapOf(
                        "invite_token" to inviteToken,
                        "fcm_token" to fcmToken,
                        "platform" to "android",
                        "device_key" to StaffPrefs.getOrCreateDeviceKey(appContext),
                        "device_label" to "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                        "app_version" to BuildConfig.VERSION_NAME
                    )
                )

                val conn = (URL(REGISTER_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 10_000
                    readTimeout = 10_000
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                }
                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(payload) }
                val code = conn.responseCode
                if (code in 200..299) {
                    StaffPrefs.setLastRegisterOkAt(appContext, System.currentTimeMillis())
                }
                conn.disconnect()
            } catch (_: Exception) {
                // Registration is best effort; token refresh/onResume can retry later.
            }
        }
    }

    private fun buildJson(values: Map<String, String>): String {
        return values.entries.joinToString(prefix = "{", postfix = "}") { (key, value) ->
            "\"${escape(key)}\":\"${escape(value)}\""
        }
    }

    private fun escape(value: String): String {
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
    }

    private const val REGISTER_URL = "https://autoflow-mvp.vercel.app/api/staff/devices/register"
}
