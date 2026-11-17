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
    private let prices: [String: Decimal] = [
        "com.blindmatch.marriage.monthly.seriousness.women": Decimal(string: "199.99")!,
        "com.blindmatch.marriage.monthly.seriousness": Decimal(string: "299.99")!,
        "com.blindmatch.marriage.monthly.men": Decimal(string: "149.99")!,
        "com.blindmatch.marriage.monthly.women": Decimal(string: "99.99")!
    ]
    // Existing subscriptions remain restorable; new purchases use gender-specific products.
    private let legacyProductID = "com.blindmatch.marriage.monthly"
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
              prices[transaction.productID] != nil || transaction.productID == legacyProductID else { return nil }
        let jws = result.jwsRepresentation
        pendingDelivery[jws] = transaction
        return jws
    }

    @MainActor private func activeReceipt(productID: String? = nil, accountToken: UUID? = nil) async -> String? {
        var selected: (jws: String, transaction: Transaction)?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  transaction.revocationDate == nil, !transaction.isUpgraded,
                  let expiry = transaction.expirationDate, expiry > Date(),
                  productID == nil || transaction.productID == productID,
                  accountToken == nil || transaction.appAccountToken == accountToken,
                  let jws = receipt(result) else { continue }
            let rank = transaction.productID.hasPrefix("com.blindmatch.marriage.monthly.seriousness") ? 2 : 1
            let currentRank = selected?.transaction.productID.hasPrefix("com.blindmatch.marriage.monthly.seriousness") == true ? 2 : 1
            if selected == nil || rank > currentRank || (rank == currentRank && expiry > (selected?.transaction.expirationDate ?? .distantPast)) {
                selected = (jws, transaction)
            }
        }
        return selected?.jws
    }

    @MainActor private func purchaseConflict(productID: String, accountToken: UUID) async -> (message: String, code: String)? {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  prices[transaction.productID] != nil || transaction.productID == legacyProductID,
                  transaction.revocationDate == nil, !transaction.isUpgraded,
                  let expiry = transaction.expirationDate, expiry > Date() else { continue }
            // Do not charge before discovering that this Apple subscription belongs
            // to another Wudayn account. Legacy receipts without a token need restore.
            guard transaction.appAccountToken == accountToken else {
                return ("يوجد اشتراك Apple مرتبط بحساب آخر أو يحتاج إلى استعادة. استعد مشترياتك أو سجّل الدخول إلى حساب وُدَين المرتبط قبل الشراء.", "ACCOUNT_CONFLICT")
            }
            if transaction.productID.hasPrefix("com.blindmatch.marriage.monthly.seriousness") && !productID.hasPrefix("com.blindmatch.marriage.monthly.seriousness") {
                return ("لديك وسام الجدية بالفعل. لتغيير الخطة، افتح إدارة الاشتراك في Apple.", "MANAGE_SUBSCRIPTION")
            }
        }
        return nil
    }

    @objc func offer(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let product = try await selectedProduct(call)
                let appResult = try await AppTransaction.shared
                guard case .verified = appResult else { throw NSError(domain: "WudaynMembership", code: 3) }
                let intro = product.subscription?.introductoryOffer
                let week = intro?.paymentMode == .freeTrial && intro?.periodCount == 1 &&
                    ((intro?.period.unit == .week && intro?.period.value == 1) || (intro?.period.unit == .day && intro?.period.value == 7))
                let appleEligible = await product.subscription?.isEligibleForIntroOffer ?? false
                call.resolve(["price": product.displayPrice, "productId": product.id,
                    "currency": product.priceFormatStyle.currencyCode,
                    "appleEligible": week && appleEligible,
                    "signedAppTransaction": appResult.jwsRepresentation])
            } catch {
                call.reject("تعذّر تحميل سعر العضوية من App Store.", "STORE_ERROR", error)
            }
        }
    }

    @MainActor private func selectedProduct(_ call: CAPPluginCall) async throws -> Product {
        guard let id = call.getString("productId"), let expected = prices[id],
              let product = try await Product.products(for: [id]).first,
              product.type == .autoRenewable,
              let period = product.subscription?.subscriptionPeriod,
              period.unit == .month, period.value == 1 else {
            throw NSError(domain: "WudaynMembership", code: 1, userInfo: [NSLocalizedDescriptionKey: "العضوية الشهرية غير مهيأة في App Store."])
        }
        // Never show the requested Saudi price while Apple would charge a different one.
        if product.priceFormatStyle.currencyCode == "SAR" && product.price != expected {
            throw NSError(domain: "WudaynMembership", code: 2, userInfo: [NSLocalizedDescriptionKey: "سعر العضوية في المتجر يحتاج إلى تحديث."])
        }
        return product
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
                let product = try await selectedProduct(call)
                if let conflict = await purchaseConflict(productID: product.id, accountToken: token) {
                    call.reject(conflict.message, conflict.code)
                    return
                }
                if let existing = await activeReceipt(productID: product.id, accountToken: token) {
                    call.resolve(["jws": existing])
                    return
                }
                guard let eligibility = call.getString("eligibilityJws"), !eligibility.isEmpty else {
                    call.reject("أعد تحميل عرض العضوية قبل الشراء.", "OFFER_REQUIRED")
                    return
                }
                switch try await product.purchase(options: [.appAccountToken(token), .introductoryOfferEligibility(compactJWS: eligibility)]) {
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
