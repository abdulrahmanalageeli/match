import SwiftUI
import WudaynCore

struct NativePasswordRecovery: View {
    @EnvironmentObject private var store: NativeStore
    @State var email: String
    @State private var sent = false
    @State private var sentAt = Date.distantPast
    @State private var now = Date()
    private var redirect: URL? {
        guard let configured = Bundle.main.object(forInfoDictionaryKey: "WudaynPasswordRecoveryURL") as? String,
              var parts = URLComponents(string: configured), parts.scheme == "https", parts.host != nil, parts.user == nil, parts.password == nil else { return nil }
        parts.queryItems = [URLQueryItem(name: "auth", value: "recovery")]; parts.fragment = nil
        return parts.url
    }
    var body: some View {
        Form {
            if let redirect {
                TextField("البريد الإلكتروني", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(store.busy)
                Text("يفتح رابط البريد صفحة الاستعادة الآمنة، ثم تعود إلى التطبيق لتسجيل الدخول.").foregroundStyle(.secondary)
                NativeAction(title: "إرسال رابط الاستعادة") { guard SignupValidation.validEmail(email) else { throw NativeProblem.message("أدخل بريدًا إلكترونيًا صالحًا.") }; try await store.client.passwordReset(email: SignupValidation.normalizedEmail(email), redirect: redirect); sent = true; sentAt = Date() }.disabled(!SignupValidation.validEmail(email) || now.timeIntervalSince(sentAt) < 60)
                if sent { Text("إذا كان البريد مسجلًا، ستصلك تعليمات الاستعادة.") }
            } else { Text("استعادة كلمة المرور بالبريد غير متاحة في هذه النسخة بعد. تواصل مع الدعم لاستعادة الوصول إلى حسابك.") }
            Link("التواصل مع الدعم", destination: URL(string: "mailto:privacy@blindmatch.app")!)
        }.navigationTitle("استعادة الحساب").onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }.onChange(of: email) { _ in sent = false }
    }
}
