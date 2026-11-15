import SwiftUI
import WudaynCore

enum NativeCatalog {
    static let value: JSONValue = {
        guard let url = Bundle.main.url(forResource: "native-catalog", withExtension: "json"), let data = try? Data(contentsOf: url), let value = try? JSONValue.decode(data) else { return .null }
        return value
    }()
}
struct NativeOption: Identifiable {
    let id: String; let label: String
    static func values(_ value: JSONValue, label: String = "label") -> [NativeOption] {
        if !value.array.isEmpty { return value.array.map { item in
            if !item.string.isEmpty { return NativeOption(id: item.string, label: item.string) }
            return NativeOption(id: [item["id"].string, item["code"].string, item["value"].string].first { !$0.isEmpty } ?? "", label: item[label].string)
        } }
        return value.object.keys.sorted().map { NativeOption(id: $0, label: value[$0].string) }
    }
}
struct NativeChoice: View {
    let title: String
    @Binding var value: String
    let options: [NativeOption]
    var body: some View { Picker(title, selection: $value) { Text("اختر").tag(""); ForEach(options) { Text($0.label).tag($0.id) } }.pickerStyle(.navigationLink) }
}
extension Binding where Value == JSONValue {
    func field(_ key: String) -> Binding<JSONValue> { Binding<JSONValue>(get: { wrappedValue[key] }, set: { wrappedValue[key] = $0 }) }
    func text(_ key: String) -> Binding<String> { Binding<String>(get: { wrappedValue[key].string }, set: { wrappedValue[key] = .string($0) }) }
    func flag(_ key: String) -> Binding<Bool> { Binding<Bool>(get: { wrappedValue[key].bool }, set: { wrappedValue[key] = .bool($0) }) }
    func number(_ key: String) -> Binding<Int> { Binding<Int>(get: { Int(wrappedValue[key].number) }, set: { wrappedValue[key] = .number(Double($0)) }) }
    func contains(_ key: String, _ id: String) -> Binding<Bool> {
        Binding<Bool>(get: { wrappedValue[key].array.contains(.string(id)) }, set: { enabled in
            var values = wrappedValue[key].array.filter { $0 != .string(id) }; if enabled { values.append(.string(id)) }; wrappedValue[key] = .array(values)
        })
    }
}

