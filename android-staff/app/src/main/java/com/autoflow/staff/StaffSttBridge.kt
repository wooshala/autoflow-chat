package com.autoflow.staff

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/**
 * Android Push-to-Talk (STT, ru-RU) bridge exposed to the WebView as
 * `window.AutoFlowStaffStt`. Input method only — the recognized transcript is
 * handed to the web app, which sends it through its EXISTING chat send path.
 *
 * Contract (docs/design/staff-chat-stt.md):
 *   web -> native : start() / stop() / cancel()
 *   native -> web : window.onSttState / onSttResult / onSttError / onSttRms
 *
 * SpeechRecognizer must be created and driven on the main thread. The
 * @JavascriptInterface methods arrive on a binder thread, so every recognizer
 * operation is posted to the UI thread.
 */
class StaffSttBridge(
    private val activity: Activity,
    private val webView: WebView
) {
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private var awaitingPermission = false

    // ---------- web -> native ----------

    @JavascriptInterface
    fun start() {
        activity.runOnUiThread {
            if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
                emitError("recognizer_unavailable")
                return@runOnUiThread
            }
            if (!hasAudioPermission()) {
                awaitingPermission = true
                activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_RECORD_AUDIO)
                return@runOnUiThread
            }
            beginListening()
        }
    }

    @JavascriptInterface
    fun stop() {
        activity.runOnUiThread {
            if (listening) {
                try {
                    recognizer?.stopListening()
                } catch (_: Exception) {
                }
            }
        }
    }

    @JavascriptInterface
    fun cancel() {
        activity.runOnUiThread {
            listening = false
            try {
                recognizer?.cancel()
            } catch (_: Exception) {
            }
            emitState("IDLE")
        }
    }

    /** Called by MainActivity.onRequestPermissionsResult for RECORD_AUDIO. */
    fun onRecordAudioPermissionResult(granted: Boolean) {
        if (!awaitingPermission) return
        awaitingPermission = false
        activity.runOnUiThread {
            if (granted) beginListening() else emitError("permission_denied")
        }
    }

    /** Called by MainActivity.onDestroy. */
    fun release() {
        activity.runOnUiThread {
            listening = false
            try {
                recognizer?.destroy()
            } catch (_: Exception) {
            }
            recognizer = null
        }
    }

    // ---------- internals (main thread) ----------

    private fun beginListening() {
        if (listening) return
        val sr = recognizer ?: SpeechRecognizer.createSpeechRecognizer(activity).also {
            it.setRecognitionListener(listener)
            recognizer = it
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, STT_LOCALE)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, STT_LOCALE)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        try {
            listening = true
            sr.startListening(intent)
            haptic()
            emitState("RECORDING")
        } catch (_: Exception) {
            listening = false
            emitError("busy")
        }
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onRmsChanged(rmsdB: Float) {
            // SpeechRecognizer RMS is roughly [-2 .. 10] dB → normalize to [0 .. 1].
            val level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
            emitRms(level)
        }

        override fun onEndOfSpeech() {
            listening = false
            emitState("RECOGNIZING")
        }

        override fun onError(error: Int) {
            listening = false
            emitError(mapError(error))
        }

        override fun onResults(results: Bundle?) {
            listening = false
            val text = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                .orEmpty()
            emitResult(text)
        }
    }

    private fun mapError(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no_match"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission_denied"
        else -> "timeout"
    }

    private fun hasAudioPermission(): Boolean =
        activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun haptic() {
        try {
            val vib: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib?.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vib?.vibrate(30)
            }
        } catch (_: Exception) {
        }
    }

    // ---------- native -> web ----------

    private fun emitState(state: String) = callJs("window.onSttState", "'$state'")
    private fun emitError(code: String) = callJs("window.onSttError", "'$code'")
    private fun emitRms(level: Float) = callJs("window.onSttRms", level.toString())
    private fun emitResult(text: String) = callJs("window.onSttResult", JSONObject.quote(text))

    private fun callJs(fn: String, arg: String) {
        activity.runOnUiThread {
            try {
                webView.evaluateJavascript("if (typeof $fn === 'function') { $fn($arg); }", null)
            } catch (_: Exception) {
            }
        }
    }

    companion object {
        private const val STT_LOCALE = "ru-RU"
        const val REQUEST_RECORD_AUDIO = 1006
    }
}
