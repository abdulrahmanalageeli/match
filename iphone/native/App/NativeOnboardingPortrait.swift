import SwiftUI
import PhotosUI
import CoreImage.CIFilterBuiltins
import WudaynCore

struct NativeOnboardingPortrait: View {
    @EnvironmentObject private var store: NativeStore
    @Binding var profile: JSONValue
    @State private var stage: JSONValue = .null
    @State private var selection: PhotosPickerItem?
    @State private var image: Data?
    @State private var selfie: Data?
    @State private var consent = false
    @State private var camera = false
    @State private var blur = 0.0
    @State private var policy = "never"
    @State private var moderation = false
    var body: some View {
        Form {
            Section("صورة ملفك") {
                Text("اختر صورة لك. تحفظ لقطة التحقق بشكل منفصل ولا تظهر للأعضاء. يمكنك طلب مراجعة الصورة إذا تعذرت المطابقة.")
                Toggle("أوافق على معالجة صورتي وعرضها وفق اختياراتي", isOn: $profile.field("signupConsents").flag("photo"))
                if let image, let ui = UIImage(data: image) { Image(uiImage: ui).resizable().scaledToFit().frame(height: 250) }
                else if !stage["portrait"]["path"].string.isEmpty { NativeStoredImage(bucket: "nisfayn-profile-portraits", path: stage["portrait"]["path"].string).frame(height: 250) }
                if stage.isNull {
                    PhotosPicker(selection: $selection, matching: .images) { Label("اختيار صورة", systemImage: "photo") }.disabled(!profile["signupConsents"]["photo"].bool)
                    if profile["gender"].string == "woman" { Slider(value: $blur, in: 0...100, step: 5); Text("درجة التمويه: \(Int(blur))٪"); Picker("إظهار النسخة الواضحة", selection: $policy) { Text("لا أشاركها").tag("never"); Text("بعد القبول").tag("matched"); Text("بعد اتفاق الجدية").tag("serious"); Text("بعد الاتفاق العائلي").tag("family") } }
                    NativeAction(title: "رفع الصورة للتحقق") { try await upload() }.disabled(image == nil || !profile["signupConsents"]["photo"].bool || !["man", "woman"].contains(profile["gender"].string))
                } else {
                    if ["verified", "approved", "ready"].contains(stage["status"].string) { Label("الصورة جاهزة لإرسال الملف", systemImage: "checkmark.shield") }
                    else if stage["status"].string == "moderation" { Text("أُرسلت للمراجعة. يمكنك متابعة إعداد ملفك.") }
                    else {
                        Toggle("أوافق على إرسال صورة الملف ولقطة وجهي إلى Authentica لمطابقة الوجه، وليس للتحقق من الهوية الوطنية", isOn: $consent)
                        Button("التقاط لقطة التحقق") { camera = true }.disabled(!consent)
                        NativeAction(title: "مطابقة الصورتين") {
                            guard let selfie, consent else { return }
                            let result = try await store.client.service(.verifyPhoto, body: .object(["photoId": stage["id"], "kind": .string("portrait"), "selfie": .string(selfie.base64EncodedString()), "consent": .string("face-photo-v1"), "staged": .bool(true)]))
                            guard result["matched"].bool else { throw NativeProblem.message("لم تتطابق الصورتان. يمكنك إعادة الالتقاط أو طلب المراجعة.") }
                            self.selfie = nil; stage = try await action("status")
                        }.disabled(selfie == nil || !consent)
                        Button("طلب مراجعة الصورة") { moderation = true }
                    }
                    NativeAction(title: "إزالة الصورة واختيار غيرها") {
                        _ = try await store.client.rpc("marriage_photo_discard", ["photo": stage["id"], "photo_kind": .string("portrait")]); stage = .null; image = nil; selfie = nil
                        var draft = profile.object; draft.removeValue(forKey: "_nativeStagedPortrait"); profile = .object(draft)
                    }
                }
            }
        }.navigationTitle("صورة التسجيل")
            .sheet(isPresented: $camera) { NativeCamera { selfie = $0; camera = false }.ignoresSafeArea() }
            .confirmationDialog("إرسال الصورة إلى فريق المراجعة؟", isPresented: $moderation, titleVisibility: .visible) { NativeAction(title: "أوافق على المراجعة") { stage = try await action("moderation") } }
            .task { await store.perform { stage = try await store.client.rpc("marriage_portrait_stage_resume"); if !stage.isNull { profile["_nativeStagedPortrait"] = stage["id"] } } }
            .onChange(of: selection) { value in Task { await store.perform { if let data = try await value?.loadTransferable(type: Data.self) { image = try NativeImages.prepare(data) } } } }
            .onDisappear { selfie = nil }
    }
    private func action(_ name: String) async throws -> JSONValue { try await store.client.rpc("marriage_portrait_stage_action", ["photo": stage["id"], "action": .string(name)]) }
    private func upload() async throws {
        guard let image else { return }
        let level = profile["gender"].string == "man" ? 0 : blur
        let prepared = try await store.client.rpc("marriage_portrait_stage_prepare", ["blur_level": .number(level), "policy": .string(level == 0 ? "never" : policy), "gender": profile["gender"], "photo_consent": .bool(true)])
        do {
            var data = image
            if level > 0 {
                guard let source = CIImage(data: image) else { throw NativeProblem.invalidResponse }
                let filter = CIFilter.gaussianBlur(); filter.inputImage = source.clampedToExtent(); filter.radius = Float(level * 0.6)
                guard let output = filter.outputImage, let cg = CIContext().createCGImage(output, from: source.extent), let jpeg = UIImage(cgImage: cg).jpegData(compressionQuality: 0.86) else { throw NativeProblem.invalidResponse }; data = jpeg
            }
            try await store.client.uploadPhoto(bucket: "nisfayn-profile-portraits", path: prepared["path"].string, data: data)
            if !prepared["clearPath"].string.isEmpty { try await store.client.uploadPhoto(bucket: "nisfayn-profile-portraits", path: prepared["clearPath"].string, data: image) }
            stage = try await store.client.rpc("marriage_portrait_stage_action", ["photo": prepared["id"], "action": .string("uploaded")])
            profile["_nativeStagedPortrait"] = stage["id"]
        } catch {
            _ = try? await store.client.rpc("marriage_photo_discard", ["photo": prepared["id"], "photo_kind": .string("portrait")]); throw error
        }
    }
}
