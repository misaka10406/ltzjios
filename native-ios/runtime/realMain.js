/* Cocos JSB entry: deliberately uses the native engine rather than web virtual modules. */
(function () {
    try {
        window.self = window;
        __ltzjBootStage('正在加载脚本模块…');
        require('src/system.bundle.f45da.js');
        const importMap = JSON.parse(jsb.fileUtils.getStringFromFile('src/import-map.89abd.json'));
        if (importMap.imports.cc !== './cocos-js/cc.954ce.js') throw new Error('原生引擎映射无效');
        System.warmup({importMap, importMapUrl:'src/import-map.89abd.json', defaultHandler(url) {
            require(url.startsWith('/') ? url.slice(1) : url);
        }});
        require('native-ns-installer.js');
        require('native-local-backend.js');
        require('local-login-adapter.js');
        System.import('./application.3a3d3.js').then(({Application}) => {
            const application = new Application();
            __ltzjBootStage('正在加载 Cocos 原生引擎…');
            return System.import('cc').then(cc => {
                require('jsb-adapter/engine-adapter.js');
                __ltzjPrepareIOS(cc);
                __prepareNativeLocalBackend(cc);
                cc.game.onPostProjectInitDelegate.add(async () => {
                    __ltzjBootStage('正在安装本地登录适配…');
                    await __installNativeLocalBackend();
                    await installLocalAccountLogin();
                    globalThis.__ltzjBootBackendReady = true;
                });
                application.init(cc);
                __ltzjBootStage('正在初始化游戏资源和场景…');
                return application.start().then(async () => {
                    __ltzjBootStage('正在等待登录界面显示…');
                    const [{UIMgr},{UILogin}] = await Promise.all([
                        System.import('chunks:///_virtual/UIMgr.ts'),System.import('chunks:///_virtual/UILogin.ts')]);
                    const deadline=Date.now()+90000;
                    const timer=setInterval(() => {
                        try {
                            const ui=UIMgr.instance && UIMgr.instance.currentUI;
                            if (globalThis.__ltzjBootBackendReady && ui instanceof UILogin && ui.node && ui.node.activeInHierarchy) {
                                clearInterval(timer); __ltzjBootFinished();
                            } else if (Date.now()>deadline) {
                                clearInterval(timer);
                                const scene=cc.director.getScene();
                                __ltzjBootFailure('登录界面未在 90 秒内显示。当前场景：'+(scene && scene.name || '无'));
                            }
                        } catch (error) { clearInterval(timer); __ltzjBootFailure(error); }
                    },250);
                });
            });
        }).catch(__ltzjBootFailure);
    } catch (error) { __ltzjBootFailure(error); }
})();
