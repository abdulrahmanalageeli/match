import XCTest
@testable import WudaynCore

final class SignupValidationTests: XCTestCase {
    func testEmailNormalizationAndBackendBounds() {
        XCTAssertEqual(SignupValidation.normalizedEmail(" Member@Example.COM \n"), "member@example.com")
        XCTAssertTrue(SignupValidation.validEmail(" Member+test@Example.COM "))
        for value in ["missing-domain", "a b@example.com", "a@localhost", String(repeating: "a", count: 65) + "@example.com"] { XCTAssertFalse(SignupValidation.validEmail(value), value) }
    }
    func testPasswordBytesAndBlankPasswords() {
        XCTAssertFalse(SignupValidation.validPassword("short"))
        XCTAssertFalse(SignupValidation.validPassword(String(repeating: " ", count: 12)))
        XCTAssertTrue(SignupValidation.validPassword(String(repeating: "ع", count: 36)))
        XCTAssertFalse(SignupValidation.validPassword(String(repeating: "ع", count: 37)))
    }
    func testOTPRejectsMixedTextAndNormalizesArabicDigits() {
        XCTAssertEqual(SignupValidation.otp(" ١٢٣٤٥٦ "), "123456")
        XCTAssertEqual(SignupValidation.otp("۱۲۳۴"), "1234")
        for value in ["123", "123456789", "a1234", "12 34", "1234x", "ⅧⅧⅧⅧ"] { XCTAssertNil(SignupValidation.otp(value), value) }
    }
    func testMalformedProofFailsClosed() {
        XCTAssertTrue(SignupValidation.validProof(String(repeating: "ab", count: 32)))
        for value in ["", "verified", String(repeating: "g", count: 64), String(repeating: "a", count: 63)] { XCTAssertFalse(SignupValidation.validProof(value), value) }
    }
}
