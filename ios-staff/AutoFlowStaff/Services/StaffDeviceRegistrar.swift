import Foundation
import UIKit

/// Best-effort device registration — mirrors android-staff/StaffDeviceRegistrar.kt.
enum StaffDeviceRegistrar {
    static func tryRegister() {
        let fcmToken = StaffPrefs.getFcmToken()
        let sessionToken = StaffPrefs.getSessionToken()
        let inviteToken = StaffPrefs.getInviteToken()
        guard !fcmToken.isEmpty else { return }
        guard !sessionToken.isEmpty || !inviteToken.isEmpty else { return }

        let useSession = !sessionToken.isEmpty
        var body: [String: String] = [
            "fcm_token": fcmToken,
            "platform": "ios",
            "device_key": StaffPrefs.getOrCreateDeviceKey(),
            "device_label": UIDevice.current.name,
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
        ]
        if !useSession {
            body["invite_token"] = inviteToken
        }

        guard let url = URL(string: StaffAppConfig.deviceRegisterURL) else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if useSession {
            req.setValue("Bearer \(sessionToken)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        req.timeoutInterval = 10

        URLSession.shared.dataTask(with: req) { _, response, _ in
            guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else { return }
            StaffPrefs.setLastRegisterOkAt(Int64(Date().timeIntervalSince1970 * 1000))
        }.resume()
    }
}
