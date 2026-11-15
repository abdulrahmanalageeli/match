import XCTest
@testable import WudaynCore
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class MemoryVault: SessionVault, @unchecked Sendable {
    private let lock = NSLock()
    private var data: Data?
    func read() throws -> Data? { lock.lock(); defer { lock.unlock() }; return data }
    func write(_ data: Data) throws { lock.lock(); defer { lock.unlock() }; self.data = data }
    func clear() throws { lock.lock(); defer { lock.unlock() }; data = nil }
}
actor MockTransport: HTTPTransport {
    var requests: [URLRequest] = []
    var responses: [(Int, Data)] = []
    var blocked: CheckedContinuation<Void, Never>?
    var blockNextRPC = false
    var blockedPath: String?
    func enqueue(_ value: JSONValue, status: Int = 200) throws { responses.append((status, try value.encoded())) }
    func blockRPC() { blockNextRPC = true }
    func block(path: String) { blockedPath = path }
    func isBlocked() -> Bool { blocked != nil }
    func release() { blocked?.resume(); blocked = nil }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        guard !responses.isEmpty else { throw NativeProblem.invalidResponse }
        let (status, data) = responses.removeFirst()
        if (blockNextRPC && request.url!.path.contains("/rpc/")) || blockedPath == request.url!.path { blockNextRPC = false; blockedPath = nil; await withCheckedContinuation { blocked = $0 } }
        return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}
