import Foundation

// Explicit Range continuation survives app termination without URLSession resume-data dependencies.
final class ResumableDownload: NSObject, URLSessionDataDelegate {
    private var output: FileHandle?
    private var received: Int64 = 0
    private var expected: Int64 = 0
    private var failure: Error?
    private var progress: ResourceInstaller.ProgressHandler = { _, _ in }
    private let completed = DispatchSemaphore(value: 0)

    func run(url: URL, file: URL, size: Int64, progress: @escaping ResourceInstaller.ProgressHandler) throws {
        let fm = FileManager.default
        if !fm.fileExists(atPath: file.path) { guard fm.createFile(atPath: file.path, contents: nil) else { throw ClientError("无法创建下载文件") }; }
        output = try FileHandle(forWritingTo: file)
        defer { try? output?.close(); output = nil }
        received = Int64(try output!.seekToEnd())
        if received > size { try output!.truncate(atOffset: 0); try output!.seek(toOffset: 0); received = 0 }
        if received == size { return }
        expected = size; self.progress = progress
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        if received > 0 { request.setValue("bytes=\(received)-", forHTTPHeaderField: "Range") }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForResource = 7 * 24 * 60 * 60
        let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
        session.dataTask(with: request).resume()
        completed.wait()
        session.finishTasksAndInvalidate()
        if let failure = failure { throw failure }
        guard received == expected else { throw ClientError("下载尚未完成，请重试续传") }
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        do {
            guard let http = response as? HTTPURLResponse else { throw ClientError("下载响应无效") }
            if http.statusCode == 200 {
                try output?.truncate(atOffset: 0); try output?.seek(toOffset: 0); received = 0
            } else if http.statusCode == 206 {
                let range = http.value(forHTTPHeaderField: "Content-Range") ?? ""
                guard range.hasPrefix("bytes \(received)-"), range.hasSuffix("/\(expected)") else { throw ClientError("服务器返回的续传范围无效") }
            } else { throw ClientError("资源下载 HTTP \(http.statusCode)，请检查服务器部署") }
            completionHandler(.allow)
        } catch { failure = error; completionHandler(.cancel) }
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        do {
            guard received <= expected - Int64(data.count) else { throw ClientError("下载大小超出在线清单") }
            try output?.write(contentsOf: data); received += Int64(data.count)
            progress("下载资源（\(received / 1048576)/\(expected / 1048576) MB）", Double(received) / Double(expected))
        } catch { failure = error; dataTask.cancel() }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if failure == nil { failure = error }
        completed.signal()
    }
}
