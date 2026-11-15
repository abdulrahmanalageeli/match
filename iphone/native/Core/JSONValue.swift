import Foundation

/// Preserve server-owned fields when editing a profile; never rebuild a partial
/// profile and silently erase assessments, consent receipts or private answers.
public enum JSONValue: Codable, Equatable, Sendable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    public subscript(_ key: String) -> JSONValue {
        get { if case .object(let v) = self { return v[key] ?? .null }; return .null }
        set { var v = object; v[key] = newValue; self = .object(v) }
    }
    public var object: [String: JSONValue] { if case .object(let v) = self { return v }; return [:] }
    public var array: [JSONValue] { if case .array(let v) = self { return v }; return [] }
    public var string: String { if case .string(let v) = self { return v }; return "" }
    public var bool: Bool { if case .bool(let v) = self { return v }; return false }
    public var number: Double { if case .number(let v) = self { return v }; return 0 }
    public var isNull: Bool { self == .null }
    public func encoded() throws -> Data { try JSONEncoder().encode(self) }
    public static func decode(_ data: Data) throws -> JSONValue { try JSONDecoder().decode(Self.self, from: data) }
}

public struct MemberRow: Identifiable, Equatable, Sendable {
    public let value: JSONValue
    public var id: String { value["id"].string }
    public init(_ value: JSONValue) { self.value = value }
}

public enum NativeProblem: LocalizedError, Equatable {
    case message(String), http(status: Int, message: String), sessionChanged, signedOut, invalidResponse
    public static func isAccessDenied(_ error: Error) -> Bool {
        guard let problem = error as? NativeProblem else { return false }
        switch problem {
        case .signedOut, .sessionChanged: return true
        case .http(let status, _): return [401, 403, 404, 410].contains(status)
        default: return false
        }
    }
    public var errorDescription: String? {
        switch self {
        case .message(let text): return text
        case .http(_, let message): return message
        case .sessionChanged: return "تغيّرت جلسة الحساب. افتح الصفحة مجددًا."
        case .signedOut: return "سجّل الدخول مجددًا."
        case .invalidResponse: return "تعذّر قراءة رد الخدمة. حاول مجددًا."
        }
    }
}
