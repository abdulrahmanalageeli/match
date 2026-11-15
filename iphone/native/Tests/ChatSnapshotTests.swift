import XCTest
@testable import WudaynCore

final class ChatSnapshotTests: XCTestCase {
    private func row(_ id: String, body: String = "") -> MemberRow { MemberRow(.object(["id": .string(id), "body": .string(body)])) }
    func testAscendingSearchCursorUsesOldestResult() {
        XCTAssertEqual(ChatSnapshot.cursor([row("old"), row("new")]), .string("old"))
        XCTAssertEqual(ChatSnapshot.cursor([]), .null)
    }
    func testOverlappingPagesKeepFreshRowsWithoutDuplicates() {
        let fresh = row("new", body: "deleted")
        let snapshot = ChatSnapshot.prepend([row("old"), row("old"), row("new", body: "stale")], to: [fresh])
        XCTAssertEqual(snapshot.map(\.id), ["old", "new"])
        XCTAssertEqual(snapshot.last?.value["body"], .string("deleted"))
    }
    func testRefreshCoversEntireLoadedWindowAndOlderAddsOnePage() {
        XCTAssertEqual(ChatSnapshot.pageTarget(loadedCount: 120, older: false), 120)
        XCTAssertEqual(ChatSnapshot.pageTarget(loadedCount: 120, older: true), 170)
        XCTAssertEqual(ChatSnapshot.pageTarget(loadedCount: 0, older: false), 50)
    }
}
