import StoreKit

struct MembershipStoreOffer {
    let product: Product
    let period: String
    let introduction: String?

    static func summary(_ offer: Product.SubscriptionOffer, for product: Product) -> String? {
        let interval = offer.period.formatted(product.subscriptionPeriodFormatStyle)
        let duration = offer.periodCount == 1 ? interval : "\(offer.periodCount) فترات، مدة كل منها \(interval)"
        switch offer.paymentMode {
        case .freeTrial: return "مجانًا لمدة \(duration)"
        case .payUpFront: return "\(offer.displayPrice) دفعة واحدة لمدة \(duration)"
        case .payAsYouGo: return "\(offer.displayPrice) لكل \(interval) لمدة \(duration)"
        default: return nil
        }
    }

    init?(_ product: Product) async {
        guard let subscription = product.subscription else { return nil }
        self.product = product
        period = subscription.subscriptionPeriod.formatted(product.subscriptionPeriodFormatStyle)
        guard let offer = subscription.introductoryOffer, await subscription.isEligibleForIntroOffer else {
            introduction = nil
            return
        }
        introduction = Self.summary(offer, for: product)
    }
}
