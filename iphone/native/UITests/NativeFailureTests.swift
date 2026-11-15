import XCTest

final class NativeFailureTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<7 { if element.isHittable { return }; app.swipeUp() }
    }
    @MainActor func testSignupRequiresConsentAndValidOTP() throws {
        let app = XCUIApplication(); app.launchArguments = ["--native-ui-tests"]; app.launch()
        app.buttons["إنشاء حساب"].tap()
        let email = app.textFields["signup.email"]
        XCTAssertTrue(email.waitForExistence(timeout: 10)); email.tap(); email.typeText("new@example.invalid")
        app.secureTextFields["signup.password"].tap(); app.secureTextFields["signup.password"].typeText("fixture-password")
        app.textFields["signup.phone"].tap(); app.textFields["signup.phone"].typeText("0501234567")
        let send = app.buttons["signup.sendSMS"]; XCTAssertFalse(send.isEnabled)
        app.swipeDown()
        for id in ["signup.adult", "signup.terms", "signup.privacy", "signup.smsConsent"] {
            let toggle = app.switches[id]; reveal(toggle, in: app); toggle.tap()
        }
        reveal(send, in: app); XCTAssertTrue(send.isEnabled); send.tap()
        let code = app.textFields["signup.code"]; XCTAssertTrue(code.waitForExistence(timeout: 10)); reveal(code, in: app)
        code.tap(); code.typeText("000000")
        let verify = app.buttons["signup.verifySMS"]; reveal(verify, in: app); verify.tap()
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 10)); app.alerts.buttons["حسنًا"].tap()
        XCTAssertFalse(app.buttons["signup.create"].isEnabled)
        code.tap(); code.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 6) + "123456")
        reveal(verify, in: app); verify.tap()
        let create = app.buttons["signup.create"]; reveal(create, in: app)
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: create)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed); create.tap()
        XCTAssertTrue(app.staticTexts["signup.created"].waitForExistence(timeout: 10))
        XCTAssertFalse(create.isEnabled)
    }
    @MainActor func testFailedLoginMatchAndSendRetryThenRevokedChat() throws {
        let app = XCUIApplication(); app.launchArguments = ["--native-ui-tests", "--native-failure-tests"]; app.launch()
        let email = app.textFields["login.email"]; XCTAssertTrue(email.waitForExistence(timeout: 10)); email.tap(); email.typeText("ui@example.invalid")
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
