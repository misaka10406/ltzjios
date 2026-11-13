import Foundation
import ZIPFoundation
let archive = try Archive(url: URL(fileURLWithPath: CommandLine.arguments[1]), accessMode: .read)
var count = 0
for entry in archive {
    guard entry.uncompressedSize == 19 else { fatalError("Wrong ZIP64 size: \(entry.path): \(entry.uncompressedSize)") }
    var result = Data()
    let crc = try archive.extract(entry, consumer: { result.append($0) })
    guard result == Data("zip64-offset-check\n".utf8), crc == entry.checksum else { fatalError("Data/CRC mismatch") }
    count += 1
}
guard count == 2 else { fatalError("Wrong file count") }
print("PASS: normal and offset-only ZIP64 entries with 32-bit data descriptors")
