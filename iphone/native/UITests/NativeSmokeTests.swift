import XCTest

final class NativeSmokeTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor func testLoginDiscoveryChatAndExclusions() throws {
        let app = XCUIApplication(); app.launchArguments = ["--native-ui-tests"]; app.launch()
        let email = app.textFields["login.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 15)); email.tap(); email.typeText("ui@example.invalid")
        let password = app.secureTextFields["login.password"]; password.tap(); password.typeText("fixture-password")
        app.buttons["login.submit"].tap()
        XCTAssertTrue(app.tabBars.buttons["اكتشاف"].waitForExistence(timeout: 15))
        app.tabBars.buttons["اكتشاف"].tap()
        XCTAssertTrue(app.staticTexts["ملف تجريبي"].waitForExistence(timeout: 10))
        capture(app, "discovery")
        app.tabBars.buttons["التعارفات"].tap(); app.staticTexts["ملف تجريبي"].firstMatch.tap()
        let composer = app.descendants(matching: .any)["chat.composer"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 10)); composer.tap()
        if app.buttons["Continue"].waitForExistence(timeout: 3) { app.buttons["Continue"].tap() }
        let systemContinue = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Continue"]
        if systemContinue.exists { systemContinue.tap() }
        composer.typeText("Native message")
        app.buttons["chat.send"].tap()
        XCTAssertTrue(app.staticTexts["Native message"].waitForExistence(timeout: 10))
        if app.buttons["keyboard.dismiss"].isHittable { app.buttons["keyboard.dismiss"].tap() }
        capture(app, "chat")
        app.navigationBars.buttons["التعارفات"].tap()
        app.tabBars.buttons["الإعدادات"].tap()
        capture(app, "settings")
        let exclusions = app.descendants(matching: .any)["settings.exclusions"].firstMatch
        for _ in 0..<5 { if exclusions.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(exclusions.exists); exclusions.tap()
        XCTAssertTrue(app.staticTexts["ملف مستبعد"].waitForExistence(timeout: 10))
        capture(app, "exclusions")
        XCTAssertEqual(app.webViews.count, 0, "Native navigation must not create a web view")
    }
    @MainActor private func capture(_ app: XCUIApplication, _ name: String) { let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment) }
}
