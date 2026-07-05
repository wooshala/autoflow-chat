import SwiftUI
import UIKit

@main
struct AutoFlowStaffApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            StaffRootView()
        }
    }
}

struct StaffRootView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> StaffWebViewController {
        StaffWebViewController()
    }

    func updateUIViewController(_ uiViewController: StaffWebViewController, context: Context) {}
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        StaffPushService.shared.configureIfNeeded()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Firebase Messaging swizzling handles APNs token → FCM when GoogleService-Info.plist present.
        StaffPushService.shared.refreshFcmToken()
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NSLog("[STAFF_APNs_FAILED] %@", error.localizedDescription)
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        StaffPushService.shared.handleRemoteNotification(userInfo: userInfo)
        completionHandler(.newData)
    }
}
