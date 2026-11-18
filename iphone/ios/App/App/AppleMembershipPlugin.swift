import Capacitor
import StoreKit
import UIKit

@objc(AppleMembershipPlugin)
final class AppleMembershipPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AppleMembershipPlugin"
    let jsName = "AppleMembership"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "offer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "current", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "complete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise)
    ]
    private let legacyProductID = "com.blindmatch.marriage.monthly"
    private var menProductIDs: [String] { [legacyProductID + ".seriousness", legacyProductID + ".men"] }
    private var womenProductIDs: [String] { [legacyProductID + ".seriousness.women", legacyProductID + ".women"] }

    private func storeProduct(for gender: String?) async throws -> Product? {
        let ids: [String]
        switch gender {
        case "man": ids = menProductIDs
        case "woman": ids = womenProductIDs
        default: return nil
        }
        let products = try await Product.products(for: ids)
        return ids.lazy.compactMap { id in products.first { $0.id == id } }.first
    }
    private var updates: Task<Void, Never>?
    @MainActor private var purchaseInProgress = false
    @MainActor private var pendingDelivery: [String: Transaction] = [:]

    override func load() {
        updates = Task { @MainActor [weak self] in
            for await result in Transaction.updates {
                guard let self else { break }
                if let receipt = self.receipt(result) {
                    self.notifyListeners("transaction", data: ["jws": receipt], retainUntilConsumed: true)
                }
            }
        }
    }

    deinit { updates?.cancel() }

    @MainActor private func receipt(_ result: VerificationResult<Transaction>) -> String? {
        guard case .verified(let transaction) = result,
              ([legacyProductID] + menProductIDs + womenProductIDs).contains(transaction.productID) else { return nil }
        let jws = result.jwsRepresentation
        pendingDelivery[jws] = transaction
        return jws
    }

    @MainActor private func activeReceipt() async -> String? {
        for await result in Transaction.currentEntitlements {
            if let jws = receipt(result) { return jws }
        }
        return nil
    }

    @objc func offer(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                guard let product = try await storeProduct(for: call.getString("gender")),
                      let offer = await MembershipStoreOffer(product) else {
                    call.reject("العضوية غير متاحة في متجر حسابك.", "UNAVAILABLE")
                    return
                }
                var terms = ["price": product.displayPrice, "productId": product.id, "period": offer.period]
                terms["introduction"] = offer.introduction
                call.resolve(terms)
            } catch {
                call.reject("تعذّر تحميل سعر العضوية من App Store.", "STORE_ERROR", error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let token = call.getString("accountToken").flatMap(UUID.init(uuidString:)) else {
                call.reject("سجّل الدخول أولًا لربط الاشتراك بحسابك.", "ACCOUNT_REQUIRED")
                return
            }
            guard !purchaseInProgress else {
                call.reject("يجري تنفيذ عملية شراء أخرى.", "IN_PROGRESS")
                return
            }
            purchaseInProgress = true
            defer { purchaseInProgress = false }
            do {
                if let existing = await activeReceipt() {
                    call.resolve(["jws": existing])
                    return
                }
                guard let requestedID = call.getString("productId"),
                      let product = try await storeProduct(for: call.getString("gender")),
                      product.id == requestedID, let offer = await MembershipStoreOffer(product) else {
                    call.reject("العضوية غير متاحة في متجر حسابك.", "UNAVAILABLE")
                    return
                }
                if let price = call.getString("price"),
                   price != product.displayPrice || call.getString("period") != offer.period || call.getString("introduction") != offer.introduction {
                    call.reject("تغيّر عرض Apple. حدّث العرض وراجعه قبل الشراء.", "OFFER_CHANGED")
                    return
                }
                switch try await product.purchase(options: [.appAccountToken(token)]) {
                case .success(let result):
                    guard let jws = receipt(result) else {
                        call.reject("تعذّر التحقق من عملية الشراء.", "UNVERIFIED")
                        return
                    }
                    call.resolve(["jws": jws])
                case .pending:
                    call.reject("بانتظار الموافقة على عملية الشراء.", "PENDING")
                case .userCancelled:
                    call.reject("ألغيت عملية الشراء.", "CANCELLED")
                @unknown default:
                    call.reject("تعذّر إكمال عملية الشراء.", "STORE_ERROR")
                }
            } catch {
                call.reject("تعذّر إتمام عملية الشراء من App Store.", "STORE_ERROR", error)
            }
        }
    }

    @objc func current(_ call: CAPPluginCall) {
        Task { @MainActor in
            if let jws = await activeReceipt() {
                call.resolve(["jws": jws])
            } else {
                call.resolve(["jws": NSNull()])
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                try await AppStore.sync()
                guard let jws = await activeReceipt() else {
                    call.reject("لا يوجد اشتراك فعّال لاستعادته.", "NO_SUBSCRIPTION")
                    return
                }
                call.resolve(["jws": jws])
            } catch {
                call.reject("تعذّرت استعادة الاشتراك من App Store.", "STORE_ERROR", error)
            }
        }
    }

    @objc func complete(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let jws = call.getString("jws") else {
                call.reject("بيانات عملية الشراء غير مكتملة.", "INVALID_RECEIPT")
                return
            }
            // The web client calls this only after server verification and delivery.
            // StoreKit replays unfinished transactions if the network or app exits first.
            if let transaction = pendingDelivery.removeValue(forKey: jws) {
                await transaction.finish()
            }
            call.resolve()
        }
    }

    @objc func manage(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = bridge?.viewController?.view.window?.windowScene else {
                call.reject("تعذّر فتح إدارة اشتراكات Apple.", "NO_WINDOW")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject("تعذّر فتح إدارة اشتراكات Apple.", "STORE_ERROR", error)
            }
        }
    }
}
