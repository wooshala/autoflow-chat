package com.autoflow.staff

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        StaffNotificationChannels.create(this)
        requestNotificationPermissionIfNeeded()

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                captureInviteTokenFromUrl(url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                captureInviteTokenFromWebStorage()
            }
        }
        setContentView(webView)

        refreshFcmToken()
        webView.loadUrl(resolveLaunchUrl(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (::webView.isInitialized) {
            webView.loadUrl(resolveLaunchUrl(intent))
        }
    }

    private fun resolveLaunchUrl(intent: Intent?): String {
        val messageId = intent?.getStringExtra(EXTRA_OPEN_MESSAGE_ID).orEmpty()
        val base = intent?.dataString?.takeIf { it.startsWith(WEB_BASE_URL) } ?: STAFF_CHAT_URL
        if (messageId.isBlank()) return base
        val uri = Uri.parse(base)
        return uri.buildUpon()
            .appendQueryParameter("open_message_id", messageId)
            .build()
            .toString()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_POST_NOTIFICATIONS)
    }

    private fun refreshFcmToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) return@addOnCompleteListener
            val token = task.result ?: return@addOnCompleteListener
            StaffPrefs.setFcmToken(this, token)
            StaffDeviceRegistrar.tryRegister(this)
        }
    }

    private fun captureInviteTokenFromUrl(url: String) {
        val token = Uri.parse(url).getQueryParameter("t")?.trim().orEmpty()
        if (token.isBlank()) return
        StaffPrefs.setInviteToken(this, token)
        StaffDeviceRegistrar.tryRegister(this)
    }

    private fun captureInviteTokenFromWebStorage() {
        webView.evaluateJavascript(
            "window.localStorage && window.localStorage.getItem('autoflow_staff_invite_token_v1')"
        ) { raw ->
            val token = raw
                ?.removeSurrounding("\"")
                ?.replace("\\\"", "\"")
                ?.trim()
                .orEmpty()
            if (token.isBlank() || token == "null") return@evaluateJavascript
            StaffPrefs.setInviteToken(this, token)
            StaffDeviceRegistrar.tryRegister(this)
        }
    }

    companion object {
        const val WEB_BASE_URL = "https://autoflow-mvp.vercel.app"
        const val STAFF_CHAT_URL = "$WEB_BASE_URL/staff-chat"
        const val EXTRA_OPEN_MESSAGE_ID = "open_message_id"
        private const val REQUEST_POST_NOTIFICATIONS = 1001
    }
}
