// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WudaynCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "WudaynCore", targets: ["WudaynCore"])],
    targets: [
        .target(name: "WudaynCore", path: "Core"),
        .testTarget(name: "WudaynCoreTests", dependencies: ["WudaynCore"], path: "Tests")
    ]
)
