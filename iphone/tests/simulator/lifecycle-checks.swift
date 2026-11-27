import XCTest
import UIKit
import WebKit

private func failure(_ message: String) -> NSError {
    NSError(domain: "WudaynLifecycle", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

// The hosted simulator shares the runner's loopback. Restrict this test transport
// to bundled pages, known routes, and the two synthetic sessions on this runner.
private final class LocalService: NSObject, WKScriptMessageHandlerWithReply {
    let endpoints = ["/signup", "/actors", "/rpc", "/checkpoint", "/reset", "/expire", "/entry/man", "/entry/woman"]

    func call(_ path: String, method: String, body: String?) async throws -> (Int, String) {
        guard endpoints.contains(path), ["GET", "POST"].contains(method),
              let url = URL(string: "http://127.0.0.1:18767" + path) else { throw failure("Unknown QA endpoint " + path) }
        var request = URLRequest(url: url, timeoutInterval: 180)
        request.httpMethod = method
        if let body = body {
            request.httpBody = Data(body.utf8)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, let text = String(data: data, encoding: .utf8)
            else { throw failure("Invalid local QA response") }
        return (http.statusCode, text)
    }

    @MainActor func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                                          replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "capacitor", message.frameInfo.securityOrigin.host == "localhost",
              let data = message.body as? [String: Any], let path = data["path"] as? String,
              let method = data["method"] as? String else { replyHandler(nil, "Invalid QA request"); return }
        Task { @MainActor in
            do {
                let (status, text) = try await call(path, method: method, body: data["body"] as? String)
                replyHandler(["status": status, "body": text], nil)
            } catch { replyHandler(nil, error.localizedDescription) }
        }
    }
}

@MainActor
final class SimulatorChecks: XCTestCase {
    private let local = LocalService()

    private func findWebView(_ view: UIView) -> WKWebView? {
        if let web = view as? WKWebView { return web }
        for child in view.subviews { if let web = findWebView(child) { return web } }
        return nil
    }

    private func host() async throws -> WKWebView {
        for _ in 0..<240 {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            for window in scenes.flatMap({ $0.windows }) {
                if let web = findWebView(window) { return web }
            }
            try await Task.sleep(nanoseconds: 125_000_000)
        }
        throw failure("App did not expose its Capacitor WKWebView")
    }

    private func attach(_ name: String, web: WKWebView) {
        guard !web.bounds.isEmpty else { return }
        let image = UIGraphicsImageRenderer(bounds: web.bounds).image { _ in web.drawHierarchy(in: web.bounds, afterScreenUpdates: true) }
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func installBridge(_ web: WKWebView) {
        let controller = web.configuration.userContentController
        controller.addScriptMessageHandler(local, contentWorld: .page, name: "lifecycleLoopback")
        let script = """
        window.addEventListener('error', e => {window.__fixtureError = String(e.message || e.target?.src || 'resource error').slice(0,250)}, true);
        window.addEventListener('unhandledrejection', e => {window.__fixtureError = String(e.reason?.message || e.reason).slice(0,250)});
        const originalFetch = window.fetch.bind(window);
        window.fetch = async function(input, init = {}) {
            const url = new URL(input instanceof Request ? input.url : String(input), location.href);
            if (url.origin !== 'http://127.0.0.1:18767') return originalFetch(input, init);
            const request = new Request(input, init);
            const result = await window.webkit.messageHandlers.lifecycleLoopback.postMessage({
                path: url.pathname, method: request.method,
                body: request.method === 'POST' ? await request.text() : null
            });
            return new Response(result.body, {status: result.status, headers: {'Content-Type':'application/json'}});
        };
        """
        controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    private func exercise(_ web: WKWebView, page: String, function: String, argument: String) async throws -> String {
        let token = UUID().uuidString
        let url = URL(string: "capacitor://localhost/simulator-tests/tests/simulator/" + page + ".html?run=" + token)!
        web.load(URLRequest(url: url))
        var started = false
        for _ in 0..<300 {
            let ready = "(location.search === '?run=\(token)' && typeof window.\(function) === 'function')"
            if (try? await web.evaluateJavaScript(ready)) as? Bool == true {
                let launch = """
                window.__nativeResult = null;
                Promise.resolve().then(() => window.\(function)('\(argument)')).then(
                  value => window.__nativeResult = {ok:true,value},
                  err => window.__nativeResult = {ok:false,error:String(err?.message || err)});
                true
                """
                _ = try await web.evaluateJavaScript(launch)
                started = true
                break
            }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        guard started else {
            attach(argument + "-load-failure", web: web)
            let detail = try? await web.evaluateJavaScript("String(window.__fixtureError || document.title || 'no title')")
            throw failure("Could not start " + page + " at " + (web.url?.absoluteString ?? "nil") + " · " + String(describing: detail))
        }
        var lastStep = ""
        let evidenceSteps: Set<String> = ["avatar","review","male opens the female signup in Discovery","female signs and proposes duration","male reviews duration and signs","both exchange messages and receive read receipts","expiry is visible and male ends pact","female shares family contact, male reveals and hides it"]
        for _ in 0..<1100 {
            let step = (try? await web.evaluateJavaScript("String(window.relationshipAudit?.step || window.lifecycleEntryStep || window.lifecycleSignupStep || '')")) as? String ?? ""
            if step != lastStep {
                print("[lifecycle] \(argument) · \(step)")
                if evidenceSteps.contains(step) { attach(argument + " · " + step, web: web) }
                lastStep = step
            }
            if let json = (try? await web.evaluateJavaScript("window.__nativeResult ? JSON.stringify(window.__nativeResult) : ''")) as? String,
               !json.isEmpty, let result = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] {
                guard result["ok"] as? Bool == true, let value = result["value"] as? [String: Any]
                    else {
                        let reason = "\(argument) at \(lastStep): " + (result["error"] as? String ?? "Empty result")
                        print("[lifecycle] fixture failure " + reason)
                        attach(argument + "-failed", web: web)
                        throw failure(reason)
                    }
                attach(page + "-" + argument, web: web)
                return String(decoding: try JSONSerialization.data(withJSONObject: value), as: UTF8.self)
            }
            try await Task.sleep(nanoseconds: 300_000_000)
        }
        attach(argument + "-timeout", web: web)
        throw failure("Timed out on " + argument + " at " + lastStep)
    }

    func testTwoMemberLifecycle() async throws {
        let web = try await host()
        installBridge(web)
        var submitted = 0
        for actor in ["man", "woman"] {
            do {
                let signup = try await exercise(web, page: "lifecycle-signup", function: "runLifecycleSignup", argument: actor)
                let (status, text) = try await local.call("/signup", method: "POST", body: signup)
                guard status == 200 else { throw failure("\(actor) submission failed: " + text.prefix(400)) }
                let response = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]
                submitted += 1
                XCTAssertEqual(response?["ready"] as? Bool, submitted == 2)
                print("[lifecycle] registered \(actor)")
            } catch {
                print("[lifecycle] signup failure " + actor + " " + error.localizedDescription)
                XCTFail("Signup for " + actor + ": " + error.localizedDescription)
            }
        }
        guard submitted == 2 else { return }
        for actor in ["man","woman"] {
            do {
                let entry = try await exercise(web, page: "lifecycle-entry", function: "runLifecycleEntry", argument: actor)
                let checkpoint = try JSONSerialization.jsonObject(with: Data(entry.utf8)) as? [String:Any]
                XCTAssertEqual(checkpoint?["gender"] as? String, actor)
                print("[lifecycle] approved \(actor) entered free Discovery")
            } catch { XCTFail("App entry for " + actor + ": " + error.localizedDescription) }
        }
        var requestID: String?
        for branch in ["end", "escalate"] {
            do {
                let result = try await exercise(web, page: "lifecycle-relationship", function: "runRelationshipLifecycle", argument: branch)
                let report = try JSONSerialization.jsonObject(with: Data(result.utf8)) as? [String: Any]
                XCTAssertEqual(report?["branch"] as? String, branch)
                let id = try XCTUnwrap(report?["requestId"] as? String)
                if let first = requestID { XCTAssertEqual(id, first, "Branches must use the same signed pact") }
                requestID = id
                let attachment = XCTAttachment(string: result)
                attachment.name = branch + "-steps"
                attachment.lifetime = .keepAlways
                add(attachment)
                print("[lifecycle] completed \(branch)")
            } catch { XCTFail("Relationship branch " + branch + ": " + error.localizedDescription) }
        }
        try await exerciseLocalStoreKit(web: web)
    }
}
