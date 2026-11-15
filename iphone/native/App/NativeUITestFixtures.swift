#if DEBUG
import Foundation
import WudaynCore

// Compiled out of Release. The UI test process never uses a production session,
// network connection, push registration or purchase listener.
struct NativeUITestVault: SessionVault {
    func read() throws -> Data? { nil }
    func write(_ data: Data) throws {}
    func clear() throws {}
}
actor NativeUITestTransport: HTTPTransport {
    private var messages: [JSONValue] = []
    private let failures = ProcessInfo.processInfo.arguments.contains("--native-failure-tests")
    private var accepted = false
    private var acceptFailed = false
    private var sendFailed = false
    private var denied = false
    static let owner = "11111111-1111-4111-8111-111111111111"
    static let peer = "22222222-2222-4222-8222-222222222222"
    private let connection = "33333333-3333-4333-8333-333333333333"
    private var person: JSONValue { .object(["id": .string(Self.peer), "alias": .string("ملف تجريبي"), "age": .number(28), "city": .string("الرياض"), "occupation": .string("مهندس"), "bio": .string("بيانات اصطناعية لاختبار الواجهة.")]) }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let path = request.url!.path, body = (try? JSONValue.decode(request.httpBody ?? Data())) ?? .null
        func response(_ value: JSONValue, status: Int = 200) throws -> (Data, HTTPURLResponse) {
            (try value.encoded(), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
        if path == "/auth/v1/token", body["password"].string == "wrong" { return try response(.object(["error": .string("بيانات الدخول غير صحيحة")]), status: 400) }
        if denied && ["marriage_thread_page", "marriage_agreement"].contains(path.components(separatedBy: "/").last ?? "") { return try response(.object(["error": .string("انتهى الوصول للمحادثة")]), status: 403) }
        let value: JSONValue
        if path == "/auth/v1/token" { value = .object(["access_token": .string("ui-fixture"), "refresh_token": .string("ui-fixture-refresh"), "expires_at": .number(Date().timeIntervalSince1970 + 3600), "user": .object(["id": .string(Self.owner), "email": .string("ui@example.invalid")])]) }
        else {
            switch path.components(separatedBy: "/").last ?? "" {
            case "marriage_state": value = .object(["user": .object(["id": .string(Self.owner), "applicationStatus": .string("approved")]), "profile": .object(["displayName": .string("اختبار الواجهة"), "birthDate": .string("1995-01-01"), "city": .string("الرياض"), "gender": .string("man")]), "membership": .object(["active": .bool(true)])])
            case "marriage_browse": value = .array([person])
            case "signup-sms":
                if body["action"].string == "verify" && body["otp"].string != "123456" { return try response(.object(["error": .string("رمز التحقق غير صحيح")]), status: 400) }
                value = .object(["proof": .string(String(repeating: "a", count: 64)), "verified": .bool(body["action"].string == "verify")])
            case "member-signup":
                guard body["consent"]["adult"].bool, body["consent"]["terms"].bool, body["consent"]["privacy"].bool, body["phoneProof"].string == String(repeating: "a", count: 64) else { return try response(.null, status: 400) }
                value = .object(["ok": .bool(true)])
            case "marriage_inbox": value = .array([.object(["id": .string(connection), "person": person, "status": .string(failures && !accepted ? "pending" : "accepted"), "direction": .string("incoming")])])
            case "marriage_act":
                if failures && !acceptFailed { acceptFailed = true; return try response(.object(["error": .string("تعذّر قبول الطلب مؤقتًا")]), status: 503) }
                accepted = true; value = .bool(true)
            case "marriage_thread_page": value = .array(messages)
            case "marriage_agreement": value = .object(["status": .string("family")])
            case "marriage_message":
                let message: JSONValue = .object(["id": body["client_id"], "body": body["message_body"], "senderIsMe": .bool(true), "createdAt": .string("2026-11-15T10:00:00Z")])
                if !messages.contains(where: { $0["id"] == body["client_id"] }) { messages.append(message) }
                if failures && !sendFailed { sendFailed = true; return try response(.object(["error": .string("تعذّر تأكيد الإرسال مؤقتًا")]), status: 503) }
                if body["message_body"].string == "Revoke access" { denied = true }
                value = message
            case "marriage_matching_exclusions": value = .array([.object(["id": .string(Self.peer), "alias": .string("ملف مستبعد"), "reason": .string("no_rematch"), "since": .string("2026-11-15")])])
            case "marriage_family": value = .object(["role": .string("member"), "participantId": .string(Self.owner), "links": .array([]), "rooms": .array([])])
            case "marriage_passport": value = .object(["consentedAt": .null, "claims": .array([]), "grants": .array([])])
            case "interview": value = .object(["document": .null, "revision": .number(0)])
            default: value = .array([])
            }
        }
        return (try value.encoded(), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
#endif
