import Foundation

enum NativeDates {
    static func display(_ timestamp: String) -> String {
        let formatter = DateFormatter()
        var date = parse(timestamp)
        if date == nil, timestamp.count == 10 {
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.dateFormat = "yyyy-MM-dd"
            date = formatter.date(from: timestamp)
        }
        guard let date else { return "—" }
        formatter.locale = Locale(identifier: "ar_SA@numbers=arab")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.setLocalizedDateFormatFromTemplate("dMMMMyyyy")
        return formatter.string(from: date)
    }

    static func parse(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)
    }
}