struct NativeSignup: View {
    @EnvironmentObject private var store: NativeStore
    @State private var email = ""
    @State private var password = ""
    @State private var phone = ""
    @State private var code = ""
    @State private var proof = ""
    @State private var verified = false
    @State private var consent: JSONValue = .object(["version": .string("2026-11-07-privacy")])
    @State private var smsConsent = false
    @State private var sentAt: Date?
    @State private var created = false
    private var deviceID: String { "ios:" + NativeDevice.installationID }
    var body: some View {
        Form {
            Section("حسابك") {
                TextField("البريد الإلكتروني", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("كلمة المرور", text: $password).textContentType(.newPassword)
                TextField("رقم الجوال السعودي", text: $phone).textContentType(.telephoneNumber).keyboardType(.phonePad)
            }.disabled(verified)
            Section("بوضوح وبإذنك") {
                NavigationLink("الخصوصية وشروط الاستخدام", destination: NativeLegal())
                Toggle("أؤكد أن عمري ١٨ عامًا أو أكثر", isOn: $consent.flag("adult"))
                Toggle("أوافق على شروط الاستخدام", isOn: $consent.flag("terms"))
                Toggle("اطلعت على سياسة الخصوصية وأوافق عليها", isOn: $consent.flag("privacy"))
                Toggle("أوافق على التحقق بالجوال ومعرّف الجهاز", isOn: $smsConsent)
            }
            if !verified {
                NativeAction(title: "إرسال رمز التحقق") {
                    let normalized = try NativeDevice.normalizePhone(phone)
                    let value = try await store.client.service(.signupSMS, body: .object(["action": .string("send"), "email": .string(email), "phone": .string(normalized), "deviceId": .string(deviceID), "consent": .bool(true), "consentVersion": .string("signup-sms-device-v1")]))
                    proof = value["proof"].string; verified = value["verified"].bool; sentAt = Date()
                }.disabled(!smsConsent || email.isEmpty || password.count < 10 || password.utf8.count > 72 || (sentAt.map { Date().timeIntervalSince($0) < 60 } ?? false))
                if !proof.isEmpty {
                    TextField("رمز التحقق", text: $code).textContentType(.oneTimeCode).keyboardType(.numberPad)
                    NativeAction(title: "تأكيد الرمز") {
                        let value = try await store.client.service(.signupSMS, body: .object(["action": .string("verify"), "proof": .string(proof), "deviceId": .string(deviceID), "otp": .string(code.compactMap { $0.wholeNumberValue.map(String.init) }.joined())]))
                        guard value["verified"].bool else { throw NativeProblem.message("لم يكتمل التحقق.") }; verified = true
                    }
                }
            } else { Label("تم التحقق من الجوال", systemImage: "checkmark.shield") }
            NativeAction(title: "إنشاء الحساب") {
                let result = try await store.client.edge("member-signup", .object(["email": .string(email), "password": .string(password), "consent": consent, "phoneProof": .string(proof), "deviceId": .string(deviceID)]), authenticated: false)
                guard result["ok"].bool else { throw NativeProblem.invalidResponse }
                password = ""; code = ""; proof = ""; created = true
            }.disabled(!verified || !consent["adult"].bool || !consent["privacy"].bool || !consent["terms"].bool || created)
            if created { Text("أُنشئ الحساب. يمكنك الآن تسجيل الدخول.") }
        }.navigationTitle("إنشاء حساب")
            .onChange(of: email) { _ in proof = ""; verified = false }
            .onChange(of: phone) { _ in if !verified { proof = "" } }
    }
}

struct NativeProfileEditor: View {
    @EnvironmentObject private var store: NativeStore
    @State private var draft: JSONValue = .null
    @State private var birthday = Calendar.current.date(byAdding: .year, value: -25, to: Date())!
    @State private var saved = false
    private let profileOptions = NativeCatalog.value["profile"]
    var body: some View {
        Form {
            Section("الأساسيات") {
                TextField("الاسم", text: $draft.text("displayName")).textContentType(.name)
                NativeChoice(title: "الجنس", value: $draft.text("gender"), options: [.init(id: "man", label: "رجل"), .init(id: "woman", label: "امرأة")])
                DatePicker("تاريخ الميلاد", selection: $birthday, in: ...Calendar.current.date(byAdding: .year, value: -18, to: Date())!, displayedComponents: .date)
                NativeChoice(title: "المدينة", value: $draft.text("city"), options: NativeOption.values(profileOptions["cityOptions"]))
                NativeChoice(title: "المهنة", value: $draft.text("profession"), options: NativeOption.values(profileOptions["professionOptions"]))
                NativeChoice(title: "التعليم", value: $draft.text("education"), options: NativeOption.values(profileOptions["educationOptions"]))
                TextField("وسيلة التواصل الخاصة", text: $draft.text("contact")).textContentType(.telephoneNumber)
            }
            Section("حضور يعبّر عنك") {
                TextField("نبذة عني", text: $draft.text("bio"), axis: .vertical).lineLimit(3...6)
                TextField("ما أبحث عنه", text: $draft.text("lookingFor"), axis: .vertical).lineLimit(2...4)
                TextField("قيمي", text: $draft.text("valuesStatement"), axis: .vertical).lineLimit(2...4)
                TextField("حياتنا معًا", text: $draft.text("lifeTogether"), axis: .vertical).lineLimit(2...4)
                TextField("نيتي من الزواج", text: $draft.text("marriageIntent"), axis: .vertical)
                TextField("متى أشرك الأهل", text: $draft.text("familyPreference"))
            }
            Section("تفاصيلي وتفضيلاتي") {
                NavigationLink("تفاصيل الزواج والحياة", destination: NativeMarriageFields(value: $draft.field("marriageBasics")))
                if draft["signupConsents"]["sensitiveProfile"].bool { NavigationLink("التفاصيل الاختيارية", destination: NativeSensitiveDetails(value: $draft.field("marriageBasics"))) }
                NavigationLink("تفضيلات الشريك", destination: NativePartnerCriteria(profile: $draft))
                NativeMultiChoice(title: "اهتماماتي · حتى ٣", value: $draft, key: "interestIds", options: NativeOption.values(NativeCatalog.value["interests"]))
                Stepper("عمر الشريك من \(Int(draft["preferredMinAge"].number))", value: $draft.number("preferredMinAge"), in: 18...110)
                Stepper("عمر الشريك حتى \(Int(draft["preferredMaxAge"].number))", value: $draft.number("preferredMaxAge"), in: 18...110)
                NavigationLink("التوافق والتفضيلات", destination: NativeAssessment(profile: $draft))
                NavigationLink("بيننا · مواقف الحياة", destination: NativeBeena(profile: $draft))
            }
            Section("اختيارات الخصوصية") {
                Toggle("أوافق على تحليل إجاباتي للتوافق", isOn: $draft.field("signupConsents").flag("assessment"))
                Toggle("أوافق على معالجة التفاصيل الحساسة التي أختارها", isOn: $draft.field("signupConsents").flag("sensitiveProfile"))
                Toggle("أوافق على عرض تلك التفاصيل في ملفي", isOn: $draft.field("signupConsents").flag("sensitivePublication")).disabled(!draft["signupConsents"]["sensitiveProfile"].bool)
                Toggle("أؤكد بلوغي ١٨ عامًا", isOn: $draft.field("signupConsents").flag("adult"))
                Toggle("أوافق على الشروط", isOn: $draft.field("signupConsents").flag("terms"))
                Toggle("أوافق على سياسة الخصوصية", isOn: $draft.field("signupConsents").flag("privacy"))
                NavigationLink("قراءة السياسة", destination: NativeLegal())
            }
            NativeAction(title: "حفظ الملف والتفضيلات") {
                var value = draft
                guard value["interestIds"].array.count <= 3, value["priorityCategories"].array.count <= 2 else { throw NativeProblem.message("اختر حتى ٣ اهتمامات وأولويتين للتوافق.") }
                guard value["preferredMinAge"].number <= value["preferredMaxAge"].number else { throw NativeProblem.message("يجب أن يكون الحد الأدنى للعمر أصغر من الحد الأعلى أو مساويًا له.") }
                value["marriageBasics"] = .object(value["marriageBasics"].object.filter { $0.value != .string("") && !$0.value.isNull })
                if value["marriageBasics"]["maritalStatus"].string != "married" { var basics = value["marriageBasics"].object; basics.removeValue(forKey: "currentWives"); value["marriageBasics"] = .object(basics) }
                if value["marriageBasics"]["tribalBackground"].string != "tribal" { var basics = value["marriageBasics"].object; basics.removeValue(forKey: "tribeName"); value["marriageBasics"] = .object(basics) }
                for (key, rule) in value["partnerCriteria"].object {
                    if rule["mode"].string == "any" || rule["mode"].string.isEmpty { value["partnerCriteria"][key] = .object(["mode": .string("any")]) }
                }
                let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
                value["birthDate"] = .string(formatter.string(from: birthday))
                value["age"] = .number(Double(Calendar(identifier: .gregorian).dateComponents([.year], from: birthday, to: Date()).year ?? 0))
                value["signupConsents"]["version"] = .string("2026-11-07-privacy")
                if !value["signupConsents"]["sensitiveProfile"].bool {
                    var basics = value["marriageBasics"].object
                    for key in ["skinTone", "tribalBackground", "tribeName", "religiousAffiliation", "prayerPractice"] { basics.removeValue(forKey: key) }
                    value["marriageBasics"] = .object(basics)
                    var criteria = value["partnerCriteria"].object
                    for key in ["skinTone", "tribalBackground"] { criteria.removeValue(forKey: key) }
                    value["partnerCriteria"] = .object(criteria)
                    value["publicAvatar"] = .null; value["signupConsents"]["sensitivePublication"] = .bool(false)
                }
                if !value["signupConsents"]["assessment"].bool {
                    for key in ["surveyAnswers", "personalityAnswers", "partnerCriteria"] { value[key] = .object([:]) }
                    value["hardRequirements"] = .array([]); value["priorityCategories"] = .array([]); value["beena"] = .null
                }
                if !value["beena"].isNull {
                    value["beena"]["answers"] = .object(value["beena"]["answers"].object.mapValues { .object($0.object.filter { $0.value != .string("") }) })
                    if !value["beena"]["story"].isNull {
                        if value["beena"]["story"]["scenarioId"].string.isEmpty && value["beena"]["story"]["text"].string.isEmpty { var beena = value["beena"].object; beena.removeValue(forKey: "story"); value["beena"] = .object(beena) }
                        else {
                            guard !value["beena"]["story"]["scenarioId"].string.isEmpty, value["beena"]["story"]["text"].string.count <= 500 else { throw NativeProblem.message("اختر موقفًا للقصة واكتب حتى ٥٠٠ حرف.") }
                            value["beena"]["story"]["share"] = .bool(value["beena"]["story"]["share"].bool); value["beena"]["story"]["text"] = .string(value["beena"]["story"]["text"].string)
                        }
                    }
                }
                _ = try await store.client.rpc("marriage_apply", ["payload": value]); try await store.refresh(); saved = true
            }.disabled(draft.isNull)
            if saved { Label("حُفظ ملفك وتفضيلاتك", systemImage: "checkmark.circle") }
        }.navigationTitle("ملفي وتفضيلاتي").task {
            guard draft.isNull else { return }
            draft = store.profile.isNull ? .object(["preferredMinAge": .number(18), "preferredMaxAge": .number(40), "interestIds": .array([]), "surveyAnswers": .object([:]), "assessmentVersion": .string("marriage-v2"), "personalityVersion": .string("personality-v1"), "appearanceVersion": .string("appearance-v1")]) : store.profile
            let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
            if let date = formatter.date(from: draft["birthDate"].string) { birthday = date }
        }
    }
}

struct NativeMarriageFields: View {
    @Binding var value: JSONValue
    private let options = NativeCatalog.value["marriage"]
    var body: some View { Form {
        Section("تفاصيل الحياة") {
            TextField("الطول بالسنتيمتر", value: $value.number("heightCm"), format: .number).keyboardType(.numberPad)
            TextField("الوزن بالكيلوغرام", value: $value.number("weightKg"), format: .number).keyboardType(.numberPad)
            TextField("الجنسية", text: $value.text("nationality"))
            Stepper("عدد الأبناء: \(Int(value["childrenCount"].number))", value: $value.number("childrenCount"), in: 0...20)
            NativeChoice(title: "الحالة الاجتماعية", value: $value.text("maritalStatus"), options: [.init(id: "never_married", label: "لم يسبق لي الزواج"), .init(id: "divorced", label: "مطلق/ة"), .init(id: "widowed", label: "أرمل/ة"), .init(id: "married", label: "متزوج")])
            if value["maritalStatus"].string == "married" { Stepper("عدد الزوجات: \(Int(value["currentWives"].number))", value: $value.number("currentWives"), in: 1...4) }
            NativeChoice(title: "التدخين", value: $value.text("smoking"), options: [.init(id: "never", label: "لا أدخن"), .init(id: "sometimes", label: "أحيانًا"), .init(id: "cigarettes", label: "سجائر"), .init(id: "vape", label: "إلكتروني"), .init(id: "shisha", label: "شيشة"), .init(id: "yes", label: "نعم")])
        }
        Section("الخطوة القادمة") {
            NativeChoice(title: "أسلوب اللباس", value: $value.text("dressStyle"), options: NativeOption.values(NativeCatalog.value["appearance"]["dressStyles"]))
            NativeChoice(title: "مرونة اللباس", value: $value.text("dressFlexibility"), options: NativeOption.values(NativeCatalog.value["appearance"]["dressFlexibilities"]))
            NativeChoice(title: "موعد الزواج", value: $value.text("marriageTimeline"), options: NativeOption.values(options["marriageTimelineLabels"]))
            NativeChoice(title: "التعارف واللقاء", value: $value.text("meetingPreference"), options: NativeOption.values(options["meetingPreferenceLabels"]))
            NativeChoice(title: "التعدد", value: $value.text("polygynyPreference"), options: NativeOption.values(options["polygynyLabels"]))
        }
        Section("اللغات") {
            ForEach(NativeOption.values(options["languageOptions"])) { item in Toggle(item.label, isOn: $value.contains("spokenLanguages", item.id)) }
            NativeChoice(title: "اللغة المفضلة", value: $value.text("preferredLanguage"), options: NativeOption.values(options["languageOptions"]))
            NativeChoice(title: "الانفتاح اللغوي", value: $value.text("languageOpenness"), options: NativeOption.values(options["languageOpennessLabels"]))
        }
    }.navigationTitle("تفاصيل الزواج والحياة") }
}

struct NativeAssessment: View {
    @Binding var profile: JSONValue
    var body: some View { List {
        Section("أولوياتي · حتى أولويتين") { ForEach(NativeCatalog.value["catalog"]["categories"].rows) { row in Toggle(row.value["label"].string, isOn: $profile.contains("priorityCategories", row.id)).disabled(profile["priorityCategories"].array.count >= 2 && !profile["priorityCategories"].array.contains(.string(row.id))) } }
        ForEach(NativeCatalog.value["catalog"]["dimensions"].array, id: \.["id"].string) { dimension in
            Section(dimension["title"].string) {
                NativeChoice(title: dimension["selfPrompt"].string, value: $profile.field("surveyAnswers").text(dimension["id"].string), options: NativeOption.values(dimension["options"], label: "self"))
                NativeChoice(title: dimension["partnerPrompt"].string, value: $profile.field("surveyAnswers").text(dimension["partnerId"].string), options: NativeOption.values(dimension["options"], label: "partner"))
                if dimension["hardAllowed"].bool { Toggle("شرط أساسي", isOn: $profile.contains("hardRequirements", dimension["id"].string)) }
            }
        }
        Section("شخصيتي") {
            ForEach(NativeCatalog.value["personality"].array, id: \.["id"].string) { item in
                NativeChoice(title: item["prompt"].string, value: $profile.field("personalityAnswers").text(item["id"].string), options: [.init(id: "A", label: "لا يشبهني إطلاقًا"), .init(id: "B", label: "يشبهني قليلًا"), .init(id: "C", label: "يشبهني أحيانًا"), .init(id: "D", label: "يشبهني غالبًا"), .init(id: "E", label: "يشبهني كثيرًا")])
            }
        }
    }.navigationTitle("التوافق والتفضيلات").onAppear { profile["assessmentVersion"] = .string("marriage-v2"); profile["personalityVersion"] = .string("personality-v1") } }
}

struct NativeBeena: View {
    @Binding var profile: JSONValue
    var body: some View { List {
        Section("موقف أود مشاركته") {
            NativeChoice(title: "الموقف", value: $profile.field("beena").field("story").text("scenarioId"), options: NativeOption.values(NativeCatalog.value["beena"]["beenaScenarios"], label: "title"))
            TextField("قصتي · حتى ٥٠٠ حرف", text: $profile.field("beena").field("story").text("text"), axis: .vertical).lineLimit(3...8)
            Toggle("أوافق على عرض هذه القصة في ملفي", isOn: $profile.field("beena").field("story").flag("share"))
        }
        ForEach(NativeCatalog.value["beena"]["beenaScenarios"].array, id: \.["id"].string) { scenario in
            Section(scenario["title"].string) {
                Text(scenario["scene"].string).foregroundStyle(.secondary)
                NativeChoice(title: "ما يشبهني", value: $profile.field("beena").field("answers").field(scenario["id"].string).text("self"), options: NativeOption.values(scenario["options"]))
                ForEach(NativeOption.values(scenario["options"])) { choice in Toggle(choice.label, isOn: $profile.field("beena").field("answers").field(scenario["id"].string).contains("partner", choice.id)) }
                Stepper("الأهمية", value: $profile.field("beena").field("answers").field(scenario["id"].string).number("importance"), in: 1...2)
            }
        }
    }.navigationTitle("بيننا · مواقف الحياة").onAppear { profile["beena"]["version"] = .string("beena-v1") } }
}

struct NativeLegal: View {
    private var text: String { guard let url = Bundle.main.url(forResource: "privacy-ar", withExtension: "txt") else { return "تعذّر تحميل سياسة الخصوصية." }; return (try? String(contentsOf: url, encoding: .utf8)) ?? "تعذّر تحميل سياسة الخصوصية." }
    var body: some View { ScrollView { Text(text).frame(maxWidth: .infinity, alignment: .leading).padding().textSelection(.enabled) }.navigationTitle("الخصوصية وشروط الاستخدام").navigationBarTitleDisplayMode(.inline) }
}
