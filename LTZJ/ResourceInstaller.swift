import Foundation
import CryptoKit
import ZIPFoundation

struct ClientError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct ResourceManifest: Decodable {
    let version: String
    let url: String
    let size: Int64
    let unpackedSize: Int64
    let files: Int
    let sha256: String

    func validate(relativeTo base: URL) throws -> URL {
        guard size > 0, unpackedSize > 0, files > 0,
              sha256.range(of: "^[a-fA-F0-9]{64}$", options: .regularExpression) != nil,
              let location = URL(string: url, relativeTo: base)?.absoluteURL,
              ["http", "https"].contains(location.scheme?.lowercased() ?? ""), location.host != nil else {
            throw ClientError("在线资源清单格式无效")
        }
        return location
    }
}

final class ResourceInstaller {
    // Download metadata stays on the server, never embedded in the app.
    static let manifestURL = URL(string: "http://ltzj-server.ulccc.com:23081/ios-update/resource-manifest.json")!
    typealias ProgressHandler = (String, Double) -> Void
    private let fm = FileManager.default

    func install(progress: @escaping ProgressHandler) throws -> URL {
        progress("正在获取在线资源配置…", 0)
        let request = URLRequest(url: Self.manifestURL, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 30)
        let semaphore = DispatchSemaphore(value: 0)
        var result: Result<Data, Error> = .failure(ClientError("无法获取配置"))
        let session = URLSession(configuration: .ephemeral)
        session.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            if let error = error { result = .failure(error); return }
            guard (response as? HTTPURLResponse)?.statusCode == 200, let data = data, data.count <= 65536 else {
                result = .failure(ClientError("在线清单请求失败或超过 64 KB，请确认服务器文件已上传")); return
            }
            result = .success(data)
        }.resume()
        semaphore.wait()
        session.finishTasksAndInvalidate()
        let manifest = try JSONDecoder().decode(ResourceManifest.self, from: result.get())
        let downloadURL = try manifest.validate(relativeTo: Self.manifestURL)
        let hash = manifest.sha256.lowercased()
        var base = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("LTZJ", isDirectory: true)
        try fm.createDirectory(at: base, withIntermediateDirectories: true)
        var backup = URLResourceValues(); backup.isExcludedFromBackup = true
        try base.setResourceValues(backup)
        let game = base.appendingPathComponent("game", isDirectory: true)
        let marker = game.appendingPathComponent(".ready")
        if (try? String(contentsOf: marker, encoding: .utf8)) == hash,
           fm.fileExists(atPath: game.appendingPathComponent("index.html").path) { return game }
        let zip = base.appendingPathComponent("resources-\(hash).zip.part")
        let stage = base.appendingPathComponent("game-staging", isDirectory: true)
        if fm.fileExists(atPath: stage.path) { try fm.removeItem(at: stage) }
        let existing = fileSize(zip)
        let (required, overflow) = manifest.unpackedSize.addingReportingOverflow(max(0, manifest.size - existing))
        guard !overflow, required < Int64.max - 268435456 else { throw ClientError("资源大小无效") }
        let free = try base.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage ?? 0
        guard free >= required + 268435456 else { throw ClientError(String(format: "空间不足，当前需要至少 %.1f GB 可用空间", Double(required + 268435456) / 1073741824)) }
        let downloader = ResumableDownload()
        try downloader.run(url: downloadURL, file: zip, size: manifest.size, progress: progress)
        guard try sha256(zip, progress: progress) == hash else {
            try? fm.removeItem(at: zip)
            throw ClientError("资源校验失败，已清理损坏 ZIP，请重试下载")
        }
        progress("校验完成，正在准备解压…", 0)
        try extract(zip, to: stage, manifest: manifest, progress: progress)
        guard fm.fileExists(atPath: stage.appendingPathComponent("index.html").path) else { throw ClientError("资源包缺少 index.html") }
        try hash.write(to: stage.appendingPathComponent(".ready"), atomically: true, encoding: .utf8)
        if fm.fileExists(atPath: game.path) {
            _ = try fm.replaceItemAt(game, withItemAt: stage)
        } else { try fm.moveItem(at: stage, to: game) }
        try? fm.removeItem(at: zip)
        return game
    }

    private func fileSize(_ url: URL) -> Int64 {
        ((try? fm.attributesOfItem(atPath: url.path)[.size]) as? NSNumber)?.int64Value ?? 0
    }
    private func sha256(_ file: URL, progress: ProgressHandler) throws -> String {
        let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
        var hasher = SHA256(); var done: Int64 = 0; let size = fileSize(file)
        while true {
            let more = try autoreleasepool { () throws -> Bool in
                guard let chunk = try handle.read(upToCount: 262144), !chunk.isEmpty else { return false }
                hasher.update(data: chunk); done += Int64(chunk.count)
                progress("校验资源", Double(done) / Double(max(1, size)))
                return true
            }
            if !more { break }
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
    private func extract(_ zip: URL, to root: URL, manifest: ResourceManifest, progress: ProgressHandler) throws {
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        let archive = try Archive(url: zip, accessMode: .read)
        var count = 0; var bytes: Int64 = 0; var seen = Set<String>()
        let prefix = root.standardizedFileURL.path + "/"
        for entry in archive {
            try autoreleasepool {
            let destination = root.appendingPathComponent(entry.path).standardizedFileURL
            guard !entry.path.hasPrefix("/"), destination.path.hasPrefix(prefix), entry.type != .symlink,
                  seen.insert(destination.path).inserted else { throw ClientError("ZIP 包含重复或不安全路径") }
            if entry.type == .directory {
                try fm.createDirectory(at: destination, withIntermediateDirectories: true); return
            }
            guard entry.uncompressedSize <= UInt64(manifest.unpackedSize - bytes), count < manifest.files else {
                throw ClientError("ZIP 内容超出清单声明大小或数量")
            }
            let crc = try archive.extract(entry, to: destination, bufferSize: 262144, skipCRC32: false)
            guard crc == entry.checksum else { throw ClientError("ZIP 文件 CRC 校验失败") }
            bytes += Int64(entry.uncompressedSize); count += 1
            progress("解压资源（\(count)/\(manifest.files)）", Double(bytes) / Double(manifest.unpackedSize))
            }
        }
        guard count == manifest.files, bytes == manifest.unpackedSize else { throw ClientError("ZIP 文件不完整") }
    }
}
