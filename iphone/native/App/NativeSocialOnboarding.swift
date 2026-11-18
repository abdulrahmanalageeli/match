import SwiftUI
import WudaynCore

struct NativeSocialOnboarding: View {
    @EnvironmentObject private var store: NativeStore
    @State private var phone = ""
    @State private var code = ""
    @State private var proof = ""
    @State private var verified = false
    @State private var consent: JSONValue = .object(["version": .string("2026-11-07-privacy")])
    @State private var sentAt: Date?
    @State private var now = Date()
    @FocusState private var focused: Bool
    private var device: String { "ios:" + NativeDevice.installationID }
    private var agreed: Bool { consent["adult"].bool && consent["terms"].bool && consent["privacy"].bool && consent["sms"].bool }
    var body: some View {
        Form {
            Section {
                Text("اكتمل تسجيل الدخول. بقي تأكيد رقم جوالك ومراجعة الموافقات.")
                TextField("رقم الجوال السعودي", text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber).focused($focused).accessibilityIdentifier("signup.phone")
            }.disabled(store.busy || !proof.isEmpty)
            Section("بوضوح وبإذنك") {
                NavigationLink("الخصوصية وشروط الاستخدام", destination: NativeLegal())
                Toggle("أؤكد أن عمري ١٨ عامًا أو أكثر", isOn: $consent.flag("adult")).accessibilityIdentifier("signup.adult")
                Toggle("أوافق على شروط الاستخدام", isOn: $consent.flag("terms")).accessibilityIdentifier("signup.terms")
                Toggle("اطلعت على سياسة الخصوصية وأوافق عليها", isOn: $consent.flag("privacy")).accessibilityIdentifier("signup.privacy")
                Toggle("أوافق على التحقق من رقم جوالي واستخدام معرّف الجهاز عند التسجيل.", isOn: $consent.flag("sms")).accessibilityIdentifier("signup.smsConsent")
            }.disabled(store.busy)
            if !verified {
                NativeAction(title: "إرسال رمز التحقق") {
                    guard agreed else { throw NativeProblem.invalidResponse }
                    let normalized = try NativeDevice.normalizePhone(phone)
                    let value = try await store.client.service(.signupSMS, body: .object(["action": .string("send"), "email": store.onboarding["email"], "phone": .string(normalized), "deviceId": .string(device), "consent": .bool(true), "consentVersion": .string("signup-sms-device-v1")]))
                    guard SignupValidation.validProof(value["proof"].string) else { throw NativeProblem.invalidResponse }
                    proof = value["proof"].string; code = ""; verified = false; sentAt = Date()
                }.disabled(!agreed || phone.isEmpty || (sentAt.map { now.timeIntervalSince($0) < 60 } ?? false)).accessibilityIdentifier("signup.sendSMS")
                if !proof.isEmpty {
                    TextField("رمز التحقق", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode).focused($focused).disabled(store.busy).accessibilityIdentifier("signup.code")
                    NativeAction(title: "تأكيد الرمز") {
                        guard let otp = SignupValidation.otp(code), agreed else { throw NativeProblem.invalidResponse }
                        let value = try await store.client.service(.signupSMS, body: .object(["action": .string("verify"), "proof": .string(proof), "deviceId": .string(device), "otp": .string(otp)]))
                        guard value["verified"].bool else { throw NativeProblem.message("لم يكتمل التحقق.") }
                        verified = true; code = ""; focused = false
                    }.disabled(!agreed || SignupValidation.otp(code) == nil).accessibilityIdentifier("signup.verifySMS")
                }
            } else { Label("تم التحقق من الجوال", systemImage: "checkmark.shield") }
            if !proof.isEmpty { Button("تعديل رقم الجوال") { proof = ""; code = ""; verified = false }.disabled(store.busy) }
            NativeAction(title: "إكمال التسجيل") {
                guard agreed, verified else { throw NativeProblem.invalidResponse }
                let result = try await store.client.rpc("marriage_complete_social_onboarding", ["proof_hash": .string(NativeAuthRandom.hash(proof)), "device_hash": .string(NativeAuthRandom.hash("wudayn-device-v1:" + device)), "consent": consent])
                guard result["required"] == .bool(false) else { throw NativeProblem.invalidResponse }
                proof = ""; try await store.refresh()
                let privacy = NisfaynPrivacy.shared.status
                store.offerDeviceLock = !store.testing && privacy["available"] as? Bool == true && privacy["enabled"] as? Bool != true
            }.disabled(!agreed || !verified).accessibilityIdentifier("signup.create")
        }.navigationTitle("تأكيد الجوال")
            .scrollDismissesKeyboard(.interactively)
            .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("تم") { focused = false }.accessibilityIdentifier("signup.dismissKeyboard") } }
            .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
            .onChange(of: consent["sms"].bool) { allowed in if !allowed { proof = ""; code = ""; verified = false } }
    }
}
