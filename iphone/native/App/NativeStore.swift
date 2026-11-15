import SwiftUI
import Security
import WudaynCore

struct NativeSessionVault: SessionVault {
    private let service = "com.blindmatch.marriage.session"
    private let key = "swiftui.session"
    private func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
    func read() throws -> Data? {
        for account in [key, "marriage-sb-wupkifqbwhhebwrgvwai.supabase.co"] {
            var request = query(account); request[kSecReturnData as String] = true
            var result: CFTypeRef?
            let status = SecItemCopyMatching(request as CFDictionary, &result)
            if status == errSecSuccess { return result as? Data }
            if status != errSecItemNotFound { throw NativeProblem.message("تعذّرت قراءة جلسة الدخول من جهازك.") }
        }
        return nil
    }
    func write(_ data: Data) throws {
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let update = SecItemUpdate(query(key) as CFDictionary, attributes as CFDictionary)
        if update == errSecItemNotFound {
            guard SecItemAdd(query(key).merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess else { throw NativeProblem.message("تعذّر حفظ جلسة الدخول بأمان.") }
        } else if update != errSecSuccess { throw NativeProblem.message("تعذّر حفظ جلسة الدخول بأمان.") }
    }
    func clear() throws {
        for account in [key, "marriage-sb-wupkifqbwhhebwrgvwai.supabase.co", "account"] {
            let status = SecItemDelete(query(account) as CFDictionary)
            if status != errSecSuccess && status != errSecItemNotFound { throw NativeProblem.message("تعذّر حذف جلسة الدخول من الجهاز.") }
        }
    }
}

@MainActor final class NativeStore: ObservableObject {
    let client: WudaynClient
    @Published var owner: String?
    @Published var account: JSONValue = .null
    @Published var restoring = true
    @Published var busy = false
    @Published var error: String?
    init(client: WudaynClient = WudaynClient(vault: NativeSessionVault())) { self.client = client }
    var profile: JSONValue { account["profile"] }
    var approved: Bool { account["user"]["applicationStatus"].string == "approved" }
    func restore() async {
        defer { restoring = false }
        do { owner = try await client.restore(); if owner != nil { try await refresh() } }
        catch { self.error = error.localizedDescription }
    }
    func refresh() async throws { account = try await client.rpc("marriage_state") }
    func signIn(email: String, password: String) async {
        await perform { self.owner = try await self.client.signIn(email: email, password: password); try await self.refresh() }
    }
    func signOut() async {
        await perform {
            NisfaynCallCenter.shared.clear()
            try await self.client.signOut()
            self.owner = nil; self.account = .null
        }
    }
    func perform(_ action: () async throws -> Void) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { try await action() } catch is CancellationError { } catch { self.error = error.localizedDescription }
    }
}

extension JSONValue {
    var rows: [MemberRow] { array.filter { !$0["id"].string.isEmpty }.map(MemberRow.init) }
    var title: String { [self["alias"].string, self["displayName"].string, self["title"].string, self["name"].string].first { !$0.isEmpty } ?? "عضو" }
}
extension View {
    func nativeError(_ value: Binding<String?>) -> some View {
        alert("تعذّر إتمام الخطوة", isPresented: Binding(get: { value.wrappedValue != nil }, set: { if !$0 { value.wrappedValue = nil } })) {
            Button("حسنًا", role: .cancel) { value.wrappedValue = nil }
        } message: { Text(value.wrappedValue ?? "") }
    }
}

enum NativeTheme {
    static let accent = Color(red: 0.329, green: 0.082, blue: 0.165)
    static let paper = Color(red: 0.992, green: 0.992, blue: 0.992)
}

struct NativeEmpty: View {
    let title: String
    var icon = "heart.text.square"
    var body: some View {
        VStack(spacing: 16) { Image(systemName: icon).font(.largeTitle).foregroundStyle(NativeTheme.accent); Text(title).multilineTextAlignment(.center).foregroundStyle(.secondary) }.frame(maxWidth: .infinity).padding(32)
    }
}

struct NativeAction: View {
    @EnvironmentObject private var store: NativeStore
    let title: String
    let action: () async throws -> Void
    var body: some View { Button(title) { Task { await store.perform(action) } }.disabled(store.busy) }
}
