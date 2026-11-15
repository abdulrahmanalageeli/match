import Foundation

public enum SignupValidation {
    public static func normalizedEmail(_ value: String) -> String { value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
    public static func validEmail(_ value: String) -> Bool {
        let email = normalizedEmail(value)
        return email.utf16.count <= 254 && email.range(of: #"^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$"#, options: .regularExpression) != nil
    }
    public static func validPassword(_ value: String) -> Bool {
        value.utf16.count >= 10 && value.utf8.count <= 72 && !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    public static func otp(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let digits = trimmed.compactMap { $0.wholeNumberValue.map(String.init) }.joined()
        guard (4...8).contains(trimmed.count), trimmed.unicodeScalars.allSatisfy(CharacterSet.decimalDigits.contains), digits.count == trimmed.count else { return nil }
        return digits
    }
    public static func validProof(_ value: String) -> Bool { value.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil }
}
