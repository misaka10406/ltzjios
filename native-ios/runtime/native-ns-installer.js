(function () {
    if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
        globalThis.crypto = {getRandomValues(array) {
            if (!ArrayBuffer.isView(array) || array.byteLength > 65536) throw new Error('随机数据长度无效');
            const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
            const hex=jsb.reflection.callStaticMethod('LTZJBootDiagnostics','randomBytes:',bytes.length);
            if (typeof hex !== 'string' || hex.length !== bytes.length*2) throw new Error('原生安全随机数接口不可用');
            for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(hex.slice(i*2,i*2+2),16);
            return array;
        }};
    }
    require('ns-runtime-asm.js');
    require('ns-runtime-factory.js');
    const original = System.register;
    System.register = function(name, dependencies, factory) {
        if (name === 'chunks:///_virtual/ns.ts' &&
            (typeof NativeEncrypt === 'undefined' || typeof NativeEncrypt.native_encrypt_n !== 'function')) {
            return original.call(this, name, dependencies, globalThis.__ltzjNSFactory);
        }
        return original.apply(this, arguments);
    };
})();
