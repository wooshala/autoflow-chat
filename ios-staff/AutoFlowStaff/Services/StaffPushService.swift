import FirebaseCore
import FirebaseMessaging
import UIKit
import UserNotifications

/// FCM + APNs registration and notification presentation.
final class StaffPushService: NSObject {
    static let shared = StaffPushService()

    var pendingOpenMessageId: String?
    weak var navigationHandler: ((URL) -> Void)?

    private var firebaseConfigured = false

    func configureIfNeeded() {
        guard !firebaseConfigured else { return }
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            NSLog("[STAFF_FCM_SKIPPED] reason=firebase_plist_missing")
            return
        }
        FirebaseApp.configure()
        firebaseConfigured = true
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
    }

    func requestAuthorizationAndRegister() {
        configureIfNeeded()
        guard firebaseConfigured else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func refreshFcmToken() {
        configureIfNeeded()
        guard firebaseConfigured else { return }
        Messaging.messaging().token { token, error in
            guard error == nil, let token, !token.isEmpty else { return }
            StaffPrefs.setFcmToken(token)
            StaffDeviceRegistrar.tryRegister()
        }
    }

    func handleRemoteNotification(userInfo: [AnyHashable: Any]) {
        if let messageId = userInfo["message_id"] as? String, !messageId.isEmpty {
            pendingOpenMessageId = messageId
        } else if let data = userInfo["gcm.notification.message_id"] as? String {
            pendingOpenMessageId = data
        }
    }
}

extension StaffPushService: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken, !fcmToken.isEmpty else { return }
        StaffPrefs.setFcmToken(fcmToken)
        StaffDeviceRegistrar.tryRegister()
    }
}

extension StaffPushService: UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        var messageId = userInfo["message_id"] as? String ?? ""
        if messageId.isEmpty, let data = userInfo as? [String: Any] {
            messageId = data["message_id"] as? String ?? ""
        }
        if !messageId.isEmpty {
            pendingOpenMessageId = messageId
            if let url = buildStaffChatURL(openMessageId: messageId) {
                navigationHandler?(url)
            }
        }
        completionHandler()
    }

    func buildStaffChatURL(openMessageId: String?) -> URL? {
        var components = URLComponents(string: StaffAppConfig.staffChatURL)
        var items = components?.queryItems ?? []
        let savedInvite = StaffPrefs.getInviteToken()
        if items.first(where: { $0.name == "t" }) == nil, !savedInvite.isEmpty {
            items.append(URLQueryItem(name: "t", value: savedInvite))
        }
        if let openMessageId, !openMessageId.isEmpty {
            items.append(URLQueryItem(name: "open_message_id", value: openMessageId))
        }
        components?.queryItems = items.isEmpty ? nil : items
        return components?.url
    }
}
