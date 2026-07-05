import Foundation

/// Native prefs mirror android-staff/StaffPrefs.kt keys and semantics.
enum StaffPrefs {
    private static let suite = "autoflow_staff_native"

    private enum Key {
        static let fcmToken = "fcm_token"
        static let inviteToken = "invite_token"
        static let sessionToken = "session_token"
        static let deviceKey = "device_key"
        static let lastRegisterOkAt = "last_register_ok_at"
    }

    private static var defaults: UserDefaults { UserDefaults(suiteName: suite) ?? .standard }

    static func setFcmToken(_ token: String) {
        defaults.set(token, forKey: Key.fcmToken)
    }

    static func getFcmToken() -> String {
        defaults.string(forKey: Key.fcmToken) ?? ""
    }

    static func setInviteToken(_ token: String) {
        defaults.set(token, forKey: Key.inviteToken)
    }

    static func getInviteToken() -> String {
        defaults.string(forKey: Key.inviteToken) ?? ""
    }

    static func setSessionToken(_ token: String) {
        defaults.set(token, forKey: Key.sessionToken)
    }

    static func getSessionToken() -> String {
        defaults.string(forKey: Key.sessionToken) ?? ""
    }

    static func clearSessionToken() {
        defaults.removeObject(forKey: Key.sessionToken)
    }

    static func getOrCreateDeviceKey() -> String {
        if let existing = defaults.string(forKey: Key.deviceKey), !existing.isEmpty {
            return existing
        }
        let created = "ios_\(UUID().uuidString)"
        defaults.set(created, forKey: Key.deviceKey)
        return created
    }

    static func setLastRegisterOkAt(_ ms: Int64) {
        defaults.set(ms, forKey: Key.lastRegisterOkAt)
    }
}
