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
        require('native-local-backend.js');
        require('local-login-adapter.js');
        System.import('./application.3a3d3.js').then(({Application}) => {
            const application = new Application();
            __ltzjBootStage('正在加载 Cocos 原生引擎…');
            return System.import('cc').then(cc => {
                require('jsb-adapter/engine-adapter.js');
                __ltzjPrepareIOS(cc);
                __prepareNativeLocalBackend(cc);
                cc.director.once(cc.Director.EVENT_AFTER_SCENE_LAUNCH, __ltzjBootFinished);
                application.init(cc);
                __ltzjBootStage('正在初始化游戏资源和场景…');
                return application.start();
            }).then(() => {
                __ltzjBootStage('正在接入登录服务…');
                return __installNativeLocalBackend();
            }).then(() => installLocalAccountLogin());
        }).catch(__ltzjBootFailure);
    } catch (error) { __ltzjBootFailure(error); }
})();
