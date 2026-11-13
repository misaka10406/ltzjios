import Foundation
import Network
import UniformTypeIdentifiers

/// A loopback-only HTTP server. Local files stream in chunks; no 7 GB Data allocation.
final class LocalHTTPServer {
    static let upstream = URL(string: "http://ltzj-server.ulccc.com:23081/")!
    private let root: URL
    private let queue = DispatchQueue(label: "ltzj.loopback")
    private var listener: NWListener?
    private var connections: [ObjectIdentifier: NWConnection] = [:]
    init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath() }

    func start(completion: @escaping (Result<URL, Error>) -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
            let listener = try NWListener(using: parameters)
            self.listener = listener
            var replied = false
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    if !replied, let port = listener.port {
                        replied = true; listener.stateUpdateHandler = nil
                        completion(.success(URL(string: "http://127.0.0.1:\(port.rawValue)/")!))
                    }
                case .failed(let error):
                    if !replied { replied = true; listener.stateUpdateHandler = nil; completion(.failure(error)) }
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                guard let self = self else { connection.cancel(); return }
                self.connections[ObjectIdentifier(connection)] = connection
                connection.stateUpdateHandler = { [weak self, weak connection] state in
                    if case .cancelled = state, let connection = connection { self?.connections.removeValue(forKey: ObjectIdentifier(connection)) }
                    if case .failed = state { connection?.cancel() }
                }
                connection.start(queue: self.queue)
                self.receive(connection, buffer: Data())
                self.queue.asyncAfter(deadline: .now() + 120) { [weak connection] in connection?.cancel() }
            }
            listener.start(queue: queue)
        } catch { completion(.failure(error)) }
    }
    func stop() {
        queue.async { self.listener?.cancel(); self.listener = nil; for c in self.connections.values { c.cancel() }; self.connections.removeAll() }
    }
    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, finished, error in
            guard let self = self else { connection.cancel(); return }
            var buffer = buffer; if let data = data { buffer.append(data) }
            if buffer.count > 2 * 1024 * 1024 { self.respond(connection, status: 413, body: Data()); return }
            if let separator = buffer.range(of: Data("\r\n\r\n".utf8)) {
                guard separator.lowerBound <= 32768, let header = String(data: buffer[..<separator.lowerBound], encoding: .utf8) else {
                    self.respond(connection, status: 400, body: Data()); return
                }
                let lines = header.components(separatedBy: "\r\n")
                let first = (lines.first ?? "").split(separator: " ")
                guard first.count == 3, first[1].hasPrefix("/") else { self.respond(connection, status: 400, body: Data()); return }
                var headers: [String: String] = [:]
                for line in lines.dropFirst() {
                    guard let colon = line.firstIndex(of: ":") else { continue }
                    headers[String(line[..<colon]).lowercased()] = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
                }
                guard headers["transfer-encoding"] == nil else { self.respond(connection, status: 400, body: Data()); return }
                let length = Int(headers["content-length"] ?? "0") ?? -1
                guard length >= 0, length <= 2 * 1024 * 1024 else { self.respond(connection, status: 413, body: Data()); return }
                if buffer.count - separator.upperBound >= length {
                    let body = Data(buffer[separator.upperBound..<(separator.upperBound + length)])
                    self.route(connection, method: String(first[0]), target: String(first[1]), headers: headers, body: body)
                    return
                }
            } else if buffer.count > 32768 { self.respond(connection, status: 400, body: Data()); return }
            if finished || error != nil { connection.cancel(); return }
            self.receive(connection, buffer: buffer)
        }
    }
    private func route(_ connection: NWConnection, method: String, target: String, headers: [String: String], body: Data) {
        if method == "OPTIONS" { respond(connection, status: 204, body: Data()); return }
        guard let parts = URLComponents(string: target), var path = parts.percentEncodedPath.removingPercentEncoding else { respond(connection, status: 400, body: Data()); return }
        if path == "/" || path == "/game/" { path = "index.html" }
        else if path.hasPrefix("/game/") { path = String(path.dropFirst(6)) }
        else if path.hasPrefix("/") { path.removeFirst() }
        let file = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"), !path.contains("\0") else { respond(connection, status: 403, body: Data()); return }
        var directory: ObjCBool = false
        if (method == "GET" || method == "HEAD"), FileManager.default.fileExists(atPath: file.path, isDirectory: &directory), !directory.boolValue {
            sendFile(connection, file: file, head: method == "HEAD", range: headers["range"]); return
        }
        if path.hasPrefix("assets/") || path.hasPrefix("src/") || ["index.html", "main.js"].contains(path) {
            respond(connection, status: 404, body: Data("Missing local asset".utf8)); return
        }
        // Relative API requests retain the browser's local origin; relay only to this game's fixed server.
        guard let url = URL(string: Self.upstream.absoluteString + String(target.dropFirst())) else { respond(connection, status: 400, body: Data()); return }
        var request = URLRequest(url: url, timeoutInterval: 30); request.httpMethod = method; request.httpBody = body.isEmpty ? nil : body
        for (key, value) in headers where ["content-type", "cookie", "authorization", "accept"].contains(key) { request.setValue(value, forHTTPHeaderField: key) }
        request.setValue(Self.upstream.absoluteString, forHTTPHeaderField: "Referer")
        request.setValue("http://ltzj-server.ulccc.com:23081", forHTTPHeaderField: "Origin")
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { connection.cancel(); return }
            guard error == nil, let response = response as? HTTPURLResponse else { self.respond(connection, status: 502, body: Data()); return }
            var fields: [String: String] = [:]
            for key in ["Content-Type", "Set-Cookie"] { if let value = response.value(forHTTPHeaderField: key) { fields[key] = value } }
            self.respond(connection, status: response.statusCode, body: data ?? Data(), fields: fields)
        }.resume()
    }
    private func sendFile(_ connection: NWConnection, file: URL, head: Bool, range: String?) {
        do {
            let handle = try FileHandle(forReadingFrom: file)
            let size = Int64(try handle.seekToEnd()); var first: Int64 = 0; var last = size - 1; var status = 200
            if let range = range {
                let values = range.hasPrefix("bytes=") ? String(range.dropFirst(6)).split(separator: "-", omittingEmptySubsequences: false) : []
                guard values.count == 2, size > 0 else { try? handle.close(); respond(connection, status: 416, body: Data(), fields: ["Content-Range": "bytes */\(size)"]); return }
                if values[0].isEmpty, let suffix = Int64(values[1]), suffix > 0 { first = max(0, size - suffix) }
                else if let start = Int64(values[0]) { first = start; if !values[1].isEmpty { last = Int64(values[1]) ?? -1 } }
                else { first = -1 }
                guard first >= 0, first < size, last >= first else { try? handle.close(); respond(connection, status: 416, body: Data(), fields: ["Content-Range": "bytes */\(size)"]); return }
                last = min(last, size - 1); status = 206
            }
            let length = max(0, last - first + 1)
            try handle.seek(toOffset: UInt64(first))
            var fields = ["Content-Type": mime(file.pathExtension), "Accept-Ranges": "bytes"]
            if status == 206 { fields["Content-Range"] = "bytes \(first)-\(last)/\(size)" }
            connection.send(content: header(status, length: length, fields: fields), completion: .contentProcessed { [weak self] error in
                if error != nil || head { try? handle.close(); connection.cancel() }
                else { self?.stream(connection, handle: handle, remaining: length) }
            })
        } catch { respond(connection, status: 500, body: Data()) }
    }
    private func stream(_ connection: NWConnection, handle: FileHandle, remaining: Int64) {
        guard remaining > 0 else { try? handle.close(); connection.cancel(); return }
        do {
            guard let chunk = try handle.read(upToCount: Int(min(262144, remaining))), !chunk.isEmpty else { try? handle.close(); connection.cancel(); return }
            connection.send(content: chunk, completion: .contentProcessed { [weak self] error in
                if error != nil { try? handle.close(); connection.cancel() }
                else { self?.stream(connection, handle: handle, remaining: remaining - Int64(chunk.count)) }
            })
        } catch { try? handle.close(); connection.cancel() }
    }
    private func mime(_ ext: String) -> String {
        let known = ["js": "application/javascript", "json": "application/json", "atlas": "text/plain", "bin": "application/octet-stream"]
        return known[ext.lowercased()] ?? UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }
    private func header(_ status: Int, length: Int64, fields: [String: String]) -> Data {
        var text = "HTTP/1.1 \(status) \(HTTPURLResponse.localizedString(forStatusCode: status))\r\nContent-Length: \(length)\r\nConnection: close\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type, Range, Authorization\r\nAccess-Control-Allow-Methods: GET, HEAD, POST, OPTIONS\r\n"
        for (key, value) in fields { text += "\(key): \(value.replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: ""))\r\n" }
        return Data((text + "\r\n").utf8)
    }
    private func respond(_ connection: NWConnection, status: Int, body: Data, fields: [String: String] = [:]) {
        var data = header(status, length: Int64(body.count), fields: fields); data.append(body)
        connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
    }
}

