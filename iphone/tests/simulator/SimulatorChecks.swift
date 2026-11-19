import XCTest
import UIKit
import WebKit

@MainActor
final class SimulatorChecks: XCTestCase {
    private func findWebView(_ view: UIView) -> WKWebView? {
        if let web = view as? WKWebView { return web }
        for child in view.subviews {
            if let web = findWebView(child) { return web }
        }
        return nil
    }

    private func openPage(_ path: String) async throws -> WKWebView {
        for _ in 0..<160 {
            let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
            for window in windows {
                if let web = findWebView(window) {
                    web.load(URLRequest(url: URL(string: "capacitor://localhost/" + path)!))
                    return web
                }
            }
            try await Task.sleep(nanoseconds: 125_000_000)
        }
        throw NSError(domain: "SimulatorChecks", code: 1, userInfo: [NSLocalizedDescriptionKey: "App did not expose a WKWebView"])
    }

    private func waitFor(_ expression: String, in web: WKWebView) async throws {
        for _ in 0..<160 {
            if let ready = try? await web.evaluateJavaScript("Boolean(" + expression + ")") as? Bool, ready { return }
            try await Task.sleep(nanoseconds: 125_000_000)
        }
        let body = try? await web.evaluateJavaScript("document.body.innerText.slice(0,250)")
        throw NSError(domain: "SimulatorChecks", code: 2, userInfo: [NSLocalizedDescriptionKey: "Timed out waiting for \(expression) at \(String(describing: web.url)) — \(String(describing: body))"])
    }

    private func screenshot(_ name: String, _ web: WKWebView) {
        let image = UIGraphicsImageRenderer(bounds: web.bounds).image { _ in
            web.drawHierarchy(in: web.bounds, afterScreenUpdates: true)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testWelcomeToRegistration() async throws {
        let web = try await openPage("index.html")
        try await waitFor("document.querySelector('.nf-join')", in: web)
        screenshot("Welcome", web)
        _ = try await web.evaluateJavaScript("document.querySelector('.nf-join').click(); true")
        try await waitFor("document.querySelector('input[name=email]') && document.querySelector('input[name=password]')", in: web)
        screenshot("Registration", web)
    }

    func testLunaCorrection() async throws {
        let web = try await openPage("simulator-tests/tests/simulator/luna.html")
        let field = "document.querySelector('.wi-extracted-answer select')"
        try await waitFor(field + "?.value === 'D'", in: web)
        _ = try await web.evaluateJavaScript("document.querySelector('.wi-hybrid-captured-review summary').click(); " + field + ".value='B'; " + field + ".dispatchEvent(new Event('change',{bubbles:true})); true")
        try await waitFor("document.querySelector('.wi-extracted-answer[data-corrected] select')?.value === 'B'", in: web)
        screenshot("Luna correction", web)
    }

    func testSendMessage() async throws {
        let web = try await openPage("simulator-tests/tests/fixtures/chat-privacy-qa.html?actor=abdulrahman&case=ios")
        try await waitFor("document.querySelector('.cm-request')", in: web)
        _ = try await web.evaluateJavaScript("document.querySelector('.cm-request').click(); true")
        try await waitFor("document.querySelector('form textarea:enabled')", in: web)
        _ = try await web.evaluateJavaScript("""
            var composer=document.querySelector('form textarea:enabled');
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(composer,'Simulator delivery check');
            composer.dispatchEvent(new Event('input',{bubbles:true})); true
            """)
        try await waitFor("document.querySelector('form button[type=submit]:enabled')", in: web)
        _ = try await web.evaluateJavaScript("document.querySelector('form button[type=submit]:enabled').click(); true")
        try await waitFor("localStorage.getItem('nisfayn-local-chat-privacy-qa-ios')?.includes('Simulator delivery check') && document.body.innerText.includes('Simulator delivery check')", in: web)
        screenshot("Message sent", web)
    }
}
