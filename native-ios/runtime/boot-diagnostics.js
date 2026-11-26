(function () {
    const root = globalThis;
    function send(selector, message) {
        try { jsb.reflection.callStaticMethod('LTZJBootDiagnostics', selector, String(message || '')); }
        catch (error) { /* The native overlay remains visible if the bridge is unavailable. */ }
    }
    root.__ltzjBootStage = text => send('setStatus:', text);
    root.__ltzjBootFailure = error => send('fail:', String(error && (error.stack || error.message) || error));
    root.__ltzjBootFinished = () => { root.__ltzjBootComplete = true; send('finish:', ''); };
    const original = console.error.bind(console);
    console.error = function () {
        original.apply(console, arguments);
        if (!root.__ltzjBootComplete) root.__ltzjBootFailure(Array.from(arguments).map(String).join('\n'));
    };
    if (typeof root.addEventListener === 'function') {
        root.addEventListener('error', event => root.__ltzjBootFailure(event.error || event.message));
        root.addEventListener('unhandledrejection', event => root.__ltzjBootFailure(event.reason));
    }
    root.__ltzjBootStage('正在加载原生启动脚本…');
})();
