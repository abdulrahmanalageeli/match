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

    private func openPage(_ query: String) async throws -> WKWebView {
        for _ in 0..<160 {
            let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
            for window in windows {
                if let web = findWebView(window) {
                    let address = "capacitor://localhost/simulator-tests/tests/fixtures/profile-qa.html?" + query
                    web.load(URLRequest(url: URL(string: address)!))
                    return web
                }
            }
            try await Task.sleep(nanoseconds: 125_000_000)
        }
        throw NSError(domain: "SimulatorChecks", code: 1)
    }

    private func waitFor(_ expression: String, in web: WKWebView) async throws {
        for _ in 0..<240 {
            if let ready = try? await web.evaluateJavaScript("Boolean(" + expression + ")") as? Bool, ready { return }
            try await Task.sleep(nanoseconds: 125_000_000)
        }
        let body = try? await web.evaluateJavaScript("document.body.innerText.slice(0,500)")
        throw NSError(domain: "SimulatorChecks", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "Timed out waiting for \(expression) at \(String(describing: web.url)): \(String(describing: body))"
        ])
    }

    private func capture(_ name: String, in web: WKWebView) async throws {
        try await waitFor("document.fonts.status === 'loaded'", in: web)
        _ = try await web.evaluateJavaScript("""
            const style = document.createElement('style');
            style.textContent = '#qa-result, .nf-tester-tools { display:none !important }';
            document.head.appendChild(style);
            true
            """)
        try await Task.sleep(nanoseconds: 450_000_000)
        let surface: UIView = web.window.map { $0 as UIView } ?? web
        let image = UIGraphicsImageRenderer(bounds: surface.bounds).image { _ in
            surface.drawHierarchy(in: surface.bounds, afterScreenUpdates: true)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testScreenPreviews() async throws {
        let web = try await openPage("alerts&actor=abdulrahman")
        try await waitFor("location.search.includes('alerts') && window.qaAlerts && (document.querySelector('.wd-overview') || document.querySelector('[data-community-tab]'))", in: web)
        _ = try await web.evaluateJavaScript("document.querySelector('.wd-overview header button')?.click(); true")
        let notificationsTab = "Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'الإشعارات')"
        try await waitFor(notificationsTab, in: web)
        _ = try await web.evaluateJavaScript("""
            window.qaAlerts.add('agreement:proposed','c0000000-0000-4000-8000-000000000001');
            window.qaAlerts.add('family_room:invited','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000055');
            \(notificationsTab).click();
            true
            """)
        try await waitFor("document.querySelectorAll('.cm-notification-row').length >= 3", in: web)
        try await capture("Notifications", in: web)

        for (state, title) in [("accepted","Matched profile"),("unmatched","Unmatched profile")] {
            _ = try await openPage("profileConnection=" + state + "&actor=reham")
            try await waitFor("location.search.includes('profileConnection=\(state)') && document.querySelector('.mp-profile h1')", in: web)
            try await capture(title, in: web)
        }
    }
}

