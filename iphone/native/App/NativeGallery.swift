import SwiftUI
import PhotosUI
import CoreImage.CIFilterBuiltins
import WudaynCore

struct NativeGallery: View {
    @EnvironmentObject private var store: NativeStore
    @State private var mode = "gallery"
    @State private var rows: [MemberRow] = []
    @State private var selected: PhotosPickerItem?
    @State private var draft: Data?
    @State private var selfie: Data?
    @State private var faceRequired = false
    @State private var faceConsent = false
    @State private var camera = false
    @State private var blur = 0.0
    @State private var policy = "never"
    @State private var error: String?
    @State private var remove: MemberRow?
    var body: some View { Form {
        Picker("الصور", selection: $mode) { Text("معرض الملف").tag("gallery"); Text("صورة الملف").tag("portrait"); Text("صورتي الخاصة").tag("private") }.pickerStyle(.segmented)
        ForEach(rows) { row in HStack {
            NativeStoredImage(bucket: bucket, path: row.value["path"].string).frame(height: 160)
            Button("حذف", role: .destructive) { remove = row }
        } }
        PhotosPicker(selection: $selected, matching: .images, photoLibrary: .shared()) { Label("اختيار صورة", systemImage: "photo.badge.plus") }.disabled(store.busy)
        if let draft, let image = UIImage(data: draft) {
            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 260)
            if mode == "portrait" {
                Slider(value: $blur, in: 0...100, step: 5) { Text("درجة التمويه") }
                Text("التمويه: \(Int(blur))٪")
                Picker("إظهار النسخة الواضحة", selection: $policy) { Text("لا أشاركها").tag("never"); Text("بعد القبول المتبادل").tag("matched"); Text("بعد اتفاق الجدية").tag("serious"); Text("عند التواصل العائلي").tag("family") }
            }
            if faceRequired && mode != "private" {
                Toggle("أوافق على إرسال صورة الملف ولقطة وجهي إلى Authentica لمطابقة الوجه. اللقطة لا تظهر للأعضاء، وهذه المطابقة ليست توثيقًا للهوية الوطنية.", isOn: $faceConsent)
                Button(selfie == nil ? "التقاط صورة للتحقق" : "إعادة التقاط صورة التحقق") {
                    guard UIImagePickerController.isSourceTypeAvailable(.camera), UIImagePickerController.isCameraDeviceAvailable(.front) else { error = "الكاميرا الأمامية غير متاحة."; return }
                    camera = true
                }.disabled(!faceConsent)
                if selfie != nil { Label("لقطة التحقق جاهزة", systemImage: "checkmark.circle") }
            }
            NativeAction(title: "حفظ الصورة") { try await upload(draft) }.disabled(faceRequired && mode != "private" && (!faceConsent || selfie == nil))
            Button("تراجع") { self.draft = nil; selfie = nil; selected = nil }
        }
    }.navigationTitle("صوري").nativeError($error)
        .task(id: mode) { draft = nil; selfie = nil; selected = nil; faceConsent = false; await load() }
        .onChange(of: selected) { item in let requestedMode = mode; Task {
            do { if let data = try await item?.loadTransferable(type: Data.self) {
                let required = try await store.client.rpc("marriage_photo_face_required").bool
                guard requestedMode == mode, selected == item else { return }
                draft = try NativeImages.prepare(data); selfie = nil; faceRequired = required
            } }
            catch { self.error = error.localizedDescription }
        } }
        .sheet(isPresented: $camera) { NativeCamera { data in selfie = data; camera = false }.ignoresSafeArea() }
        .confirmationDialog("حذف الصورة؟", isPresented: Binding(get: { remove != nil }, set: { if !$0 { remove = nil } }), titleVisibility: .visible) {
            NativeAction(title: "حذف الصورة") {
                guard let row = remove else { return }
                if mode == "gallery" { _ = try await store.client.rpc("marriage_gallery", ["action": .string("remove"), "photo_id": .string(row.id)]) }
                else { _ = try await store.client.rpc(mode == "portrait" ? "marriage_portrait_remove" : "marriage_photo_remove") }
                remove = nil; await load()
            }
        }
    }
    private var bucket: String { mode == "gallery" ? "nisfayn-profile-gallery" : mode == "portrait" ? "nisfayn-profile-portraits" : "nisfayn-private-photos" }
    private func load() async {
        do {
            if mode == "gallery" { rows = try await store.client.rpc("marriage_gallery", ["action": .string("list"), "subject": .null]).rows }
            else if mode == "portrait" { let value = try await store.client.rpc("marriage_portrait_info", ["subject": .null]); rows = value.isNull ? [] : [MemberRow(value)] }
            else { let value = try await store.client.rpc("marriage_photo_state", ["request_id": .null])["mine"]; rows = value.isNull ? [] : [MemberRow(value)] }
        } catch { self.error = error.localizedDescription }
    }
    private func upload(_ data: Data) async throws {
        var prepared: JSONValue
        if mode == "gallery" { prepared = try await store.client.rpc("marriage_gallery", ["action": .string("prepare")]) }
        else if mode == "portrait" { prepared = try await store.client.rpc("marriage_portrait_prepare_v2", ["blur_level": .number(blur), "reveal_policy": .string(blur == 0 ? "never" : policy)]) }
        else { prepared = try await store.client.rpc("marriage_photo_prepare") }
        var publicData = data
        if mode == "portrait", blur > 0 {
            guard let input = CIImage(data: data) else { throw NativeProblem.invalidResponse }
            let filter = CIFilter.gaussianBlur(); filter.inputImage = input.clampedToExtent(); filter.radius = Float(blur * 0.6)
            guard let output = filter.outputImage, let rendered = CIContext().createCGImage(output, from: input.extent), let jpeg = UIImage(cgImage: rendered).jpegData(compressionQuality: 0.86) else { throw NativeProblem.invalidResponse }
            publicData = jpeg
        }
        try await store.client.uploadPhoto(bucket: bucket, path: prepared["path"].string, data: publicData)
        if !prepared["clearPath"].string.isEmpty { try await store.client.uploadPhoto(bucket: bucket, path: prepared["clearPath"].string, data: data) }
        if faceRequired && mode != "private" {
            guard faceConsent, let selfie else { throw NativeProblem.message("أكمل التحقق من الصورة أولًا.") }
            let result = try await store.client.service(.verifyPhoto, body: .object(["photoId": prepared["id"], "kind": .string(mode), "selfie": .string(selfie.base64EncodedString()), "consent": .string("face-photo-v1"), "staged": .bool(false)]))
            guard result["matched"].bool else { throw NativeProblem.message("لم تتطابق الصورتان. اختر صورة واضحة وأعد المحاولة.") }
        }
        if mode == "gallery" { _ = try await store.client.rpc("marriage_gallery", ["action": .string("commit"), "photo_id": prepared["id"]]) }
        else { _ = try await store.client.rpc(mode == "portrait" ? "marriage_portrait_commit" : "marriage_photo_commit", ["photo_id": prepared["id"]]) }
        draft = nil; selfie = nil; selected = nil; await load(); try await store.refresh()
    }
}

struct NativeStoredImage: View {
    @EnvironmentObject private var store: NativeStore
    let bucket: String
    let path: String
    @State private var image: UIImage?
    var body: some View { Group { if let image { Image(uiImage: image).resizable().scaledToFit() } else { Image(systemName: "photo").foregroundStyle(.secondary) } }.task(id: path) { image = nil; guard !path.isEmpty else { return }; do { let data = try await store.client.download(bucket: bucket, path: path); try Task.checkCancellation(); image = UIImage(data: data) } catch {} }.onDisappear { image = nil } }
}