final class ClientTests: XCTestCase {
    private let a = "11111111-1111-4111-8111-111111111111"
    private let b = "22222222-2222-4222-8222-222222222222"
    private func session(_ id: String, expired: Bool = false) -> JSONValue { .object(["access_token": .string("token-" + id), "refresh_token": .string("refresh-" + id), "expires_at": .number(Date().timeIntervalSince1970 + (expired ? -10 : 3600)), "user": .object(["id": .string(id), "email": .string("test@example.invalid")])]) }
    func testPreservesUnknownProfileFields() throws {
        var value = try JSONValue.decode(Data("{\"name\":\"before\",\"private\":{\"consent\":true},\"n\":2}".utf8))
        value["name"] = .string("after")
        XCTAssertTrue(value["private"]["consent"].bool)
        XCTAssertEqual(try JSONValue.decode(value.encoded()), value)
    }
    func testUsesDedicatedProjectAndBearerOnlyAfterLogin() async throws {
        let transport = MockTransport(), vault = MemoryVault()
        let authenticated = WudaynClient(vault: vault, transport: transport)
        try await transport.enqueue(session(a)); _ = try await authenticated.signIn(email: "test@example.invalid", password: "fixture")
        try await transport.enqueue(.object([:])); _ = try await authenticated.rpc("marriage_state")
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 2)
        XCTAssertTrue(requests.allSatisfy { $0.url?.host == "wupkifqbwhhebwrgvwai.supabase.co" })
        XCTAssertNil(requests[0].value(forHTTPHeaderField: "Authorization"))
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Authorization"), "Bearer token-" + a)
        XCTAssertEqual(requests[1].cachePolicy, .reloadIgnoringLocalCacheData)
    }
    func testDoesNotReplayFailedMutation() async throws {
        let transport = MockTransport()
        let subject = WudaynClient(vault: MemoryVault(), transport: transport)
        try await transport.enqueue(session(a)); _ = try await subject.signIn(email: "test@example.invalid", password: "fixture")
        try await transport.enqueue(.object([:]), status: 503)
        do { _ = try await subject.rpc("marriage_message"); XCTFail("Must fail") } catch { }
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 2)
    }
    func testRejectsOldAccountResponseAfterSwitch() async throws {
        let transport = MockTransport(), vault = MemoryVault()
        let client = WudaynClient(vault: vault, transport: transport)
        try await transport.enqueue(session(a)); _ = try await client.signIn(email: "a@example.invalid", password: "fixture")
        try await transport.enqueue(.object(["secret": .string("account-a")])); await transport.blockRPC()
        let pending = Task { try await client.rpc("marriage_state") }
        for _ in 0..<100 { if await transport.isBlocked() { break }; try await Task.sleep(nanoseconds: 1_000_000) }
        let blocked = await transport.isBlocked(); XCTAssertTrue(blocked)
        try await transport.enqueue(session(b)); _ = try await client.signIn(email: "b@example.invalid", password: "fixture")
        await transport.release()
        do { _ = try await pending.value; XCTFail("Old account data escaped") } catch { XCTAssertEqual(error as? NativeProblem, .sessionChanged) }
        XCTAssertEqual(try JSONValue.decode(XCTUnwrap(vault.read()))["user"]["id"].string, b)
    }
    func testRejectsRefreshForDifferentAccount() async throws {
        let transport = MockTransport(), vault = MemoryVault()
        try vault.write(session(a, expired: true).encoded())
        try await transport.enqueue(session(b))
        let client = WudaynClient(vault: vault, transport: transport)
        do { _ = try await client.restore(); XCTFail("Account switched during refresh") } catch { XCTAssertEqual(error as? NativeProblem, .sessionChanged) }
        XCTAssertEqual(try JSONValue.decode(XCTUnwrap(vault.read()))["user"]["id"].string, a)
    }
    func testRejectsNonMemberRPCBeforeNetwork() async throws {
        let transport = MockTransport()
        let subject = WudaynClient(vault: MemoryVault(), transport: transport)
        do { _ = try await subject.rpc("admin_delete"); XCTFail("Not allowlisted") } catch { XCTAssertEqual(error as? NativeProblem, .invalidResponse) }
        let requests = await transport.requests; XCTAssertTrue(requests.isEmpty)
    }
    func testSingleUseMediaOpenIsNotRetried() async throws {
        let transport = MockTransport()
        let client = WudaynClient(vault: MemoryVault(), transport: transport)
        try await transport.enqueue(session(a)); _ = try await client.signIn(email: "ui@example.invalid", password: "fixture")
        try await transport.enqueue(.object([:]), status: 409)
        do { _ = try await client.media(requestID: a, mediaID: b, once: true); XCTFail("Open must fail") } catch { }
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Origin"), "capacitor://localhost")
        XCTAssertTrue(try JSONValue.decode(XCTUnwrap(requests.last?.httpBody))["viewOnce"].bool)
    }
    func testFailedAccountSwitchClearsStoredSession() async throws {
        let transport = MockTransport(), vault = MemoryVault()
        let client = WudaynClient(vault: vault, transport: transport)
        try await transport.enqueue(session(a)); _ = try await client.signIn(email: "a@example.invalid", password: "fixture")
        try await transport.enqueue(.object([:]), status: 400)
        do { _ = try await client.signIn(email: "b@example.invalid", password: "fixture"); XCTFail("Login must fail") } catch { }
        XCTAssertNil(try vault.read())
        do { _ = try await client.rpc("marriage_state"); XCTFail("Previous account must not survive") } catch { XCTAssertEqual(error as? NativeProblem, .signedOut) }
    }
    func testConcurrentRequestsShareOneTokenRefresh() async throws {
        let transport = MockTransport()
        let subject = WudaynClient(vault: MemoryVault(), transport: transport)
        try await transport.enqueue(session(a, expired: true)); _ = try await subject.signIn(email: "a@example.invalid", password: "fixture")
        try await transport.enqueue(session(a)); await transport.block(path: "/auth/v1/token")
        try await transport.enqueue(.array([])); try await transport.enqueue(.array([]))
        let first = Task { try await subject.rpc("marriage_browse") }
        for _ in 0..<100 { if await transport.isBlocked() { break }; try await Task.sleep(nanoseconds: 1_000_000) }
        let second = Task { try await subject.rpc("marriage_inbox") }
        try await Task.sleep(nanoseconds: 10_000_000); await transport.release()
        _ = try await first.value; _ = try await second.value
        let requests = await transport.requests
        XCTAssertEqual(requests.filter { $0.url?.query == "grant_type=refresh_token" }.count, 1)
        XCTAssertEqual(requests.count, 4)
    }
    func testRevokedRefreshRemovesSessionAndDoesNotSendMutation() async throws {
        let transport = MockTransport(), vault = MemoryVault(), subject: WudaynClient
        subject = WudaynClient(vault: vault, transport: transport)
        try await transport.enqueue(session(a, expired: true)); _ = try await subject.signIn(email: "a@example.invalid", password: "fixture")
        try await transport.enqueue(.object([:]), status: 400)
        do { _ = try await subject.rpc("marriage_request"); XCTFail("Revoked session used") } catch { XCTAssertTrue(NativeProblem.isAccessDenied(error)) }
        XCTAssertNil(try vault.read())
        do { _ = try await subject.rpc("marriage_request"); XCTFail("Retried revoked credentials") } catch { XCTAssertEqual(error as? NativeProblem, .signedOut) }
        let requests = await transport.requests; XCTAssertEqual(requests.count, 2)
    }
    func testHTTPFailuresPreserveDenialVersusTemporaryFailure() async throws {
        let transport = MockTransport()
        let client = WudaynClient(vault: MemoryVault(), transport: transport)
        try await transport.enqueue(session(a)); _ = try await client.signIn(email: "a@example.invalid", password: "fixture")
        for status in [401, 403, 404, 410, 429, 503] {
            try await transport.enqueue(.object([:]), status: status)
            do { _ = try await client.rpc("marriage_thread_page"); XCTFail("Failure accepted") }
            catch { XCTAssertEqual(NativeProblem.isAccessDenied(error), [401,403,404,410].contains(status)) }
        }
    }
    func testBadMediaDurationAndTypeAreRejectedBeforeNetwork() async throws {
        let transport = MockTransport()
        let subject = WudaynClient(vault: MemoryVault(), transport: transport)
        for duration in [Double.nan, .infinity, -1, 0, 61] {
            do { try await subject.uploadMedia(requestID: a, clientID: b, data: Data([1]), mime: "audio/mp4", once: false, duration: duration); XCTFail("Bad duration accepted") } catch { XCTAssertEqual(error as? NativeProblem, .invalidResponse) }
        }
        do { try await subject.uploadMedia(requestID: a, clientID: b, data: Data([1]), mime: "audio/mp4", once: true, duration: 1); XCTFail("Once audio accepted") } catch { XCTAssertEqual(error as? NativeProblem, .invalidResponse) }
        let requests = await transport.requests; XCTAssertTrue(requests.isEmpty)
    }
    func testUploadRetryKeepsSameIdAndSingleUseHeaders() async throws {
        let transport = MockTransport()
        let client = WudaynClient(vault: MemoryVault(), transport: transport)
        try await transport.enqueue(session(a)); _ = try await client.signIn(email: "a@example.invalid", password: "fixture")
        try await transport.enqueue(.object([:]), status: 503)
        do { try await client.uploadMedia(requestID: a, clientID: b, data: Data([1,2]), mime: "image/jpeg", once: true); XCTFail("Must fail") } catch { }
        try await transport.enqueue(.object(["id": .string(b)]))
        try await client.uploadMedia(requestID: a, clientID: b, data: Data([1,2]), mime: "image/jpeg", once: true)
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 3)
        XCTAssertEqual(requests[1].httpBody, requests[2].httpBody)
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "x-client-id"), b)
        XCTAssertEqual(requests[2].value(forHTTPHeaderField: "x-client-id"), b)
        XCTAssertEqual(requests[2].value(forHTTPHeaderField: "x-view-once"), "true")
    }
    func testRecoveryAcceptsHTTPSRedirectWithoutChangingBackendOrigin() async throws {
        let transport = MockTransport()
        let client = WudaynClient(vault: MemoryVault(), transport: transport)
        try await transport.enqueue(.object([:]))
        let redirect = URL(string: "https://example.invalid/reset?auth=recovery&next=profile")!
        try await client.passwordReset(email: "member@example.invalid", redirect: redirect)
        let requests = await transport.requests, url = try XCTUnwrap(requests.first?.url)
        XCTAssertEqual(url.host, WudaynClient.projectURL.host)
        XCTAssertEqual(url.path, "/auth/v1/recover")
        XCTAssertEqual(URLComponents(url: url, resolvingAgainstBaseURL: true)?.queryItems?.first(where: { $0.name == "redirect_to" })?.value, redirect.absoluteString)
    }
}
