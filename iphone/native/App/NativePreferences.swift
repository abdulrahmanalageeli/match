import SwiftUI
import WudaynCore

enum NativeProfileOptions {
    static let marital = [NativeOption(id: "never_married", label: "لم يسبق له الزواج"), NativeOption(id: "divorced", label: "مطلق/ة"), NativeOption(id: "widowed", label: "أرمل/ة"), NativeOption(id: "married", label: "متزوج")]
    static let tribal = [NativeOption(id: "tribal", label: "قبيلي"), NativeOption(id: "non_tribal", label: "غير قبيلي"), NativeOption(id: "prefer_not_to_say", label: "أفضل عدم الإفصاح")]
    static let smoking = [NativeOption(id: "never", label: "لا يدخن"), NativeOption(id: "cigarettes", label: "سجائر"), NativeOption(id: "vape", label: "إلكتروني"), NativeOption(id: "shisha", label: "شيشة"), NativeOption(id: "sometimes", label: "أحيانًا"), NativeOption(id: "yes", label: "يدخن")]
}
struct NativeMultiChoice: View {
    let title: String
    @Binding var value: JSONValue
    let key: String
    let options: [NativeOption]
    var body: some View { NavigationLink { List { ForEach(options) { option in Toggle(option.label, isOn: $value.contains(key, option.id)) } }.navigationTitle(title) } label: { LabeledContent(title, value: "\(value[key].array.count)") } }
}
struct NativePartnerCriteria: View {
    @Binding var profile: JSONValue
    private var options: JSONValue { NativeCatalog.value["profile"] }
    var body: some View {
        Form {
            Text("الشرط الأساسي يستبعد من لا يحققه. التفضيل يؤثر في التقارب دون استبعاد.").foregroundStyle(.secondary)
            range("الطول", key: "height", lower: 120, upper: 230)
            range("الوزن", key: "weight", lower: 35, upper: 250)
            multiselect("الجنسية", key: "nationality", values: NativeOption.values(options["nationalityChoices"]))
            Toggle("استبعاد الجنسيات المحددة", isOn: $profile.field("partnerCriteria").field("nationality").flag("exclude"))
            multiselect("التعليم", key: "education", values: NativeOption.values(options["educationOptions"]))
            multiselect("المهنة", key: "profession", values: NativeOption.values(options["professionOptions"]))
            multiselect("الحالة الاجتماعية", key: "maritalStatus", values: NativeProfileOptions.marital)
            Section("اللغة") { mode("sharedLanguage") }
            Section("الأبناء") { mode("children"); NativeChoice(title: "التفضيل", value: $profile.field("partnerCriteria").field("children").text("target"), options: [.init(id: "none", label: "بدون أبناء"), .init(id: "any", label: "لا فرق")]) }
            Section("التدخين") { mode("smoking"); NativeChoice(title: "التفضيل", value: $profile.field("partnerCriteria").field("smoking").text("target"), options: [.init(id: "never", label: "لا يدخن")]) }
            if profile["signupConsents"]["sensitiveProfile"].bool {
                Section("الخلفية القبلية") { mode("tribalBackground"); NativeChoice(title: "التفضيل", value: $profile.field("partnerCriteria").field("tribalBackground").text("target"), options: Array(NativeProfileOptions.tribal.prefix(2)) + [.init(id: "same_tribe", label: "من القبيلة نفسها")]) }
                multiselect("لون البشرة", key: "skinTone", values: NativeOption.values(NativeCatalog.value["appearance"]["skinTones"]))
            }
            multiselect("أسلوب اللباس", key: "dressStyle", values: NativeOption.values(NativeCatalog.value["appearance"]["dressStyles"]))
            Section("مرونة اللباس") { mode("dressFlexibility"); NativeChoice(title: "التفضيل", value: $profile.field("partnerCriteria").field("dressFlexibility").text("target"), options: NativeOption.values(NativeCatalog.value["appearance"]["dressFlexibilities"]).filter { ["open_to_discussion", "open_to_change"].contains($0.id) }) }
        }.navigationTitle("تفضيلات الشريك").onAppear {
            for key in ["height", "weight", "nationality", "education", "profession", "maritalStatus", "sharedLanguage", "children", "smoking", "dressStyle", "dressFlexibility"] {
                if profile["partnerCriteria"][key]["mode"].string.isEmpty { profile["partnerCriteria"][key]["mode"] = .string("any") }
            }
            if profile["signupConsents"]["sensitiveProfile"].bool { for key in ["tribalBackground", "skinTone"] { if profile["partnerCriteria"][key]["mode"].string.isEmpty { profile["partnerCriteria"][key]["mode"] = .string("any") } } }
        }
    }
    private func mode(_ key: String) -> some View { NativeChoice(title: "الأهمية", value: $profile.field("partnerCriteria").field(key).text("mode"), options: NativeOption.values(NativeCatalog.value["marriage"]["criteriaModes"])) }
    private func multiselect(_ title: String, key: String, values: [NativeOption]) -> some View { Section(title) { mode(key); NativeMultiChoice(title: "الاختيارات", value: $profile.field("partnerCriteria").field(key), key: "values", options: values) } }
    private func range(_ title: String, key: String, lower: Int, upper: Int) -> some View { Section(title) { mode(key); TextField("من", value: $profile.field("partnerCriteria").field(key).optionalNumber("min"), format: .number).keyboardType(.numberPad); TextField("حتى", value: $profile.field("partnerCriteria").field(key).optionalNumber("max"), format: .number).keyboardType(.numberPad) } }
}
struct NativeSensitiveDetails: View {
    @Binding var value: JSONValue
    var body: some View {
        Form {
            NativeChoice(title: "الخلفية القبلية", value: $value.text("tribalBackground"), options: NativeProfileOptions.tribal)
            if value["tribalBackground"].string == "tribal" { TextField("القبيلة", text: $value.text("tribeName")) }
            NativeChoice(title: "لون البشرة", value: $value.text("skinTone"), options: NativeOption.values(NativeCatalog.value["appearance"]["skinTones"]))
            NativeChoice(title: "المذهب", value: $value.text("religiousAffiliation"), options: NativeOption.values(NativeCatalog.value["marriage"]["religiousAffiliationLabels"]))
            NativeChoice(title: "الصلاة", value: $value.text("prayerPractice"), options: NativeOption.values(NativeCatalog.value["marriage"]["prayerPracticeLabels"]))
        }.navigationTitle("التفاصيل الاختيارية")
    }
}
struct NativeDiscoveryFilters: View {
    @Binding var value: JSONValue
    private var profile: JSONValue { NativeCatalog.value["profile"] }
    var body: some View {
        Form {
            Section("البحث") {
                NativeChoice(title: "الترتيب", value: $value.text("sort"), options: [.init(id: "compatibility", label: "التوافق"), .init(id: "youngest", label: "الأصغر"), .init(id: "oldest", label: "الأكبر")])
                NativeChoice(title: "العرض", value: $value.text("mode"), options: [.init(id: "recommended", label: "الموصى بهم"), .init(id: "all", label: "الكل")])
                TextField("من عمر", value: $value.optionalNumber("minAge"), format: .number).keyboardType(.numberPad)
                TextField("حتى عمر", value: $value.optionalNumber("maxAge"), format: .number).keyboardType(.numberPad)
                NativeChoice(title: "المدينة", value: $value.text("city"), options: NativeOption.values(profile["cityOptions"]))
                NativeChoice(title: "الجنسية", value: $value.text("nationality"), options: NativeOption.values(profile["nationalityChoices"]))
                NativeChoice(title: "اللغة", value: $value.text("language"), options: NativeOption.values(NativeCatalog.value["marriage"]["languageOptions"]))
                Toggle("المتاحون للتعارف فقط", isOn: $value.flag("availableOnly"))
                Toggle("المتصلون فقط", isOn: $value.flag("onlineOnly"))
            }
            Section("تفاصيل الحياة") {
                NativeChoice(title: "التعليم", value: $value.text("education"), options: NativeOption.values(profile["educationOptions"]))
                NativeChoice(title: "المهنة", value: $value.text("profession"), options: NativeOption.values(profile["professionOptions"]))
                NativeChoice(title: "الحالة الاجتماعية", value: $value.text("maritalStatus"), options: NativeProfileOptions.marital)
                NativeChoice(title: "التدخين", value: $value.text("smoking"), options: NativeProfileOptions.smoking)
                NativeChoice(title: "الأبناء", value: $value.text("children"), options: [.init(id: "none", label: "بدون أبناء"), .init(id: "has", label: "لديه أبناء")])
                NativeChoice(title: "الخلفية القبلية", value: $value.text("tribalBackground"), options: NativeProfileOptions.tribal)
                TextField("أقل طول", value: $value.optionalNumber("minHeight"), format: .number).keyboardType(.numberPad)
                TextField("أعلى طول", value: $value.optionalNumber("maxHeight"), format: .number).keyboardType(.numberPad)
                TextField("أقل وزن", value: $value.optionalNumber("minWeight"), format: .number).keyboardType(.numberPad)
                TextField("أعلى وزن", value: $value.optionalNumber("maxWeight"), format: .number).keyboardType(.numberPad)
            }
            Section("الاستبعادات") {
                NativeMultiChoice(title: "مدن", value: $value, key: "excludeCities", options: NativeOption.values(profile["cityOptions"]))
                NativeMultiChoice(title: "جنسيات", value: $value, key: "excludeNationalities", options: NativeOption.values(profile["nationalityChoices"]))
                NativeMultiChoice(title: "الحالة الاجتماعية", value: $value, key: "excludeMaritalStatuses", options: NativeProfileOptions.marital)
                NativeMultiChoice(title: "التدخين", value: $value, key: "excludeSmoking", options: NativeProfileOptions.smoking)
                NativeMultiChoice(title: "الخلفية القبلية", value: $value, key: "excludeTribalBackgrounds", options: NativeProfileOptions.tribal)
            }
            Button("مسح الاختيارات") { value = .object(["mode": .string("all")]) }
        }.navigationTitle("تفضيلات البحث")
    }
}
