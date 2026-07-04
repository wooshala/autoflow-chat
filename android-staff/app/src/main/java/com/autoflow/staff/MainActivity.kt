package com.autoflow.staff

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import java.io.File

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingFileChooserParams: WebChromeClient.FileChooserParams? = null
    private var pendingPermissionRequest: PermissionRequest? = null
    private var cameraPhotoUri: Uri? = null
    private val sessionPollHandler = Handler(Looper.getMainLooper())
    private var sessionPollActive = false
    private var sttBridge: StaffSttBridge? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        StaffNotificationChannels.create(this)
        requestNotificationPermissionIfNeeded()

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        // Push-to-Talk (STT) bridge: window.AutoFlowStaffStt. Additive; loads only our own URL.
        sttBridge = StaffSttBridge(this, webView)
        webView.addJavascriptInterface(sttBridge!!, "AutoFlowStaffStt")
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                captureInviteTokenFromUrl(url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                captureInviteTokenFromWebStorage()
                captureStaffSessionFromWebStorage()
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: WebChromeClient.FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                pendingFileChooserParams = params

                if (params?.isCaptureEnabled == true && !hasCameraPermission()) {
                    requestPermissions(arrayOf(Manifest.permission.CAMERA), REQUEST_CAMERA)
                    return true
                }
                if (needsReadMediaPermission()) {
                    requestPermissions(arrayOf(Manifest.permission.READ_MEDIA_IMAGES), REQUEST_READ_MEDIA)
                    return true
                }
                return launchFileChooser(params)
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                val wantsCamera = request.resources.any { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                if (wantsCamera && !hasCameraPermission()) {
                    pendingPermissionRequest = request
                    requestPermissions(arrayOf(Manifest.permission.CAMERA), REQUEST_CAMERA_WEBVIEW)
                    return
                }
                runOnUiThread { request.grant(request.resources) }
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

    override fun onResume() {
        super.onResume()
        startStaffSessionPoll()
    }

    override fun onPause() {
        stopStaffSessionPoll()
        super.onPause()
    }

    override fun onDestroy() {
        stopStaffSessionPoll()
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        sttBridge?.release()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQUEST_FILE_CHOOSER) {
            val callback = filePathCallback
            filePathCallback = null
            val capturedUri = cameraPhotoUri
            cameraPhotoUri = null
            if (callback == null) return
            if (resultCode != RESULT_OK) {
                // 취소/실패 → null (WebView가 첨부 취소 처리)
                callback.onReceiveValue(null)
                return
            }
            // 갤러리 선택은 data.data 로, 카메라 촬영은 data 없이 EXTRA_OUTPUT(capturedUri)에 저장된다.
            val fromPicker = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            val results: Array<Uri>? = when {
                fromPicker != null && fromPicker.isNotEmpty() -> fromPicker
                capturedUri != null -> arrayOf(capturedUri)
                else -> null
            }
            callback.onReceiveValue(results)
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        when (requestCode) {
            REQUEST_CAMERA, REQUEST_CAMERA_WEBVIEW -> {
                val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
                pendingPermissionRequest?.let { request ->
                    if (granted) {
                        runOnUiThread { request.grant(request.resources) }
                    } else {
                        runOnUiThread { request.deny() }
                    }
                    pendingPermissionRequest = null
                }
                if (requestCode == REQUEST_CAMERA) {
                    val params = pendingFileChooserParams
                    pendingFileChooserParams = null
                    // grant → 카메라+갤러리, deny → 갤러리만. 어느 쪽이든 파일 선택은 진행.
                    launchFileChooser(params)
                }
            }
            REQUEST_READ_MEDIA -> {
                val params = pendingFileChooserParams
                pendingFileChooserParams = null
                launchFileChooser(params)
            }
            StaffSttBridge.REQUEST_RECORD_AUDIO -> {
                val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
                sttBridge?.onRecordAudioPermissionResult(granted)
            }
        }
    }

    private fun hasCameraPermission(): Boolean {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    }

    private fun needsReadMediaPermission(): Boolean {
        if (Build.VERSION.SDK_INT < 33) return false
        return checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED
    }

    private fun launchFileChooser(params: WebChromeClient.FileChooserParams?): Boolean {
        val callback = filePathCallback
        if (callback == null) return false

        val galleryIntent = try {
            params?.createIntent() ?: defaultImagePickIntent()
        } catch (e: Exception) {
            Log.w(TAG, "FileChooserParams.createIntent failed; using fallback picker", e)
            defaultImagePickIntent()
        }

        // capture 요청(<input capture>) + 카메라 권한이 있으면 촬영 인텐트를 chooser에 추가.
        cameraPhotoUri = null
        val cameraIntent =
            if (params?.isCaptureEnabled == true && hasCameraPermission()) buildCameraCaptureIntent() else null

        val chooser = Intent.createChooser(galleryIntent, "사진").apply {
            if (cameraIntent != null) {
                putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
            }
        }

        return try {
            startActivityForResult(chooser, REQUEST_FILE_CHOOSER)
            true
        } catch (e: ActivityNotFoundException) {
            Log.e(TAG, "No activity found for staff-chat file chooser", e)
            cameraPhotoUri = null
            filePathCallback?.onReceiveValue(null)
            filePathCallback = null
            false
        }
    }

    /** ACTION_IMAGE_CAPTURE 인텐트. 결과 사진은 FileProvider Uri(cameraPhotoUri)에 저장된다. */
    private fun buildCameraCaptureIntent(): Intent? {
        return try {
            val dir = File(cacheDir, "camera").apply { mkdirs() }
            val file = File(dir, "capture_${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            cameraPhotoUri = uri
            Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, uri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }
        } catch (e: Exception) {
            Log.w(TAG, "buildCameraCaptureIntent failed", e)
            cameraPhotoUri = null
            null
        }
    }

    private fun defaultImagePickIntent(): Intent {
        return Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "image/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*"))
        }
    }

    private fun resolveLaunchUrl(intent: Intent?): String {
        val messageId = intent?.getStringExtra(EXTRA_OPEN_MESSAGE_ID).orEmpty()
        val base = intent?.dataString?.takeIf { it.startsWith(WEB_BASE_URL) } ?: STAFF_CHAT_URL
        var uri = Uri.parse(base)
        // 긴급 복구(B): 직원 로그인 백엔드 미완성 → 기존 초대 링크 방식 유지.
        // launch URL에 t(초대 토큰)가 없고 이전에 저장된 토큰이 있으면 재주입해
        // 아이콘 실행(무토큰)에서도 /staff-chat 정상 진입(무토큰 시 "잘못된 링크" 회피).
        // 최초 진입은 여전히 초대 링크(딥링크 ?t=)로 해야 토큰이 저장된다.
        if (uri.getQueryParameter("t").isNullOrBlank()) {
            val savedToken = StaffPrefs.getInviteToken(this)
            if (savedToken.isNotBlank()) {
                uri = uri.buildUpon().appendQueryParameter("t", savedToken).build()
            }
        }
        if (messageId.isNotBlank()) {
            uri = uri.buildUpon().appendQueryParameter("open_message_id", messageId).build()
        }
        return uri.toString()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_POST_NOTIFICATIONS)
    }

    private fun refreshFcmToken() {
        // Firebase가 초기화되지 않은 빌드(google-services 미적용/미설정)에서는 FCM을 건너뛴다.
        // 미초기화 상태로 FirebaseMessaging.getInstance()를 호출하면 앱이 즉시 crash한다.
        if (FirebaseApp.getApps(this).isEmpty()) {
            Log.i(TAG, "[STAFF_FCM_SKIPPED] reason=firebase_not_initialized")
            return
        }
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) return@addOnCompleteListener
                val token = task.result ?: return@addOnCompleteListener
                StaffPrefs.setFcmToken(this, token)
                StaffDeviceRegistrar.tryRegister(this)
            }
        } catch (e: Exception) {
            Log.w(TAG, "[STAFF_FCM_SKIPPED] reason=fcm_init_failed", e)
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

    // Phase 3C: read the staff-account session token the web app stores on login.
    // Present  -> save + register (StaffDeviceRegistrar uses it as Bearer).
    // Absent   -> clear any stale native session (e.g. after web logout).
    // Never log the token value; only its presence.
    private fun captureStaffSessionFromWebStorage() {
        webView.evaluateJavascript(
            "window.localStorage && window.localStorage.getItem('autoflow_staff_session_token_v1')"
        ) { raw ->
            val token = raw
                ?.removeSurrounding("\"")
                ?.replace("\\\"", "\"")
                ?.trim()
                .orEmpty()
            if (token.isBlank() || token == "null") {
                StaffPrefs.clearSessionToken(this)
                Log.d(TAG, "staff session token: present=false (cleared stale if any)")
                return@evaluateJavascript
            }
            // Register only on a newly captured session (absent -> present) so a
            // repeated poll/navigation read does not re-register.
            val wasAbsent = StaffPrefs.getSessionToken(this).isBlank()
            StaffPrefs.setSessionToken(this, token)
            if (wasAbsent) {
                Log.d(TAG, "staff session token: present=true")
                StaffDeviceRegistrar.tryRegister(this)
                stopStaffSessionPoll()
            }
        }
    }

    // Phase 3C: while the app is foregrounded and no session token is captured yet,
    // poll localStorage every few seconds. Login happens in-page (no page reload), so
    // this is how an arbitrarily-timed first login gets picked up without an app
    // restart. Stops as soon as a token is captured; never starts if one already
    // exists (no duplicate polling/registration). Presence-only logging.
    private val staffSessionPoll = object : Runnable {
        override fun run() {
            if (StaffPrefs.getSessionToken(this@MainActivity).isNotBlank()) {
                stopStaffSessionPoll()
                return
            }
            if (::webView.isInitialized) captureStaffSessionFromWebStorage()
            sessionPollHandler.postDelayed(this, SESSION_POLL_INTERVAL_MS)
        }
    }

    private fun startStaffSessionPoll() {
        if (sessionPollActive) return
        if (StaffPrefs.getSessionToken(this).isNotBlank()) return
        sessionPollActive = true
        sessionPollHandler.post(staffSessionPoll)
    }

    private fun stopStaffSessionPoll() {
        sessionPollActive = false
        sessionPollHandler.removeCallbacks(staffSessionPoll)
    }

    companion object {
        private const val TAG = "AutoFlowStaff"

        const val WEB_BASE_URL = "https://autoflow-mvp.vercel.app"
        const val STAFF_CHAT_URL = "$WEB_BASE_URL/staff-chat"
        const val EXTRA_OPEN_MESSAGE_ID = "open_message_id"
        private const val REQUEST_POST_NOTIFICATIONS = 1001
        private const val REQUEST_FILE_CHOOSER = 1002
        private const val REQUEST_CAMERA = 1003
        private const val REQUEST_CAMERA_WEBVIEW = 1004
        private const val REQUEST_READ_MEDIA = 1005
        private const val SESSION_POLL_INTERVAL_MS = 3000L
    }
}
