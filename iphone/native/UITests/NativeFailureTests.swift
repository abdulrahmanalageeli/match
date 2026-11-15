import XCTest

final class NativeFailureTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<7 { if element.isHittable { return }; app.swipeUp() }
    }
    @MainActor func testSocialSignupRequiresConsentAndValidOTP() throws {
        let app = XCUIApplication(); app.launchArguments = ["--native-ui-tests", "--social-onboarding-tests"]; app.launch()
        XCTAssertTrue(app.textFields["signup.phone"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.tabBars.buttons["مساحتي"].exists)
        app.textFields["signup.phone"].tap(); app.textFields["signup.phone"].typeText("0501234567")
        app.buttons["signup.dismissKeyboard"].tap()
        let send = app.buttons["signup.sendSMS"]; XCTAssertFalse(send.isEnabled)
        app.swipeDown()
        for id in ["signup.adult", "signup.terms", "signup.privacy", "signup.smsConsent"] {
            let toggle = app.switches[id]; reveal(toggle, in: app)
            // SwiftUI exposes the full RTL row as the switch element. Tap its
            // visible control on the left, not the noninteractive label.
            toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)).tap()
            let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '1'"), object: toggle)
            XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 5), .completed, id)
        }
        reveal(send, in: app); XCTAssertTrue(send.isEnabled); send.tap()
        let code = app.textFields["signup.code"]; XCTAssertTrue(code.waitForExistence(timeout: 10)); reveal(code, in: app)
        code.tap(); code.typeText("000000")
        app.buttons["signup.dismissKeyboard"].tap()
        let verify = app.buttons["signup.verifySMS"]; reveal(verify, in: app); verify.tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 10)); app.alerts.buttons["حسنًا"].tap()
        XCTAssertFalse(app.buttons["signup.create"].isEnabled)
        code.tap(); code.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 6) + "123456")
        app.buttons["signup.dismissKeyboard"].tap()
        reveal(verify, in: app); verify.tap()
        let create = app.buttons["signup.create"]; reveal(create, in: app)
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: create)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed); create.tap()
        XCTAssertTrue(app.tabBars.buttons["مساحتي"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.textFields["signup.phone"].exists)
    }
    @MainActor func testFailedLoginMatchAndSendRetryThenRevokedChat() throws {
        let app = XCUIApplication(); app.launchArguments = ["--native-ui-tests", "--native-failure-tests"]; app.launch()
        let existing = app.buttons["لديّ حساب بالبريد الإلكتروني"]; reveal(existing, in: app); existing.tap()
        let email = app.textFields["login.email"]; XCTAssertTrue(email.waitForExistence(timeout: 10)); reveal(email, in: app); email.tap(); email.typeText("ui@example.invalid")
        let password = app.secureTextFields["login.password"]; password.tap(); password.typeText("wrong"); app.buttons["login.submit"].tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 10)); app.alerts.buttons["حسنًا"].tap()
        XCTAssertFalse(app.tabBars.buttons["التعارفات"].exists)
        password.tap(); password.typeText("fixture-password"); app.buttons["login.submit"].tap()
        let inbox = app.tabBars.buttons["التعارفات"]; XCTAssertTrue(inbox.waitForExistence(timeout: 10)); inbox.tap()
        let accept = app.buttons["match.accept"]; XCTAssertTrue(accept.waitForExistence(timeout: 10)); accept.tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 10)); app.alerts.buttons["حسنًا"].tap()
        XCTAssertTrue(accept.exists); accept.tap()
        XCTAssertTrue(accept.waitForNonExistence(timeout: 10))
        app.staticTexts["ملف تجريبي"].firstMatch.tap()
        let composer = app.descendants(matching: .any)["chat.composer"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 10)); composer.tap(); composer.typeText("Retry message")
        let send = app.buttons["chat.send"]; send.tap()
        XCTAssertTrue(app.staticTexts["تعذّر تأكيد الإرسال مؤقتًا"].waitForExistence(timeout: 10))
        XCTAssertEqual(composer.value as? String, "Retry message")
        send.tap()
        XCTAssertTrue(app.staticTexts["Retry message"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts.matching(identifier: "Retry message").count, 1)
        composer.tap(); composer.typeText("Revoke access"); send.tap()
        XCTAssertTrue(app.staticTexts["انتهى الوصول للمحادثة"].waitForExistence(timeout: 10))
        XCTAssertFalse(composer.isEnabled)
        XCTAssertFalse(app.staticTexts["Retry message"].exists)
    }
}
