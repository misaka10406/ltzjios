/* Runs inside Cocos JSB, before importing the game. No DOM or browser shim. */
(function () {
    const root = globalThis;
    root.window = root;
    root.self = root;
    root.__ltzjPrepareIOS = function (cc) {
        if (!cc.sys.isNative || cc.sys.os !== cc.sys.OS.IOS) {
            throw new Error('This package requires Cocos iOS native runtime');
        }
        const bridges = new Set([root.jsb && root.jsb.reflection, cc.native && cc.native.reflection]);
        for (const bridge of bridges) {
            if (!bridge || bridge.__ltzjIOSGuard) continue;
            const original = bridge.callStaticMethod && bridge.callStaticMethod.bind(bridge);
            bridge.callStaticMethod = function (className, selector, signature) {
                // SDK implementations shipped only in the Android APK cannot run on iOS.
                if (/AT.*JS|AnyThink|CloverUtils|CocosCreatorProxyApi|UGSDK|QiYu|GravityEngine|SolarEngine|SDKForCocos/i.test(String(className))) {
                    if (/checkAdStatus/i.test(selector)) return '{"isLoading":false}';
                    if (/FetchRemoteConfig/i.test(selector)) return '{"data":null}';
                    if (typeof signature === 'string' && signature.endsWith('Ljava/lang/String;')) return '{}';
                    if (typeof signature === 'string' && signature.endsWith(')Z')) return false;
                    return null;
                }
                if (!original) throw new Error('Missing native bridge: ' + className + '.' + selector);
                return original.apply(null, arguments);
            };
            bridge.__ltzjIOSGuard = true;
        }
        cc.game.frameRate = 60;
        // Conservative parallelism reduces bursts. Actual frame pacing requires device profiling.
        cc.assetManager.downloader.maxConcurrency = 6;
        cc.assetManager.downloader.maxRequestsPerFrame = 2;
        cc.assetManager.presets.default.maxConcurrency = 6;
        cc.assetManager.presets.default.maxRequestsPerFrame = 2;
        console.log('[LTZJ] iOS native renderer / JSB, packaged local assets');
    };
})();
