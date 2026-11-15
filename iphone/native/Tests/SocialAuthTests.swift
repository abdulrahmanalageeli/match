import XCTest
@testable import WudaynCore

final class SocialAuthTests: XCTestCase {
    func testCallbackRequiresExactDestinationAndOneCode() throws {
        XCTAssertEqual(try SocialCallback.code(from: URL(string: SocialCallback.redirect + "?code=valid")!), "valid")
        for url in ["https://evil.invalid/auth/callback?code=x", "com.blindmatch.marriage://evil/callback?code=x", SocialCallback.redirect + "?code=a&code=b", SocialCallback.redirect + "?code=a&error=denied", SocialCallback.redirect + "#access_token=secret", SocialCallback.redirect + "?code="] {
            XCTAssertThrowsError(try SocialCallback.code(from: URL(string: url)!))
        }
    }
    func testAppleNonceAndGoogleVerifierReachOnlyTokenEndpoint() async throws {
        for apple in [true, false] {
            let vault = MemoryVault(), transport = MockTransport()
            let client = WudaynClient(vault: vault, transport: transport)
            let id = "11111111-1111-4111-8111-111111111111"
            try await transport.enqueue(.object(["access_token": .string("fixture"), "refresh_token": .string("refresh"), "expires_in": .number(3600), "user": .object(["id": .string(id)])]))
            let result: String
            if apple { result = try await client.signInWithApple(idToken: "signed-token", nonce: "raw-nonce") }
            else { result = try await client.exchangeGoogleCode("one-use-code", verifier: String(repeating: "a", count: 43)) }
            XCTAssertEqual(result, id)
            let requests = await transport.requests
            XCTAssertEqual(requests.count, 1)
            XCTAssertEqual(requests[0].url?.host, "wupkifqbwhhebwrgvwai.supabase.co")
            XCTAssertEqual(requests[0].url?.query, apple ? "grant_type=id_token" : "grant_type=pkce")
            XCTAssertNil(requests[0].value(forHTTPHeaderField: "Authorization"))
            let body = try JSONValue.decode(XCTUnwrap(requests[0].httpBody))
            XCTAssertEqual(body[apple ? "nonce" : "code_verifier"].string, apple ? "raw-nonce" : String(repeating: "a", count: 43))
            XCTAssertEqual(try JSONValue.decode(XCTUnwrap(vault.read()))["user"]["id"].string, id)
        }
    }
    func testInvalidCredentialsNeverSendNetworkRequest() async throws {
        let transport = MockTransport(), client = WudaynClient(vault: MemoryVault(), transport: transport)
        do { _ = try await client.signInWithApple(idToken: "", nonce: "x"); XCTFail() } catch {}
        do { _ = try await client.exchangeGoogleCode("code", verifier: "short"); XCTFail() } catch {}
        let requests = await transport.requests
        XCTAssertTrue(requests.isEmpty)
    }
    func testSigningOutDuringCodeExchangeRejectsLateSession() async throws {
        let transport = MockTransport(), vault = MemoryVault(), id = "11111111-1111-4111-8111-111111111111"
        let client = WudaynClient(vault: vault, transport: transport)
        try await transport.enqueue(.object(["access_token": .string("fixture"), "refresh_token": .string("refresh"), "expires_in": .number(3600), "user": .object(["id": .string(id)])]))
        await transport.block(path: "/auth/v1/token")
        let task = Task { try await client.exchangeGoogleCode("code", verifier: String(repeating: "a", count: 43)) }
        for _ in 0..<100 { if await transport.isBlocked() { break }; try await Task.sleep(nanoseconds: 1_000_000) }
        let blocked = await transport.isBlocked(); XCTAssertTrue(blocked)
        try await client.signOut(); await transport.release()
        do { _ = try await task.value; XCTFail("Late session accepted") } catch { XCTAssertEqual(error as? NativeProblem, .sessionChanged) }
        XCTAssertNil(try vault.read())
    }
}
