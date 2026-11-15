import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct NativeSession: Codable, Equatable, Sendable {
    public struct User: Codable, Equatable, Sendable { public let id: String; public let email: String? }
    public let access_token: String
    public let refresh_token: String
    public let expires_at: Double?
    public let expires_in: Double?
    public let user: User
    public var expired: Bool { (expires_at ?? 0) < Date().timeIntervalSince1970 + 60 }
}
public protocol SessionVault: Sendable {
    func read() throws -> Data?
    func write(_ data: Data) throws
    func clear() throws
}
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}
public final class NativeHTTPTransport: HTTPTransport, @unchecked Sendable {
    private let session: URLSession
    public init() {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil; config.httpCookieStorage = nil
        config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 90
        session = URLSession(configuration: config)
    }
    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw NativeProblem.invalidResponse }
        return (data, http)
    }
}

/// Account-scoped transport. Refreshes are serialized; an in-flight response can
/// never become data for a different account. Mutations are never auto-replayed.
public actor WudaynClient {
    public static let projectURL = URL(string: "https://wupkifqbwhhebwrgvwai.supabase.co")!
    private let key = "sb_publishable_A9VclBe-PMQEYVccvvkVhw_ZG0J_-lz"
    private let transport: any HTTPTransport
    private let vault: any SessionVault
    private var session: NativeSession?
    private var generation = UUID()
    private var refreshing: Task<NativeSession, Error>?
    public init(vault: any SessionVault, transport: any HTTPTransport = NativeHTTPTransport()) {
        self.vault = vault; self.transport = transport
    }
    public func restore() async throws -> String? {
        guard let data = try vault.read() else { return nil }
        session = try JSONDecoder().decode(NativeSession.self, from: data)
        return try await authorized().user.id
    }
    public func signIn(email: String, password: String) async throws -> String {
        let epoch = UUID(); generation = epoch; refreshing?.cancel(); refreshing = nil
        session = nil; try vault.clear()
        let data = try await raw(path: "auth/v1/token?grant_type=password", body: .object(["email": .string(email.trimmingCharacters(in: .whitespacesAndNewlines)), "password": .string(password)]))
        guard generation == epoch else { throw NativeProblem.sessionChanged }
        let next = try decodeSession(data)
        try vault.write(JSONEncoder().encode(next)); session = next
        return next.user.id
    }
    public func signOut() async throws {
        let old = session
        generation = UUID(); refreshing?.cancel(); refreshing = nil; session = nil
        try vault.clear()
        if let old { _ = try? await raw(path: "auth/v1/logout?scope=local", body: .object([:]), token: old.access_token) }
    }
    public func rpc(_ name: String, _ params: [String: JSONValue] = [:]) async throws -> JSONValue {
        guard name.hasPrefix("marriage_"), name.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" }) else { throw NativeProblem.invalidResponse }
        return try await json(path: "rest/v1/rpc/" + name, body: .object(params))
    }
    public func edge(_ name: String, _ body: JSONValue, authenticated: Bool = true) async throws -> JSONValue {
        guard ["member-signup", "signup-sms", "member-chat-media", "voice-token", "native-call", "verify-membership", "photo-verify", "manual-verification"].contains(name) else { throw NativeProblem.invalidResponse }
        if authenticated { return try await json(path: "functions/v1/" + name, body: body) }
        return try JSONValue.decode(await raw(path: "functions/v1/" + name, body: body))
    }
    public func passwordReset(email: String, redirect: URL) async throws {
        guard redirect.scheme == "https", redirect.host != nil, redirect.user == nil, redirect.password == nil else { throw NativeProblem.invalidResponse }
        var query = URLComponents(); query.queryItems = [URLQueryItem(name: "redirect_to", value: redirect.absoluteString)]
        _ = try await raw(path: "auth/v1/recover?" + (query.percentEncodedQuery ?? ""), body: .object(["email": .string(email)]))
    }
    public enum ServiceRoute: Sendable { case signupSMS, interview, ai, verifyPhoto, callPush }
    public func service(_ route: ServiceRoute, body: JSONValue) async throws -> JSONValue {
        let url: URL
        let authenticated: Bool
        switch route {
        case .signupSMS: url = URL(string: "https://nisfayn-admin.vercel.app/api/signup-sms")!; authenticated = false
        case .interview: url = URL(string: "https://nisfayn-preview.vercel.app/api/interview")!; authenticated = true
        case .ai: url = URL(string: "https://nisfayn-preview.vercel.app/api/ai")!; authenticated = true
        case .verifyPhoto: url = URL(string: "https://nisfayn-admin.vercel.app/api/verify-photo")!; authenticated = true
        case .callPush: url = URL(string: "https://nisfayn-admin.vercel.app/api/call-push")!; authenticated = true
        }
        let auth = authenticated ? try await authorized() : nil, epoch = generation
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = "POST"; request.httpBody = try body.encoded()
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Existing backend allowlists identify the first-party iPhone client by
        // this origin. It is a compatibility header, not a web rendering runtime.
        request.setValue("capacitor://localhost", forHTTPHeaderField: "Origin")
        if let auth { request.setValue("Bearer " + auth.access_token, forHTTPHeaderField: "Authorization") }
        let (data, response) = try await transport.send(request)
        guard generation == epoch else { throw NativeProblem.sessionChanged }
        guard (200...299).contains(response.statusCode) else {
            let value = (try? JSONValue.decode(data)) ?? .null
            let message = value["error"].string
            throw NativeProblem.http(status: response.statusCode, message: message.range(of: "[\\u0600-\\u06ff]", options: .regularExpression) != nil ? message : "تعذّر إتمام الخطوة. تحقق من البيانات وحاول مجددًا.")
        }
        return try JSONValue.decode(data)
    }
    public func json(path: String, body: JSONValue) async throws -> JSONValue {
        let auth = try await authorized(), epoch = generation
        let data = try await raw(path: path, body: body, token: auth.access_token)
        guard generation == epoch, session?.user.id == auth.user.id else { throw NativeProblem.sessionChanged }
        return data.isEmpty ? .null : try JSONValue.decode(data)
    }
    public func media(requestID: String, mediaID: String, once: Bool) async throws -> Data {
        let auth = try await authorized(), epoch = generation
        let data = try await raw(path: "functions/v1/member-chat-media?action=download", body: .object(["requestId": .string(requestID), "mediaId": .string(mediaID), "viewOnce": .bool(once)]), token: auth.access_token)
        guard generation == epoch else { throw NativeProblem.sessionChanged }; return data
    }
    public func uploadMedia(requestID: String, clientID: String, data: Data, mime: String, once: Bool, duration: Double? = nil) async throws {
        guard data.count > 0, data.count <= 8 * 1024 * 1024 else { throw NativeProblem.message("الملف يتجاوز الحجم المسموح.") }
        guard ["image/jpeg", "audio/mp4"].contains(mime), mime != "audio/mp4" || !once else { throw NativeProblem.invalidResponse }
        if let duration { guard duration.isFinite, duration > 0, duration <= 60 else { throw NativeProblem.invalidResponse } }
        let auth = try await authorized(), epoch = generation
        var headers = ["Content-Type": mime, "x-request-id": requestID, "x-client-id": clientID, "x-view-once": String(once)]
        if let duration { headers["x-duration-ms"] = String(Int(duration * 1000)) }
        let response = try await raw(path: "functions/v1/member-chat-media?action=upload", bytes: data, token: auth.access_token, headers: headers)
        guard generation == epoch else { throw NativeProblem.sessionChanged }
        guard try JSONValue.decode(response)["id"].string == clientID else { throw NativeProblem.invalidResponse }
    }
    public func download(bucket: String, path: String) async throws -> Data {
        guard ["nisfayn-profile-portraits", "nisfayn-profile-gallery", "nisfayn-private-photos"].contains(bucket), !path.contains("..") else { throw NativeProblem.invalidResponse }
        let auth = try await authorized(), epoch = generation
        let data = try await raw(path: "storage/v1/object/authenticated/\(bucket)/\(path)", token: auth.access_token, method: "GET")
        guard generation == epoch else { throw NativeProblem.sessionChanged }; return data
    }
    public func uploadPhoto(bucket: String, path: String, data: Data) async throws {
        guard ["nisfayn-profile-portraits", "nisfayn-profile-gallery", "nisfayn-private-photos"].contains(bucket), !path.contains(".."), !path.isEmpty, data.count <= 8 * 1024 * 1024 else { throw NativeProblem.invalidResponse }
        let auth = try await authorized(), epoch = generation
        _ = try await raw(path: "storage/v1/object/\(bucket)/\(path)", bytes: data, token: auth.access_token, headers: ["Content-Type": "image/jpeg", "x-upsert": "false", "Cache-Control": "no-store"])
        guard generation == epoch else { throw NativeProblem.sessionChanged }
    }
    private func authorized() async throws -> NativeSession {
        guard let current = session else { throw NativeProblem.signedOut }
        if !current.expired { return current }
        let epoch = generation
        let task: Task<NativeSession, Error>
        if let refreshing { task = refreshing }
        else {
            task = Task {
                let data = try await self.raw(path: "auth/v1/token?grant_type=refresh_token", body: .object(["refresh_token": .string(current.refresh_token)]))
                return try self.decodeSession(data)
            }
            refreshing = task
        }
        do {
            let next = try await task.value
            guard generation == epoch, next.user.id == current.user.id else { throw NativeProblem.sessionChanged }
            try vault.write(JSONEncoder().encode(next)); session = next; refreshing = nil; return next
        } catch {
            if generation == epoch {
                refreshing = nil
                if let problem = error as? NativeProblem, case .http(let status, _) = problem, [400, 401, 403].contains(status) {
                    session = nil; generation = UUID(); try vault.clear()
                }
            }
            throw error
        }
    }
    private func decodeSession(_ data: Data) throws -> NativeSession {
        var value = try JSONValue.decode(data)
        if value["expires_at"].isNull { value["expires_at"] = .number(Date().timeIntervalSince1970 + value["expires_in"].number) }
        let result = try JSONDecoder().decode(NativeSession.self, from: value.encoded())
        guard !result.access_token.isEmpty, !result.refresh_token.isEmpty, UUID(uuidString: result.user.id) != nil else { throw NativeProblem.invalidResponse }
        return result
    }
    private func raw(path: String, body: JSONValue? = nil, bytes: Data? = nil, token: String? = nil, headers: [String: String] = [:], method: String = "POST") async throws -> Data {
        guard !path.hasPrefix("/"), !path.contains("://"), !path.contains(".."), let url = URL(string: path, relativeTo: Self.projectURL.appendingPathComponent("/")) else { throw NativeProblem.invalidResponse }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method; request.httpBody = try bytes ?? body?.encoded()
        request.setValue(key, forHTTPHeaderField: "apikey")
        request.setValue("capacitor://localhost", forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        let (data, response) = try await transport.send(request)
        guard (200...299).contains(response.statusCode) else {
            let detail = (try? JSONValue.decode(data)) ?? .null
            let message = [detail["error"].string, detail["message"].string, detail["msg"].string].first { $0.range(of: "[\\u0600-\\u06ff]", options: .regularExpression) != nil }
            throw NativeProblem.http(status: response.statusCode, message: message ?? (response.statusCode == 401 ? "تحقق من بيانات الدخول أو سجّل الدخول مجددًا." : "تعذّر إتمام الطلب. حاول مجددًا."))
        }
        return data
    }
}
