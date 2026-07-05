import PhotosUI
import UIKit
import WebKit

/// WKWebView shell — mirrors android-staff MainActivity (no Android STT; iOS STT via StaffSttBridge).
final class StaffWebViewController: UIViewController {
    private var webView: WKWebView!
    private var sttBridge: StaffSttBridge?
    private var sessionPollTimer: Timer?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        setupWebView()
        loadInitialURL()
        StaffPushService.shared.navigationHandler = { [weak self] url in
            self?.webView.load(URLRequest(url: url))
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startSessionPollIfNeeded()
        StaffPushService.shared.requestAuthorizationAndRegister()
        StaffPushService.shared.refreshFcmToken()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopSessionPoll()
    }

    deinit {
        sttBridge?.releaseBridge()
        stopSessionPoll()
    }

    // MARK: - WebView setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.websiteDataStore = .default()

        let contentController = WKUserContentController()
        contentController.addUserScript(StaffSttBridge.userScript())
        config.userContentController = contentController

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        view.addSubview(webView)

        sttBridge = StaffSttBridge(webView: webView)
        contentController.add(sttBridge!, name: "autoflowStt")
    }

    func loadInitialURL() {
        let openMessageId = StaffPushService.shared.pendingOpenMessageId
        StaffPushService.shared.pendingOpenMessageId = nil
        if let url = resolveLaunchURL(openMessageId: openMessageId) {
            webView.load(URLRequest(url: url))
        }
    }

    func resolveLaunchURL(openMessageId: String?) -> URL? {
        var components = URLComponents(string: StaffAppConfig.staffChatURL)
        var items: [URLQueryItem] = []
        let savedInvite = StaffPrefs.getInviteToken()
        if !savedInvite.isEmpty {
            items.append(URLQueryItem(name: "t", value: savedInvite))
        }
        if let openMessageId, !openMessageId.isEmpty {
            items.append(URLQueryItem(name: "open_message_id", value: openMessageId))
        }
        components?.queryItems = items.isEmpty ? nil : items
        return components?.url ?? URL(string: StaffAppConfig.staffChatURL)
    }

    // MARK: - Invite / session capture (mirror Android)

    private func captureInviteTokenFromURL(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let token = components.queryItems?.first(where: { $0.name == "t" })?.value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !token.isEmpty else { return }
        StaffPrefs.setInviteToken(token)
        StaffDeviceRegistrar.tryRegister()
    }

    private func captureInviteTokenFromWebStorage() {
        webView.evaluateJavaScript("window.localStorage && window.localStorage.getItem('\(StaffAppConfig.inviteStorageKey)')") { [weak self] raw, _ in
            guard let self, let token = Self.parseJsString(raw), !token.isEmpty else { return }
            StaffPrefs.setInviteToken(token)
            StaffDeviceRegistrar.tryRegister()
        }
    }

    private func captureStaffSessionFromWebStorage() {
        webView.evaluateJavaScript("window.localStorage && window.localStorage.getItem('\(StaffAppConfig.sessionStorageKey)')") { [weak self] raw, _ in
            guard let self else { return }
            let token = Self.parseJsString(raw) ?? ""
            if token.isEmpty {
                StaffPrefs.clearSessionToken()
                return
            }
            let wasAbsent = StaffPrefs.getSessionToken().isEmpty
            StaffPrefs.setSessionToken(token)
            if wasAbsent {
                StaffDeviceRegistrar.tryRegister()
                self.stopSessionPoll()
            }
        }
    }

    private static func parseJsString(_ raw: Any?) -> String? {
        guard let raw else { return nil }
        var s = String(describing: raw)
        if s == "null" || s.isEmpty { return nil }
        if s.hasPrefix("\""), s.hasSuffix("\""), s.count >= 2 {
            s = String(s.dropFirst().dropLast())
        }
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func startSessionPollIfNeeded() {
        guard sessionPollTimer == nil else { return }
        guard StaffPrefs.getSessionToken().isEmpty else { return }
        sessionPollTimer = Timer.scheduledTimer(withTimeInterval: StaffAppConfig.sessionPollIntervalSec, repeats: true) { [weak self] _ in
            guard let self else { return }
            if !StaffPrefs.getSessionToken().isEmpty {
                self.stopSessionPoll()
                return
            }
            self.captureStaffSessionFromWebStorage()
        }
    }

    private func stopSessionPoll() {
        sessionPollTimer?.invalidate()
        sessionPollTimer = nil
    }

    // MARK: - Camera / photo picker (WKUIDelegate — no JS camera bridge)

    private func presentPhotoPicker(allowsCamera: Bool, completion: @escaping ([URL]?) -> Void) {
        filePickerCompletion = completion
        if allowsCamera && UIImagePickerController.isSourceTypeAvailable(.camera) {
            let alert = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
            alert.addAction(UIAlertAction(title: "Camera", style: .default) { [weak self] _ in
                self?.presentCamera(completion: completion)
            })
            alert.addAction(UIAlertAction(title: "Photo Library", style: .default) { [weak self] _ in
                self?.presentPhotoLibrary(completion: completion)
            })
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(nil) })
            present(alert, animated: true)
        } else {
            presentPhotoLibrary(completion: completion)
        }
    }

    private func presentCamera(completion: @escaping ([URL]?) -> Void) {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = PhotoPickerDelegate(completion: completion, presenter: self)
        picker.modalPresentationStyle = .fullScreen
        present(picker, animated: true)
    }

    private func presentPhotoLibrary(completion: @escaping ([URL]?) -> Void) {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .images
        config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = PhotoLibraryDelegate(completion: completion)
        present(picker, animated: true)
    }
}

// MARK: - WKNavigationDelegate

extension StaffWebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url {
            captureInviteTokenFromURL(url)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        captureInviteTokenFromWebStorage()
        captureStaffSessionFromWebStorage()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // WebView resume: reload; session restored from web localStorage on didFinish.
        webView.reload()
    }
}

// MARK: - WKUIDelegate (file input)

extension StaffWebViewController: WKUIDelegate {
    @available(iOS 15.6, *)
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        presentPhotoPicker(allowsCamera: true, completion: completionHandler)
    }
}

// MARK: - Photo picker helpers

private final class PhotoLibraryDelegate: NSObject, PHPickerViewControllerDelegate {
    let completion: ([URL]?) -> Void

    init(completion: @escaping ([URL]?) -> Void) {
        self.completion = completion
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else {
            completion(nil)
            return
        }
        provider.loadObject(ofClass: UIImage.self) { object, _ in
            guard let image = object as? UIImage, let data = image.jpegData(compressionQuality: 0.92) else {
                DispatchQueue.main.async { self.completion(nil) }
                return
            }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("staff_photo_\(UUID().uuidString).jpg")
            do {
                try data.write(to: url)
                DispatchQueue.main.async { self.completion([url]) }
            } catch {
                DispatchQueue.main.async { self.completion(nil) }
            }
        }
    }
}

private final class PhotoPickerDelegate: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let completion: ([URL]?) -> Void
    weak var presenter: UIViewController?

    init(completion: @escaping ([URL]?) -> Void, presenter: UIViewController) {
        self.completion = completion
        self.presenter = presenter
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true) { self.completion(nil) }
    }

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        guard let image = info[.originalImage] as? UIImage,
              let data = image.jpegData(compressionQuality: 0.92) else {
            completion(nil)
            return
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("staff_capture_\(UUID().uuidString).jpg")
        do {
            try data.write(to: url)
            completion([url])
        } catch {
            completion(nil)
        }
    }
}
