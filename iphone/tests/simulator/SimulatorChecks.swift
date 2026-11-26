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

    private func openPreview() async throws -> WKWebView {
        for _ in 0..<160 {
            let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
            for window in windows {
                if let web = findWebView(window) {
                    let address = "capacitor://localhost/tests/simulator/preview.html"
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
        let web = try await openPreview()
        try await waitFor("location.pathname.endsWith('/preview.html') && document.querySelector('.wd-overview, .mi-tabbar')", in: web)
        _ = try await web.evaluateJavaScript("document.querySelector('.wd-overview header button')?.click(); true")
        let discoverTab = "document.querySelector('.mi-tab[data-tab=discover]')"
        try await waitFor(discoverTab, in: web)
        _ = try await web.evaluateJavaScript("\(discoverTab).click(); true")
        let luna = "document.querySelector('.luna-search-entry')"
        try await waitFor(luna + " && document.querySelector('button[data-weekly-person]')", in: web)
        try await capture("Discovery and Luna", in: web)
        _ = try await web.evaluateJavaScript("\(luna).click(); true")
        try await waitFor("document.querySelector('.luna-search-conversation')", in: web)
        try await capture("Luna expanded", in: web)
        _ = try await web.evaluateJavaScript("\(luna).click(); true")

        let notificationsTab = "document.querySelector('button.mi-tab[data-tab=inbox]')"
        try await waitFor(notificationsTab, in: web)
        _ = try await web.evaluateJavaScript("\(notificationsTab).click(); true")
        try await waitFor("document.querySelector('.cm-notification-feed')", in: web)
        try await capture("Notifications", in: web)

        _ = try await web.evaluateJavaScript("\(discoverTab).click(); true")
        let profile = "document.querySelector('button[data-weekly-person]')"
        try await waitFor(profile, in: web)
        _ = try await web.evaluateJavaScript("\(profile).click(); true")
        try await waitFor("document.querySelector('.mp-profile h1')", in: web)
        try await capture("Discovery profile", in: web)
    }

    func testSafeAreaChrome() async throws {
        let web = try await openPreview()
        try await waitFor("location.pathname.endsWith('/preview.html') && document.querySelector('.wd-overview, .mi-tabbar')", in: web)
        _ = try await web.evaluateJavaScript("document.querySelector('.wd-overview header button')?.click(); true")
        let discover = "document.querySelector('.mi-tab[data-tab=discover]')"
        try await waitFor(discover, in: web)
        _ = try await web.evaluateJavaScript("\(discover).click(); true")
        try await waitFor("document.querySelector('.df-recommendation') && document.fonts.status === 'loaded'", in: web)
        let geometry = """
            (() => {
              const bar = document.querySelector('.mi-tabbar');
              const active = bar.querySelector('[aria-current=page]');
              const bottom = parseFloat(getComputedStyle(bar).paddingBottom);
              const top = parseFloat(getComputedStyle(document.body, '::before').height);
              return top > 0 && bottom > 0 && innerWidth === document.documentElement.scrollWidth
                && Math.abs(bar.getBoundingClientRect().bottom - innerHeight) < 2
                && active.getBoundingClientRect().bottom <= innerHeight - bottom + 1
                && [...bar.children].every(item => item.getBoundingClientRect().height >= 44);
            })()
            """
        try await waitFor(geometry, in: web)
        try await waitFor("document.querySelector('.df-recommendation').getBoundingClientRect().left >= 12 && document.querySelector('.luna-search-entry').getBoundingClientRect().height >= 44", in: web)

        _ = try await web.evaluateJavaScript("""
            (() => {
              window.footerTravel = [];
              const sample = () => {
                const tab = document.querySelector('.mi-tab-active[data-tab=settings]');
                if (tab) {
                  const marker = tab.querySelector('.mi-tab-marker').getBoundingClientRect();
                  const box = tab.getBoundingClientRect();
                  window.footerTravel.push(marker.left + marker.width / 2 - box.left - box.width / 2);
                }
                if (performance.now() - start < 2500) requestAnimationFrame(sample);
              };
              const start = performance.now();
              document.querySelector('button.mi-tab[data-tab=settings]').click();
              requestAnimationFrame(sample);
              return true;
            })()
            """)
        try await waitFor("window.footerTravel.some(x => x > 8) && Math.abs(window.footerTravel.at(-1)) < 1", in: web)
        try await waitFor("document.querySelector('.mi-tab-active[data-tab=settings]')", in: web)
        try await waitFor(geometry, in: web)
    }
}

