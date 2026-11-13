// swift-tools-version:5.7
import PackageDescription
let package = Package(name: "ZIPFoundation", platforms: [.macOS(.v12), .iOS(.v15)], products: [.library(name: "ZIPFoundation", targets: ["ZIPFoundation"]), .executable(name: "ZIP64Regression", targets: ["ZIP64Regression"])], targets: [.target(name: "ZIPFoundation"), .executableTarget(name: "ZIP64Regression", dependencies: ["ZIPFoundation"])])
