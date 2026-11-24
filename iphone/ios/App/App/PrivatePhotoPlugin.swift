import Capacitor
import UIKit

// iOS has no public screenshot-prevention flag for arbitrary images. The secure
// text canvas excludes its contents from system capture on supported iOS builds.
// This is an undocumented UIKit layout detail: fail closed if it changes, and
// verify screenshots on devices for every supported OS before releasing.
final class PhotoSecureField: UITextField {
    weak var interactiveContent: UIView?
    override var canBecomeFirstResponder: Bool { false }
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        if let interactiveContent, bounds.contains(point) {
            return interactiveContent.hitTest(convert(point, to: interactiveContent), with: event)
        }
        return super.hitTest(point, with: event)
    }
    override func textRect(forBounds bounds: CGRect) -> CGRect { bounds }
    override func editingRect(forBounds bounds: CGRect) -> CGRect { bounds }
    override func layoutSubviews() {
        super.layoutSubviews()
        // A text field normally sizes its canvas for one line of text.
        secureCanvas?.frame = bounds
    }
    private var secureCanvas: UIView? {
        subviews.first { String(describing: type(of: $0)).contains("CanvasView") }
    }
    func canvas() -> UIView? {
        layoutIfNeeded()
        return secureCanvas
    }
}

@objc(PrivatePhotoPlugin)
final class PrivatePhotoPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PrivatePhotoPlugin"
    let jsName = "PrivatePhoto"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise)
    ]
    private var photo: PrivatePhotoController?
    private func allowed() -> Bool {
        NisfaynPrivacy.shared.mayOpen && !(bridge?.viewController?.view.window?.screen.isCaptured ?? true)
    }
    @objc func available(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let probe = PhotoSecureField(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
            probe.isSecureTextEntry = true
            probe.text = " "
            call.resolve(["available": self.allowed() && probe.canvas() != nil])
        }
    }
    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.allowed(), self.photo == nil,
                  let parent = self.bridge?.viewController, parent.presentedViewController == nil,
                  let encoded = call.getString("data"), encoded.count <= 12 * 1024 * 1024,
                  let data = Data(base64Encoded: encoded), data.count <= 8 * 1024 * 1024,
                  let image = UIImage(data: data) else {
                call.reject("تعذّر عرض الصورة بأمان. أوقف تسجيل الشاشة أو مشاركتها."); return
            }
            let controller = PrivatePhotoController(image: image)
            controller.loadViewIfNeeded()
            guard controller.protected else { call.reject("عرض الصور المحمية غير متاح على هذا الإصدار."); return }
            controller.finished = { [weak self] displayed in self?.photo = nil; call.resolve(["displayed": displayed]) }
            self.photo = controller
            parent.present(controller, animated: false)
        }
    }
    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.photo?.finish(); call.resolve() }
    }
}

private final class PrivatePhotoController: UIViewController {
    private var image: UIImage?
    private let picture = UIImageView()
    private var observers: [NSObjectProtocol] = []
    private var ended = false
    private(set) var protected = false
    private var displayed = false
    var finished: ((Bool) -> Void)?
    init(image: UIImage) {
        self.image = image
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
        isModalInPresentation = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad()
        let note = WudaynPrivacyNote(frame: view.bounds)
        note.setArtwork(for: .profile)
        note.accessibilityViewIsModal = false
        note.accessibilityElementsHidden = true
        note.isUserInteractionEnabled = false
        view.addSubview(note)
        let field = PhotoSecureField(frame: view.bounds)
        field.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        field.isSecureTextEntry = true; field.text = " "
        field.backgroundColor = .clear; field.textColor = .clear; field.tintColor = .clear
        field.isUserInteractionEnabled = false; field.isAccessibilityElement = false
        view.addSubview(field)
        guard let canvas = field.canvas() else { image = nil; return }
        picture.frame = canvas.bounds; picture.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        picture.backgroundColor = .black
        picture.contentMode = .scaleAspectFit; picture.image = image; image = nil
        picture.accessibilityLabel = "صورة لمرة واحدة"; picture.isAccessibilityElement = true
        canvas.addSubview(picture); protected = true
        let close = UIButton(type: .system)
        close.setTitle("إغلاق الصورة", for: .normal); close.tintColor = .white
        close.backgroundColor = .black
        close.layer.cornerRadius = 12
        close.titleLabel?.font = .preferredFont(forTextStyle: .body)
        close.titleLabel?.adjustsFontForContentSizeCategory = true
        close.titleLabel?.numberOfLines = 0
        close.translatesAutoresizingMaskIntoConstraints = false
        close.addTarget(self, action: #selector(finish), for: .touchUpInside)
        view.addSubview(close)
        // The footer remains visible even on iOS versions that replace protected
        // layers with black instead of compositing the art underneath.
        let footer = UILabel()
        footer.text = "وُدَين  ·  صورة خاصة"
        footer.font = .preferredFont(forTextStyle: .footnote)
        footer.adjustsFontForContentSizeCategory = true
        footer.textColor = .white
        footer.textAlignment = .center
        footer.backgroundColor = UIColor(red: 0.267, green: 0.075, blue: 0.153, alpha: 1)
        footer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(footer)
        field.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            footer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            footer.heightAnchor.constraint(greaterThanOrEqualToConstant: 32),
            field.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            field.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            field.topAnchor.constraint(equalTo: view.topAnchor),
            field.bottomAnchor.constraint(equalTo: footer.topAnchor),
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            close.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            close.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            close.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            close.widthAnchor.constraint(greaterThanOrEqualToConstant: 120)
        ])
        for event in [UIApplication.willResignActiveNotification, UIScreen.capturedDidChangeNotification, UIApplication.userDidTakeScreenshotNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: event, object: nil, queue: .main) { [weak self] _ in self?.finish() })
        }
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !ended, protected, NisfaynPrivacy.shared.mayOpen, view.window?.screen.isCaptured == false, picture.image != nil else { finish(); return }
        displayed = true
    }
    @objc func finish() {
        guard !ended else { return }; ended = true
        // Clear synchronously before dismissal, background snapshots or recording.
        picture.image = nil; image = nil; picture.isHidden = true
        let completion = finished, wasDisplayed = displayed
        finished = nil
        dismiss(animated: false) { completion?(wasDisplayed) }
    }
    deinit { observers.forEach { NotificationCenter.default.removeObserver($0) } }
}
