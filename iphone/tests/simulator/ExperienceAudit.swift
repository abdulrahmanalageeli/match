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
    func testChat() throws {
        try visit("messages")
        let open = app.buttons.matching(NSPredicate(format:"label CONTAINS %@", "فتح المحادثة")).firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 8))
        open.tap()
        capture("chat-open")
        let field = app.textViews.firstMatch
        if field.waitForExistence(timeout: 6) {
            field.tap()
            field.typeText("QA draft")
            capture("chat-keyboard")
            XCUIDevice.shared.press(.home)
            app.activate()
            capture("chat-resume")
            let send = app.buttons["إرسال الرسالة"]
            if send.isHittable { send.tap(); Thread.sleep(forTimeInterval: 2); capture("chat-interrupted") }
        }
    }
}
