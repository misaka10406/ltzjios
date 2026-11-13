import io, zipfile, sys
class NoSeek:
    def __init__(self, f): self.f = f
    def write(self, b): return self.f.write(b)
    def tell(self): return self.f.tell()
    def seek(self, *args): raise io.UnsupportedOperation()
    def flush(self): self.f.flush()
with open(sys.argv[1], 'w+b') as f:
    with zipfile.ZipFile(NoSeek(f), 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        z.writestr('normal.txt', b'zip64-offset-check\n')
        f.seek((1 << 32) + 128)
        z.writestr('offset64.txt', b'zip64-offset-check\n')
with zipfile.ZipFile(sys.argv[1]) as z:
    assert len(z.infolist()) == 2
    assert z.infolist()[1].header_offset > (1 << 32)
    assert all(e.flag_bits & 8 and e.file_size == 19 for e in z.infolist())
print('Created sparse >4GiB regression archive')
