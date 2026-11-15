import Foundation

public enum SocialCallback {
    public static let redirect = "com.blindmatch.marriage://auth/callback"
    public static func code(from url: URL) throws -> String {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "com.blindmatch.marriage", parts.host == "auth", parts.path == "/callback",
              parts.user == nil, parts.password == nil, parts.port == nil, parts.fragment == nil else { throw NativeProblem.invalidResponse }
        let items = parts.queryItems ?? []
        guard !items.contains(where: { $0.name == "error" || $0.name == "error_code" }),
              items.filter({ $0.name == "code" }).count == 1,
              let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty else { throw NativeProblem.invalidResponse }
        return code
    }
}
