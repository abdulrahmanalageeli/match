import Foundation

/// A poll replaces the entire loaded window. Keeping an old row just because
/// it is absent from a fresh page can keep deleted private content on screen.
public enum ChatSnapshot {
    public static func pageTarget(loadedCount: Int, older: Bool) -> Int {
        max(50, loadedCount + (older ? 50 : 0))
    }
    public static func prepend(_ page: [MemberRow], to newer: [MemberRow]) -> [MemberRow] {
        let ids = Set(newer.map(\.id))
        var seen = Set<String>()
        return page.filter { !$0.id.isEmpty && !ids.contains($0.id) && seen.insert($0.id).inserted } + newer
    }
    public static func cursor(_ rows: [MemberRow]) -> JSONValue {
        rows.first.map { .string($0.id) } ?? .null
    }
}
