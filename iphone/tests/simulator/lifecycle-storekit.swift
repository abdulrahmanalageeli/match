import Foundation
import StoreKit
import StoreKitTest
import WebKit
import XCTest

private func membershipFailure(_ message: String) -> NSError {
    NSError(domain: "WudaynLocalStoreKit", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

extension SimulatorChecks {
    // Run after both signups. Resolve their actual membership account tokens from the runner's disposable DB.
    func exerciseLocalStoreKit(web: WKWebView) async throws {
        guard #available(iOS 17.0, *) else { throw membershipFailure("Local StoreKit test purchases require iOS 17 or later") }
        let file = try XCTUnwrap(Bundle(for: SimulatorChecks.self).url(forResource: "Wudayn", withExtension: "storekit"))
        let store = try SKTestSession(contentsOf: file)
        store.resetToDefaultState()
        store.disableDialogs = true
        defer { store.clearTransactions() }

        @MainActor func bridge(_ method: String, _ options: [String: Any] = [:]) async throws -> [String: Any] {
            let response = try await web.callAsyncJavaScript("""
                try {
                  const data = await window.Capacitor.nativePromise('AppleMembership', method, options);
                  return JSON.stringify({ok:true, data:data || {}});
                } catch (e) {
                  return JSON.stringify({ok:false, code:String(e.code || 'BRIDGE_ERROR')});
                }
                """, arguments: ["method":method, "options":options], in: nil, contentWorld: .page)
            guard let string = response as? String,
                  let envelope = try JSONSerialization.jsonObject(with: Data(string.utf8)) as? [String:Any],
                  let ok = envelope["ok"] as? Bool else { throw membershipFailure("Unreadable bridge response: " + method) }
            guard ok else { throw membershipFailure((envelope["code"] as? String) ?? "Missing bridge error") }
            return (envelope["data"] as? [String:Any]) ?? [:]
        }

        func accountToken(for gender: String) async throws -> UUID {
            var request = URLRequest(url: URL(string: "http://127.0.0.1:18767/rpc")!, timeoutInterval: 30)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["actor":gender,"name":"marriage_state","args":[]] as [String:Any])
            let (data,response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let envelope = try JSONSerialization.jsonObject(with: data) as? [String:Any],
                  let state = envelope["data"] as? [String:Any], let user = state["user"] as? [String:Any],
                  let value = user["appAccountToken"] as? String, let token = UUID(uuidString: value)
                else { throw membershipFailure("Missing account token for " + gender) }
            return token
        }

        // The native plugin returns StoreKit's verified JWS. Inspect non-secret identifying fields
        // in memory to prove which transaction the bridge returned. Never attach or log its signature.
        func receipt(_ envelope: [String:Any], for tx: StoreKit.Transaction, account: UUID) throws -> String {
            guard let jws = envelope["jws"] as? String else { throw membershipFailure("Missing StoreKit transaction") }
            let sections = jws.split(separator: ".")
            guard sections.count == 3 else { throw membershipFailure("Malformed StoreKit transaction") }
            var payload = String(sections[1]).replacingOccurrences(of:"-",with:"+").replacingOccurrences(of:"_",with:"/")
            payload += String(repeating:"=",count:(4-payload.count%4)%4)
            guard let data = Data(base64Encoded: payload),
                  let fields = try JSONSerialization.jsonObject(with: data) as? [String:Any],
                  (fields["transactionId"] as? String) == String(tx.id),
                  (fields["productId"] as? String) == tx.productID,
                  let token = fields["appAccountToken"] as? String, UUID(uuidString: token) == account
                else { throw membershipFailure("Receipt did not match the local purchase of " + tx.productID) }
            return jws
        }

        @MainActor func verify(_ gender: String, _ productID: String) async throws {
            store.clearTransactions()
            let account = try await accountToken(for: gender)
            var clear = false
            for _ in 0..<30 {
                let current = try await bridge("current")
                if current["jws"] as? String == nil { clear = true; break }
                try await Task.sleep(nanoseconds: 200_000_000)
            }
            guard clear else { throw membershipFailure("Previous local entitlement still active before " + gender) }
            let offer = try await bridge("offer",["productId":productID])
            guard offer["productId"] as? String == productID, let price = offer["price"] as? String, !price.isEmpty,
                  let period = offer["period"] as? String, !period.isEmpty, let currency = offer["currency"] as? String,
                  !currency.isEmpty, let appTransaction = offer["signedAppTransaction"] as? String, !appTransaction.isEmpty
                else { throw membershipFailure("Missing native StoreKit quote for " + productID) }
            let purchaseOptions: [String:Any] = ["productId":productID,"accountToken":account.uuidString,
                                                  "price":price,"period":period,"currency":currency]
            do {
                _ = try await bridge("purchase",purchaseOptions)
                throw membershipFailure("Fresh purchase unexpectedly succeeded without a signed eligibility claim")
            } catch {
                guard (error as NSError).localizedDescription == "OFFER_REQUIRED" else { throw error }
            }

            // SKTestSession targets only the local Xcode store. First-time app checkout requires a
            // server-signed eligibility claim. No production claim or production verifier is used here.
            let tx = try await store.buyProduct(identifier: productID, options: [.appAccountToken(account)])
            guard tx.environment == .xcode, tx.productID == productID, tx.appAccountToken == account
                else { throw membershipFailure("Unexpected local StoreKit product, environment or account") }
            var current: [String:Any] = [:]
            for _ in 0..<40 {
                current = try await bridge("current")
                if current["jws"] is String { break }
                try await Task.sleep(nanoseconds: 200_000_000)
            }
            _ = try receipt(current, for: tx, account: account)
            let retry = try await bridge("purchase",purchaseOptions)
            let jws = try receipt(retry,for:tx,account:account)
            _ = try await bridge("complete",["jws":jws])
            for await unfinished in StoreKit.Transaction.unfinished {
                if case .verified(let remaining) = unfinished, remaining.id == tx.id {
                    throw membershipFailure("Transaction remained unfinished after native completion")
                }
            }
            let evidence = XCTAttachment(string: "\(gender) | \(productID) | \(price) | \(period) | Xcode | account-bound | existing entitlement returned | finished")
            evidence.name = "Local StoreKit · " + gender
            evidence.lifetime = .keepAlways
            add(evidence)
            print("[lifecycle] local StoreKit verified " + productID)
        }
        for (gender,productID) in [("man","com.blindmatch.marriage.monthly.men"),("woman","com.blindmatch.marriage.monthly.women")] {
            do { try await verify(gender, productID) }
            catch {
                let reason = productID + " · " + error.localizedDescription
                print("[lifecycle] local StoreKit failure " + reason)
                XCTFail(reason)
            }
        }
    }
}
