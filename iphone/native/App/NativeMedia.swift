import SwiftUI
import PhotosUI
import AVFoundation
import WudaynCore

@MainActor final class NativeVoiceNote: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published var recording = false
    @Published var playing = false
    @Published var seconds = 0.0
    @Published var draft: Data?
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var file: URL?
    private var timer: Task<Void, Never>?
    private var interruption: NSObjectProtocol?
    override init() {
        super.init()
        interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] event in
            guard let raw = event.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            Task { @MainActor [weak self] in self?.discard() }
        }
    }
    deinit { if let interruption { NotificationCenter.default.removeObserver(interruption) }; timer?.cancel() }
    func start() async throws {
        guard !recording, !NisfaynCallCenter.shared.active else { throw NativeProblem.message("أنه المكالمة قبل تسجيل رسالة صوتية.") }
        let audio = AVAudioSession.sharedInstance()
        let granted = await withCheckedContinuation { continuation in audio.requestRecordPermission { continuation.resume(returning: $0) } }
        guard granted else { throw NativeProblem.message("اسمح باستخدام الميكروفون من إعدادات iPhone.") }
        guard UIApplication.shared.applicationState == .active else { return }
        discard()
        try audio.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        try audio.setActive(true)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
        file = url
        let recorder: AVAudioRecorder
        do { recorder = try AVAudioRecorder(url: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64000]) }
        catch { discard(); throw error }
        self.recorder = recorder
        guard recorder.record(forDuration: 60) else { discard(); throw NativeProblem.message("تعذّر بدء التسجيل.") }
        try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
        recording = true; seconds = 0
        timer = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 100_000_000) } catch { return }
                guard let self else { return }
                if UIApplication.shared.applicationState != .active { self.discard(); return }
                if self.recorder?.isRecording != true { try? self.stop(); return }
                self.seconds = self.recorder?.currentTime ?? 0
            }
        }
    }
    func stop() throws {
        guard let recorder, let file else { return }
        seconds = max(seconds, recorder.currentTime); recorder.stop(); timer?.cancel(); timer = nil
        recording = false; self.recorder = nil
        defer { try? FileManager.default.removeItem(at: file); self.file = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
        let data = try Data(contentsOf: file)
        guard seconds >= 0.3, data.count <= 8 * 1024 * 1024 else { throw NativeProblem.message("التسجيل قصير جدًا أو تجاوز الحجم المسموح.") }
        draft = data
    }
    func play(_ data: Data) throws {
        guard !NisfaynCallCenter.shared.active else { throw NativeProblem.message("أنه المكالمة قبل تشغيل التسجيل.") }
        player?.stop()
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.playback, mode: .spokenAudio); try audio.setActive(true)
        let next = try AVAudioPlayer(data: data); next.delegate = self; next.enableRate = true
        player = next; playing = next.play()
    }
    func pause() { player?.pause(); playing = false }
    func discard() {
        timer?.cancel(); timer = nil; recorder?.stop(); recorder = nil; recording = false
        player?.stop(); player = nil; playing = false; draft = nil; seconds = 0
        if let file { try? FileManager.default.removeItem(at: file) }; file = nil
        if !NisfaynCallCenter.shared.active { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { Task { @MainActor [weak self] in self?.playing = false } }
}

enum NativeImages {
    static func prepare(_ data: Data) throws -> Data {
        guard data.count <= 12 * 1024 * 1024, let image = UIImage(data: data), image.size.width > 0, image.size.height > 0 else { throw NativeProblem.message("اختر صورة صالحة لا تتجاوز ١٢ ميغابايت.") }
        let scale = min(1, 1600 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill(); context.fill(CGRect(origin: .zero, size: size)); image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = rendered.jpegData(compressionQuality: 0.86), jpeg.count <= 8 * 1024 * 1024 else { throw NativeProblem.message("تعذّر تجهيز الصورة.") }
        return jpeg
    }
}

struct NativeCamera: UIViewControllerRepresentable {
    let complete: (Data?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(complete) }
    func makeUIViewController(context: Context) -> UIViewController {
        guard UIImagePickerController.isSourceTypeAvailable(.camera), UIImagePickerController.isCameraDeviceAvailable(.front) else {
            DispatchQueue.main.async { complete(nil) }; return UIViewController()
        }
        let picker = UIImagePickerController(); picker.delegate = context.coordinator
        picker.sourceType = .camera; picker.cameraDevice = .front
        return picker
    }
    func updateUIViewController(_ controller: UIViewController, context: Context) {}
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let complete: (Data?) -> Void
        init(_ complete: @escaping (Data?) -> Void) { self.complete = complete }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { complete(nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) { complete((info[.originalImage] as? UIImage)?.jpegData(compressionQuality: 0.85)) }
    }
}

struct NativeImagePresentation: Identifiable { let id = UUID(); let image: UIImage; let once: Bool }
struct NativePhotoScreen: View {
    let photo: NativeImagePresentation
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        if photo.once { NativeSecurePhoto(image: photo.image, close: { dismiss() }).ignoresSafeArea() }
        else { ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            Image(uiImage: photo.image).resizable().scaledToFit().frame(maxWidth: .infinity, maxHeight: .infinity)
            Button("إغلاق") { dismiss() }.padding().foregroundStyle(.white)
        } }
    }
}
struct NativeSecurePhoto: UIViewControllerRepresentable {
    let image: UIImage
    let close: () -> Void
    func makeUIViewController(context: Context) -> UIViewController {
        let controller = PrivatePhotoController(image: image)
        controller.finished = close
        controller.loadViewIfNeeded()
        if !controller.protected { DispatchQueue.main.async(execute: close) }
        return controller
    }
    func updateUIViewController(_ controller: UIViewController, context: Context) {}
}
