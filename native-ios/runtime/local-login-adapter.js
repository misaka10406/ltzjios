(function () {
  "use strict";
  const config = JSON.parse(jsb.fileUtils.getStringFromFile("local-server.json"));
  const base = String(config.serverBaseURL || "").replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+(?::\d+)?$/.test(base)) throw new Error("Invalid local server address");
  const endpoint = base + "/api/p.f";

  // Redirect protocol and configuration traffic before any scene is loaded.
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    const args = Array.prototype.slice.call(arguments);
    let target = String(url || "");
    if (/\/p\.f(?:\?|$)/.test(target)) target = endpoint;
    const remote = target.match(/\/clover\/config\/([^/]+)\/([^/]+)\/([^/?]+\.json)/);
    if (remote) target = base + "/api/config/remote/" + remote.slice(1).join("/");
    if (/\/clover\/notice\/cfg_news_news\.json/.test(target)) {
      target = base + "/api/config/remote/notice/pub/cfg_news_news.json";
    }
    args[1] = target;
    return open.apply(this, args);
  };

  window.installLocalAccountLogin = async function () {
    const modules = await Promise.all([
      System.import("chunks:///_virtual/UILogin.ts"),
      System.import("chunks:///_virtual/OwnLoginRequestData.ts"),
      System.import("chunks:///_virtual/NetRequestClover.ts"),
      System.import("chunks:///_virtual/NetClientClover.ts"),
      System.import("chunks:///_virtual/PlayerData.ts"),
      System.import("chunks:///_virtual/UIMgr.ts"),
      System.import("chunks:///_virtual/Common2.ts"),
      System.import("cc"),
      System.import("chunks:///_virtual/Config.ts"),
      System.import("chunks:///_virtual/ConfigLoader.ts"),
    ]);
    const [{ UILogin }, { OwnLoginRequestData }, { NetRequestClover },
      { NetClientClover }, { PlayerData }, { UIMgr }, { Common }, cc,
      { excel, remoteConfigPaths }, { ConfigLoader }] = modules;
    if (!UILogin || !OwnLoginRequestData || !NetRequestClover || !NetClientClover) {
      throw new Error("Native account-login modules are unavailable");
    }
    const prototype = UILogin.prototype;
    let registering = false;
    window.__ltzjStartLocalAccountLogin = function (ui, register) {
      if (registering) return;
      registering = register === true;
      ui.startOwnAccountLogin();
    };
    // The currently deployed server does not host 1.30.5 remote tables yet.
    // Use the verified 1.30.5 snapshot bundled with this APK for login setup.
    ConfigLoader.loadRemoteConfig = function (callback) {
      remoteConfigPaths.forEach(function (property, table) {
        const text = jsb.fileUtils.getStringFromFile("local-remote-config/" + table + ".json");
        if (!text) throw new Error("Missing bundled configuration: " + table);
        excel[property] = JSON.parse(text);
      });
      callback(100);
    };
    NetRequestClover.prototype.setUrl = function () {
      this.zoneUrl = endpoint;
      this.fullUrl = endpoint;
    };
    NetRequestClover.prototype.getSendData = function () {
      this.sequence = this._sequence;
      this.isEncrypt = false;
      const data = this.data;
      if (data && data.head && data.head.cmdId === 2) {
        return JSON.stringify(Object.assign({}, data, { password: data.__localPassword || "" }));
      }
      return JSON.stringify(data);
    };

    prototype.getUserName = function () {
      const value = this.userName && this.userName.string || "";
      PlayerData.instance.setAccount(value);
      return value;
    };
    prototype.checkReview = function () {
      Common.isReview = false;
      Common.isInReviewServer = false;
      this.resetZone();
      this.pipelineFlow();
    };
    prototype.checkHotUpdate = function () { this.pipelineFlow(); };
    prototype.doLogin = function () {
      const account = this.getUserName();
      const password = this.password && this.password.string || "";
      if (!account || !password) {
        registering = false;
        return this.pipelineFlow(!account ? "请输入账号" : "请输入密码");
      }
      const request = OwnLoginRequestData.create();
      request.account = account;
      request.register = registering;
      Object.defineProperty(request, "__localPassword", { value: password, configurable: true });
      NetClientClover.instance.sendLogin(request, false);
    };
    // Keep the original pipeline, but replace the two native SDK branches.
    prototype.xSdkInitAndLogin = prototype.doLogin;
    prototype.dyMgAppInitAndLogin = prototype.doLogin;
    prototype.doLoginSuccess = function () { this.pipelineFlow(); };

    const handleResponse = prototype.handleResponse;
    prototype.handleResponse = function (response) {
      if (registering && Number(response && response.responseCmdId) === 1002) {
        registering = false;
        this.pipelineFlow("注册成功，请使用账号密码登录");
        return true;
      }
      return handleResponse.apply(this, arguments);
    };
    const handleError = prototype.handleNetError;
    prototype.handleNetError = function () {
      registering = false;
      return handleError.apply(this, arguments);
    };
    function showAccountLogin(ui) {
      if (!ui || !ui.ownLoginNode) return;
      ui.ownLoginNode.active = true;
      // Registration is provided by the existing option row in native-local-backend.
      // Keep the original bottom sail button as the login entry.
    }
    const onEnable = prototype.onEnable;
    prototype.onEnable = function () {
      if (onEnable) onEnable.apply(this, arguments);
      showAccountLogin(this);
    };
    showAccountLogin(UIMgr.instance && UIMgr.instance.currentUI);
    console.log("[local-login] native account/password login installed");
  };
})();
