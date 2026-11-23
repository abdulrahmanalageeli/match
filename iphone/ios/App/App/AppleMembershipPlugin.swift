import Capacitor
import StoreKit
import UIKit

@objc(AppleMembershipPlugin)
final class AppleMembershipPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AppleMembershipPlugin"
    let jsName = "AppleMembership"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "offer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "giftOffer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseGift", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingGifts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "current", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "complete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise)
    ]
    private let monthlyProductForGift = [
        "com.blindmatch.marriage.gift.premium.30d": "com.blindmatch.marriage.monthly.men",
        "com.blindmatch.marriage.gift.premium.30d.women": "com.blindmatch.marriage.monthly.women",
        "com.blindmatch.marriage.gift.seriousness.30d": "com.blindmatch.marriage.monthly.seriousness",
        "com.blindmatch.marriage.gift.seriousness.30d.women": "com.blindmatch.marriage.monthly.seriousness.women"
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
                if let gift = self.giftReceipt(result) {
                    self.notifyListeners("giftTransaction", data: ["jws": gift], retainUntilConsumed: true)
                } else if let receipt = self.receipt(result) {
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
                guard let terms = await MembershipStoreOffer(product) else { throw NSError(domain: "WudaynMembership", code: 4) }
                let appResult = try await AppTransaction.shared
                guard case .verified = appResult else { throw NSError(domain: "WudaynMembership", code: 3) }
                let intro = product.subscription?.introductoryOffer
                let week = intro?.paymentMode == .freeTrial && intro?.periodCount == 1 &&
                    ((intro?.period.unit == .week && intro?.period.value == 1) || (intro?.period.unit == .day && intro?.period.value == 7))
                let appleEligible = await product.subscription?.isEligibleForIntroOffer ?? false
                var response: JSObject = ["price": product.displayPrice, "productId": product.id, "period": terms.period,
                    "currency": product.priceFormatStyle.currencyCode,
                    "appleEligible": week && appleEligible,
                    "signedAppTransaction": appResult.jwsRepresentation]
                let promotions: [[String: String]] = (product.subscription?.promotionalOffers ?? []).compactMap { offer in
                    guard let id = offer.id, let summary = MembershipStoreOffer.summary(offer, for: product) else { return nil }
                    return ["id": id, "terms": summary]
                }
                response["promotions"] = promotions
                if let introduction = terms.introduction { response["introduction"] = introduction }
                call.resolve(response)
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
            // Sandbox price changes can precede the production catalog. Checkout
            // still compares the displayed StoreKit quote immediately before purchase.
            guard case .verified(let app) = try await AppTransaction.shared, app.environment == .sandbox else {
                throw NSError(domain: "WudaynMembership", code: 2, userInfo: [NSLocalizedDescriptionKey: "سعر العضوية في المتجر يحتاج إلى تحديث."])
            }
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
                guard let terms = await MembershipStoreOffer(product), let price = call.getString("price"),
                      product.displayPrice == price, terms.period == call.getString("period"),
                      product.priceFormatStyle.currencyCode == call.getString("currency") else {
                    call.reject("تغيّر عرض المتجر. راجع السعر والمدة قبل الشراء.", "OFFER_CHANGED")
                    return
                }
                if let expectedIntro = call.getString("introduction"), expectedIntro != terms.introduction {
                    call.reject("تغيّر العرض الأولي. راجع العضوية قبل الشراء.", "OFFER_CHANGED")
                    return
                }
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
                var options: Set<Product.PurchaseOption> = [.appAccountToken(token)]
                if let promo = call.getString("promotionId") {
                    guard let signature = call.getString("promotionJws"), !signature.isEmpty,
                          let offer = product.subscription?.promotionalOffers.first(where: { $0.id == promo }),
                          let summary = MembershipStoreOffer.summary(offer, for: product),
                          summary == call.getString("promotionTerms") else {
                        call.reject("تغيّر عرض العودة. راجع السعر والمدة قبل الشراء.", "OFFER_CHANGED")
                        return
                    }
                    options.formUnion(Product.PurchaseOption.promotionalOffer(promo, compactJWS: signature))
                } else {
                    options.insert(.introductoryOfferEligibility(compactJWS: eligibility))
                }
                switch try await product.purchase(options: options) {
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

    @MainActor private func giftReceipt(_ result: VerificationResult<Transaction>, order: UUID? = nil) -> String? {
        guard case .verified(let transaction) = result, monthlyProductForGift[transaction.productID] != nil,
              transaction.productType == .consumable, let token = transaction.appAccountToken,
              order == nil || token == order else { return nil }
        UserDefaults.standard.removeObject(forKey: "giftPending." + token.uuidString)
        let jws = result.jwsRepresentation
        pendingDelivery[jws] = transaction
        return jws
    }

    @MainActor private func giftProduct(_ call: CAPPluginCall) async -> Product? {
        guard let id = call.getString("productId"), let monthlyID = monthlyProductForGift[id] else {
            call.reject("خيار الهدية غير متاح.", "OFFER_UNAVAILABLE")
            return nil
        }
        let products: [Product]
        do {
            products = try await Product.products(for: [id, monthlyID])
        } catch {
            call.reject("تعذّر تحميل أسعار App Store. حاول مجددًا.", "OFFER_UNAVAILABLE", error)
            return nil
        }
        guard let gift = products.first(where: { $0.id == id && $0.type == .consumable }),
              let monthly = products.first(where: { $0.id == monthlyID && $0.type == .autoRenewable }),
              let period = monthly.subscription?.subscriptionPeriod, period.unit == .month, period.value == 1 else {
            call.reject("تعذّر تحميل سعر الهدية والعضوية المقابلة من App Store. حدّث الأسعار وحاول مجددًا.", "OFFER_UNAVAILABLE")
            return nil
        }
        // Compare regular prices in this storefront, before introductory or promotional offers.
        guard gift.price == monthly.price, gift.priceFormatStyle.currencyCode == monthly.priceFormatStyle.currencyCode else {
            call.reject("سعر الهدية في المتجر لا يطابق سعر العضوية الشهرية. حدّث الأسعار وحاول مجددًا.", "OFFER_CHANGED")
            return nil
        }
        return gift
    }

    @objc func giftOffer(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let product = await giftProduct(call) else { return }
            call.resolve(["productId": product.id, "price": product.displayPrice, "currency": product.priceFormatStyle.currencyCode])
        }
    }

    @objc func pendingGifts(_ call: CAPPluginCall) {
        Task { @MainActor in
            var receipts: [String] = []
            for await result in Transaction.unfinished {
                if let jws = giftReceipt(result) { receipts.append(jws) }
            }
            call.resolve(["transactions": receipts])
        }
    }

    @objc func purchaseGift(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let token = call.getString("orderToken").flatMap(UUID.init(uuidString:)) else {
                call.reject("تعذّر فتح طلب الهدية.", "ACCOUNT_REQUIRED")
                return
            }
            guard !purchaseInProgress else {
                call.reject("يجري تنفيذ عملية شراء أخرى.", "IN_PROGRESS")
                return
            }
            purchaseInProgress = true
            defer { purchaseInProgress = false }
            do {
                for await result in Transaction.unfinished {
                    if let jws = giftReceipt(result, order: token) {
                        call.resolve(["jws": jws])
                        return
                    }
                }
                if UserDefaults.standard.bool(forKey: "giftDelivered." + token.uuidString) {
                    call.reject("تم تسجيل هذه الهدية بالفعل.", "ALREADY_DELIVERED")
                    return
                }
                let pendingKey = "giftPending." + token.uuidString
                if let pending = UserDefaults.standard.object(forKey: pendingKey) as? Date,
                   Date().timeIntervalSince(pending) < 86400 {
                    call.reject("بانتظار موافقة App Store على الهدية.", "PENDING")
                    return
                }
                guard let product = await giftProduct(call) else { return }
                guard call.getString("price") == product.displayPrice,
                      call.getString("currency") == product.priceFormatStyle.currencyCode else {
                    call.reject("تغيّر سعر الهدية. راجع السعر قبل الشراء.", "OFFER_CHANGED")
                    return
                }
                switch try await product.purchase(options: [.appAccountToken(token)]) {
                case .success(let result):
                    guard let jws = giftReceipt(result, order: token) else {
                        call.reject("تعذّر التحقق من عملية الشراء.", "UNVERIFIED")
                        return
                    }
                    call.resolve(["jws": jws])
                case .pending:
                    UserDefaults.standard.set(Date(), forKey: pendingKey)
                    call.reject("بانتظار موافقة App Store على الهدية.", "PENDING")
                case .userCancelled:
                    call.reject("ألغيت عملية الشراء.", "CANCELLED")
                @unknown default:
                    call.reject("تعذّر إكمال عملية الشراء.", "STORE_ERROR")
                }
            } catch { call.reject("تعذّر إتمام شراء الهدية من App Store.", "STORE_ERROR", error) }
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
                if monthlyProductForGift[transaction.productID] != nil, let token = transaction.appAccountToken {
                    UserDefaults.standard.set(true, forKey: "giftDelivered." + token.uuidString)
                }
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
