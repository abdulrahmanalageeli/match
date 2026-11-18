import StoreKit

struct MembershipStoreOffer {
    let product: Product
    let period: String
    let introduction: String?

    init?(_ product: Product) async {
        guard let subscription = product.subscription else { return nil }
        self.product = product
        period = subscription.subscriptionPeriod.formatted(product.subscriptionPeriodFormatStyle)
        guard let offer = subscription.introductoryOffer, await subscription.isEligibleForIntroOffer else {
            introduction = nil
            return
        }
        let interval = offer.period.formatted(product.subscriptionPeriodFormatStyle)
        let duration = offer.periodCount == 1 ? interval : "\(offer.periodCount) فترات، مدة كل منها \(interval)"
        switch offer.paymentMode {
        case .freeTrial: introduction = "مجانًا لمدة \(duration)"
        case .payUpFront: introduction = "\(offer.displayPrice) دفعة واحدة لمدة \(duration)"
        case .payAsYouGo: introduction = "\(offer.displayPrice) لكل \(interval) خلال العرض الأولي لمدة \(duration)"
        default: return nil
        }
    }
}
