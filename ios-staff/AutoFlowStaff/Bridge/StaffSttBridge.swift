import AVFoundation
import Speech
import UIKit
import WebKit

/// Push-to-Talk STT bridge — contract: docs/design/staff-chat-stt.md
/// Exposes window.AutoFlowStaffStt { start, stop, cancel } via injected JS + message handler.
/// Locale fixed ru-RU (never device default).
final class StaffSttBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private let speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var listening = false
    private var awaitingPermission = false

    init(webView: WKWebView) {
        self.webView = webView
        self.speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "ru-RU"))
        super.init()
    }

    /// Inject bridge object at document start so React can detect AutoFlowStaffStt.start.
    static func userScript() -> WKUserScript {
        let source = """
        (function() {
          if (window.AutoFlowStaffStt) return;
          window.AutoFlowStaffStt = {
            start: function() { window.webkit.messageHandlers.autoflowStt.postMessage({cmd:'start'}); },
            stop: function() { window.webkit.messageHandlers.autoflowStt.postMessage({cmd:'stop'}); },
            cancel: function() { window.webkit.messageHandlers.autoflowStt.postMessage({cmd:'cancel'}); }
          };
        })();
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "autoflowStt",
              let body = message.body as? [String: String],
              let cmd = body["cmd"] else { return }
        switch cmd {
        case "start": start()
        case "stop": stop()
        case "cancel": cancel()
        default: break
        }
    }

    private func start() {
        DispatchQueue.main.async { [weak self] in
            self?.startOnMain()
        }
    }

    private func startOnMain() {
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            emitError("recognizer_unavailable")
            return
        }
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard let self else { return }
                switch status {
                case .authorized:
                    AVAudioSession.sharedInstance().requestRecordPermission { granted in
                        DispatchQueue.main.async {
                            if granted {
                                self.beginListening(recognizer: recognizer)
                            } else {
                                self.emitError("permission_denied")
                            }
                        }
                    }
                default:
                    self.emitError("permission_denied")
                }
            }
        }
    }

    private func beginListening(recognizer: SFSpeechRecognizer) {
        if listening { return }
        recognitionTask?.cancel()
        recognitionTask = nil

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            emitError("recognizer_unavailable")
            return
        }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest else {
            emitError("recognizer_unavailable")
            return
        }
        recognitionRequest.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self else { return }
            if let result, result.isFinal {
                let text = result.bestTranscription.formattedString
                self.teardownAudio()
                self.emitResult(text)
                self.emitState("IDLE")
            } else if error != nil {
                self.teardownAudio()
                self.emitError("no_match")
                self.emitState("IDLE")
            }
        }

        let format = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
            self?.emitRms(from: buffer)
        }

        do {
            audioEngine.prepare()
            try audioEngine.start()
            listening = true
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            emitState("RECORDING")
        } catch {
            teardownAudio()
            emitError("recognizer_unavailable")
        }
    }

    private func stop() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.listening else { return }
            self.emitState("RECOGNIZING")
            self.recognitionRequest?.endAudio()
            self.audioEngine.stop()
            self.audioEngine.inputNode.removeTap(onBus: 0)
            self.listening = false
        }
    }

    private func cancel() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.recognitionTask?.cancel()
            self.teardownAudio()
            self.listening = false
            self.emitState("IDLE")
        }
    }

    private func teardownAudio() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest = nil
        recognitionTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func emitRms(from buffer: AVAudioPCMBuffer) {
        guard let channel = buffer.floatChannelData?[0] else { return }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return }
        var sum: Float = 0
        for i in 0 ..< count { sum += channel[i] * channel[i] }
        let rms = sqrt(sum / Float(count))
        let normalized = min(1.0, max(0.0, rms * 8))
        emitRmsLevel(normalized)
    }

    // MARK: - native → web

    private func evaluate(_ js: String) {
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    private func jsString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s], options: [])
        guard let data, let encoded = String(data: data, encoding: .utf8), encoded.count >= 2 else {
            return "\"\""
        }
        return String(encoded.dropFirst().dropLast())
    }

    private func emitState(_ state: String) {
        evaluate("window.onSttState && window.onSttState(\(jsString(state)));")
    }

    private func emitResult(_ text: String) {
        evaluate("window.onSttResult && window.onSttResult(\(jsString(text)));")
    }

    private func emitError(_ code: String) {
        evaluate("window.onSttError && window.onSttError(\(jsString(code)));")
    }

    private func emitRmsLevel(_ level: Float) {
        evaluate("window.onSttRms && window.onSttRms(\(level));")
    }

    func releaseBridge() {
        cancel()
    }
}
