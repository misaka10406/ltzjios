require('boot-diagnostics.js');
try {
    require('native-platform.js');
    require('cloverEnv.js');
    require('realMain.js');
} catch (error) { __ltzjBootFailure(error); }
