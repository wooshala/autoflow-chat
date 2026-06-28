package com.autoflow.staff

import android.content.Context
import java.util.UUID

object StaffPrefs {
    private const val PREFS = "autoflow_staff_native"
    private const val KEY_FCM_TOKEN = "fcm_token"
    private const val KEY_INVITE_TOKEN = "invite_token"
    private const val KEY_DEVICE_KEY = "device_key"
    private const val KEY_LAST_REGISTER_OK_AT = "last_register_ok_at"

    fun setFcmToken(context: Context, token: String) {
        context.prefs().edit().putString(KEY_FCM_TOKEN, token).apply()
    }

    fun getFcmToken(context: Context): String {
        return context.prefs().getString(KEY_FCM_TOKEN, "").orEmpty()
    }

    fun setInviteToken(context: Context, token: String) {
        context.prefs().edit().putString(KEY_INVITE_TOKEN, token).apply()
    }

    fun getInviteToken(context: Context): String {
        return context.prefs().getString(KEY_INVITE_TOKEN, "").orEmpty()
    }

    fun getOrCreateDeviceKey(context: Context): String {
        val prefs = context.prefs()
        val existing = prefs.getString(KEY_DEVICE_KEY, "").orEmpty()
        if (existing.isNotBlank()) return existing
        val created = "android_${UUID.randomUUID()}"
        prefs.edit().putString(KEY_DEVICE_KEY, created).apply()
        return created
    }

    fun setLastRegisterOkAt(context: Context, value: Long) {
        context.prefs().edit().putLong(KEY_LAST_REGISTER_OK_AT, value).apply()
    }

    private fun Context.prefs() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
