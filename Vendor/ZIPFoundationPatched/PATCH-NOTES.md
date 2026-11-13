# ZIPFoundation 0.9.19 local read-path patch

Upstream: https://github.com/weichsel/ZIPFoundation/tree/0.9.19
License: MIT (see LICENSE).

Entry.checksum, compressedSize and uncompressedSize use central-directory metadata. Offset-only ZIP64 entries may still carry 32-bit local data descriptors. Inferring descriptor width solely from the central ZIP64 flag can misread following bytes as enormous sizes. This client only reads completed, SHA-256-validated archives, whose central directory provides authoritative CRC and size fields.

Regression: tests/create-offset64-zip.py writes two small deflated entries with 32-bit data descriptors, placing the second at an offset above 4 GiB in a sparse file. ZIP64Regression verifies sizes, extracted bytes and CRC. This regression runs in GitHub Actions before building the iOS app.
