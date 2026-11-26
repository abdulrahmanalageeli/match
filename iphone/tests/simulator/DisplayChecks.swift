import XCTest

final class DisplayChecks: XCTestCase {
    private func saveDisplay(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testMemberTabsOnDisplay() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.blindmatch.marriage")
        app.launch()
        let skip = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "تخطّي الجولة")).firstMatch
        if skip.waitForExistence(timeout: 8) { skip.tap() }
        let luna = app.buttons["ابحث مع لونا"]
        if !luna.exists {
            let discover = app.buttons["استكشف"]
            XCTAssertTrue(discover.waitForExistence(timeout: 25))
            discover.tap()
        }
        XCTAssertTrue(luna.waitForExistence(timeout: 25))
        let settings = app.buttons["الإعدادات"]
        XCTAssertTrue(settings.waitForExistence(timeout: 15))
        saveDisplay("Discovery full display")
        settings.tap()
        XCTAssertTrue(app.buttons["استكشف"].waitForExistence(timeout: 25))
        saveDisplay("Settings full display")
    }
}
