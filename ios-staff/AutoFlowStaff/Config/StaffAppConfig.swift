import Foundation

/// URL policy: Release = production only. Debug may use staging for bridge integration tests.
enum StaffAppConfig {
    static let productionWebBase = "https://autoflow-mvp.vercel.app"
    static let productionStaffChatPath = "/staff-chat"

    /// Override in Debug scheme env `STAFF_STAGING_BASE_URL` for staging regression (never in Release).
    static var webBaseURL: String {
        #if STAFF_DEBUG
        if let override = ProcessInfo.processInfo.environment["STAFF_STAGING_BASE_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !override.isEmpty,
           override.hasPrefix("https://") {
            return override.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        #endif
        return productionWebBase
    }

    static var staffChatURL: String {
        "\(webBaseURL)\(productionStaffChatPath)"
    }

    static let deviceRegisterURL = "\(productionWebBase)/api/staff/devices/register"
    static let sessionStorageKey = "autoflow_staff_session_token_v1"
    static let inviteStorageKey = "autoflow_staff_invite_token_v1"
    static let sessionPollIntervalSec: TimeInterval = 3.0
}
