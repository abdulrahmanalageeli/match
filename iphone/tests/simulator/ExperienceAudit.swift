import XCTest

final class ExperienceAudit: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.blindmatch.marriage")
    func visit(_ page: String) throws {
        app.launch()
        let link = app.links[page]
        XCTAssertTrue(link.waitForExistence(timeout: 15))
        link.tap()
        XCTAssertTrue(link.waitForNonExistence(timeout: 8))
        Thread.sleep(forTimeInterval: 1)
    }
    func capture(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"
        tree.lifetime = .keepAlways
        add(tree)
    }
    func testWelcomeAndKeyboard() throws {
        try visit("welcome")
        capture("welcome")
        let join = app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "ابدأ رحلتك")).firstMatch
        XCTAssertTrue(join.waitForExistence(timeout: 10))
        join.tap()
        capture("signup")
        let email = app.textFields.firstMatch
        if email.waitForExistence(timeout: 5) {
            email.tap()
            email.typeText("audit@example.invalid")
            capture("signup-keyboard")
            XCUIDevice.shared.press(.home)
            app.activate()
            XCTAssertEqual(email.value as? String, "audit@example.invalid")
            capture("signup-resume")
        }
    }
    func testGuidedScreens() throws {
        for page in ["criteria","birthday","photo","readiness","profile","settings","luna"] {
            try visit(page)
            capture(page + "-open")
            app.swipeUp()
            capture(page + "-scroll")
            app.swipeDown()
            if page == "settings" {
                let membership = app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "عضويتي")).firstMatch
                if membership.exists { membership.tap(); capture("settings-membership") }
            }
            if page == "luna" {
                let review = app.descendants(matching:.any).matching(NSPredicate(format:"label CONTAINS %@", "هذا ما فهمته منك")).firstMatch
                if review.exists && review.isHittable { review.tap(); capture("luna-review") }
            }
            app.terminate()
        }
    }
    func testPairedControls() throws {
        for version in ["before-", ""] {
            for page in ["criteria", "birthday", "settings", "profile"] {
                try visit(version + page)
                if page == "profile" { Thread.sleep(forTimeInterval: 3) }
                capture(version + page + "-comparison")
                if page == "settings" || page == "profile" { app.swipeUp(); capture(version + page + "-comparison-scroll") }
                app.terminate()
            }
        }
    }
    private func launchFixture(_ page: String) {
        app.launchEnvironment["AUDIT_PAGE"] = page
        app.launch()
    }
    func testBirthdayFitsSE() throws {
        launchFixture("birthday")
        let field = app.descendants(matching: .other).matching(NSPredicate(format: "label == %@", "اختر تاريخ ميلادك · ميلادي")).firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 90))
        let title = app.staticTexts["متى يوم ميلادك؟"]
        XCTAssertTrue(title.exists)
        // The birthday card starts 20 pt from the SE screen edge and has its own padding.
        XCTAssertGreaterThanOrEqual(field.frame.minX, 30)
        XCTAssertLessThanOrEqual(field.frame.maxX, app.frame.maxX - 30)
        XCTAssertGreaterThanOrEqual(field.frame.height, 44)
        capture("birthday-contained")
        field.tap()
        capture("birthday-picker")
    }
    func testChat() throws {
        continueAfterFailure = false
        let body = "Retry " + String(UUID().uuidString.prefix(8))
        let open = app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "فتح المحادثة")).firstMatch
        launchFixture("messages")
        XCTAssertTrue(open.waitForExistence(timeout: 90))
        open.tap()
        let field = app.textViews.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 30))
        field.tap()
        field.typeText(body)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertEqual(field.value as? String, body)
        app.buttons["إرسال الرسالة"].tap()
        let retry = app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "إعادة الإرسال")).firstMatch
        XCTAssertTrue(retry.waitForExistence(timeout: 30))
        capture("chat-failed")
        retry.tap()
        XCTAssertTrue(retry.waitForNonExistence(timeout: 30))
        let receipt = app.images.matching(NSPredicate(format:"label IN %@", ["تم التسليم","قُرئت"])).firstMatch
        XCTAssertTrue(receipt.waitForExistence(timeout: 30))
        capture("chat-retried")
        app.terminate()
        launchFixture("recipient")
        XCTAssertTrue(open.waitForExistence(timeout: 60))
        open.tap()
        let received = app.staticTexts.matching(identifier: body)
        XCTAssertTrue(received.firstMatch.waitForExistence(timeout: 30))
        XCTAssertEqual(received.count, 1)
        capture("chat-received")
    }
}
