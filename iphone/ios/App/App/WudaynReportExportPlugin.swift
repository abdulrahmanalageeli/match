import Capacitor
import UIKit

/// Local-only export. The web client revalidates the shared projection immediately before calling.
@objc(WudaynReportExportPlugin)
final class WudaynReportExportPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    let identifier = "WudaynReportExportPlugin"
    let jsName = "WudaynReportExport"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)]
    private var pending: CAPPluginCall?
    private var temporaryFile: URL?

    @objc func save(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pending == nil, NisfaynPrivacy.shared.mayOpen,
                  let controller = self.bridge?.viewController, controller.presentedViewController == nil else {
                call.reject("افتح وُدَين وأغلق أي نافذة مشاركة أولًا."); return
            }
            guard let html = call.getString("html"), !html.isEmpty, html.utf8.count < 500_000 else {
                call.reject("تعذّر تجهيز نسخة التقرير."); return
            }
            let renderer = WudaynReportPages()
            renderer.addPrintFormatter(UIMarkupTextPrintFormatter(markupText: html), startingAtPageAt: 0)
            let pages = renderer.numberOfPages
            guard pages > 0, pages <= 60 else { call.reject("تعذّر تنسيق التقرير للحفظ."); return }
            renderer.prepare(forDrawingPages: NSRange(location: 0, length: pages))
            let pdf = UIGraphicsPDFRenderer(bounds: renderer.paperRect).pdfData { context in
                for page in 0..<pages {
                    context.beginPage()
                    renderer.drawPage(at: page, in: renderer.paperRect)
                }
            }
            do {
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent("wudayn-report-export", isDirectory: true)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                // Remove only this exporter's abandoned temporary PDFs (e.g. after a process exit).
                for old in (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? [] where old.pathExtension == "pdf" {
                    try? FileManager.default.removeItem(at: old)
                }
                let file = folder.appendingPathComponent("Wudayn-Deep-Analysis.pdf")
                try pdf.write(to: file, options: [.atomic, .completeFileProtection])
                self.temporaryFile = file; self.pending = call
                let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                picker.delegate = self
                controller.present(picker, animated: true)
            } catch { self.finish(error: "تعذّر حفظ التقرير على جهازك.", fallback: call) }
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finish() }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish() }

    private func finish(error: String? = nil, fallback: CAPPluginCall? = nil) {
        let call = pending ?? fallback
        if let file = temporaryFile { try? FileManager.default.removeItem(at: file) }
        pending = nil; temporaryFile = nil
        if let error { call?.reject(error) } else { call?.resolve() }
    }
}

private final class WudaynReportPages: UIPrintPageRenderer {
    override var paperRect: CGRect { CGRect(x: 0, y: 0, width: 595, height: 842) }
    override var printableRect: CGRect { paperRect.insetBy(dx: 36, dy: 36) }
    override init() { super.init(); headerHeight = 30; footerHeight = 24 }

    override func drawHeaderForPage(at pageIndex: Int, in headerRect: CGRect) {
        if let root = Bundle.main.resourceURL,
           let logo = UIImage(contentsOfFile: root.appendingPathComponent("public/brand/wudayn-emblem-v2.png").path) {
            logo.draw(in: CGRect(x: headerRect.maxX - 26, y: headerRect.minY, width: 24, height: 24))
        }
    }

    override func drawFooterForPage(at pageIndex: Int, in footerRect: CGRect) {
        let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
        let formatter = NumberFormatter(); formatter.locale = Locale(identifier: "ar_SA")
        let page = formatter.string(from: NSNumber(value: pageIndex + 1)) ?? "\(pageIndex + 1)"
        ("وُدَين · نسخة خاصة · \(page)" as NSString).draw(in: footerRect, withAttributes: [
            .font: UIFont.systemFont(ofSize: 9), .foregroundColor: UIColor.darkGray, .paragraphStyle: paragraph
        ])
    }
}
