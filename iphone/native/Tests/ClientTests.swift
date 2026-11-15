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
    func enqueue(_ value: JSONValue, status: Int = 200) throws { responses.append((status, try value.encoded())) }
    func blockRPC() { blockNextRPC = true }
    func isBlocked() -> Bool { blocked != nil }
    func release() { blocked?.resume(); blocked = nil }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        guard !responses.isEmpty else { throw NativeProblem.invalidResponse }
        let (status, data) = responses.removeFirst()
        if blockNextRPC && request.url!.path.contains("/rpc/") { blockNextRPC = false; await withCheckedContinuation { blocked = $0 } }
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
        let transport = MockTransport(), vault = MemoryVault(), client = WudaynClient(vault: MemoryVault(), transport: MockTransport())
        _ = client // Keep test transport explicitly isolated from the production default.
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
        let transport = MockTransport(), client = WudaynClient(vault: MemoryVault(), transport: MockTransport())
        _ = client
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
        let transport = MockTransport(), client = WudaynClient(vault: MemoryVault(), transport: MockTransport())
        _ = client
        let subject = WudaynClient(vault: MemoryVault(), transport: transport)
        do { _ = try await subject.rpc("admin_delete"); XCTFail("Not allowlisted") } catch { XCTAssertEqual(error as? NativeProblem, .invalidResponse) }
        let requests = await transport.requests; XCTAssertTrue(requests.isEmpty)
    }
}
