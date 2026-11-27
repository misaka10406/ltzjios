(function () {
    "use strict";

    const BACKEND_ORIGIN = "http://ltzj-server.ulccc.com:23081";
    const PROTOCOL_URL = BACKEND_ORIGIN + "/api/p.f";
    const blockedNativeClasses = [
        "ATJSBridge",
        "cn/gravity/engine/GravityEngineCocosCreatorAPI",
        "com/anythink/cocosjs/ATRewardedVideoJSBridge",
        "com/cocos/game/CloverUtils",
        "com/cocos/game/CocosCreatorProxyApi",
        "com/cocos/game/QiYuForCocos",
        "com/cocos/game/SECocosCreatorProxyApi",
        "com/cocos/game/UGSDKForCocos"
    ];

    function defaultReflectionResult(methodName, signature) {
        if (signature && signature.endsWith("Ljava/lang/String;")) {
            if (methodName === "checkAdStatus") return "{\"isLoading\":false}";
            if (methodName.indexOf("FetchRemoteConfig") >= 0) return "{\"data\":null}";
            return "{}";
        }
        if (signature && signature.endsWith(")Z")) return false;
        if (signature && /[)IJSBFD]$/.test(signature)) return 0;
        return undefined;
    }

    function installNativeBridgeGuard(cc) {
        const reflection = cc && cc.native && cc.native.reflection;
        if (!reflection || reflection.__localBackendGuarded) return;

        const originalCall = reflection.callStaticMethod.bind(reflection);
        reflection.callStaticMethod = function guardedCallStaticMethod(className, methodName, signature) {
            if (blockedNativeClasses.indexOf(className) >= 0) {
                console.log("[local-backend] skipped native SDK call: " + className + "." + methodName);
                return defaultReflectionResult(methodName, signature);
            }
            return originalCall.apply(null, arguments);
        };
        reflection.__localBackendGuarded = true;
    }

    function rewriteNetworkUrl(url) {
        const value = String(url || "");
        if (/^https?:\/\/[^/]+\/p\.f(?:[?#]|$)/i.test(value)) {
            return PROTOCOL_URL;
        }

        let match = value.match(
            /^https?:\/\/wxmini-cdn\.jj5agame\.com\/clover\/config\/([^/]+)\/([^/]+)\/([^/?#]+\.json)/i
        );
        if (match) {
            return BACKEND_ORIGIN + "/api/config/remote/" +
                encodeURIComponent(match[1]) + "/" +
                encodeURIComponent(match[2]) + "/" +
                encodeURIComponent(match[3]);
        }

        match = value.match(
            /^https?:\/\/wxmini-cdn\.jj5agame\.com\/clover\/notice\/cfg_news_news\.json/i
        );
        if (match) {
            return BACKEND_ORIGIN + "/api/config/remote/notice/pub/cfg_news_news.json";
        }
        return url;
    }

    function installNetworkRewrite() {
        if (XMLHttpRequest.prototype.__localBackendRewritten) return;
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function localBackendOpen(method, url) {
            const args = Array.prototype.slice.call(arguments);
            args[1] = rewriteNetworkUrl(url);
            return originalOpen.apply(this, args);
        };
        XMLHttpRequest.prototype.__localBackendRewritten = true;
    }

    // Keep only the hidden home preview, briefly; never reuse it after equipment changes.
    function installNativePreviewCache(MainPage, cc, NetClient, commands) {
        if (!cc || !cc.sys || !cc.sys.isNative || MainPage.prototype.__localPreviewCached) return;
        const originalPreInit = MainPage.prototype.preInit;
        const originalHide = MainPage.prototype.hide;
        let retained = null;
        function releaseRetained() {
            const preview = retained, state = preview && preview.__localPreviewState;
            if (!state) return;
            if (state.timer) { clearTimeout(state.timer); state.timer = null; }
            state.ready = false;
            if (preview.isValid !== false && preview.battleMgr) state.clear.call(preview);
        }
        if (NetClient && commands) {
            const battleIds = new Set(Object.entries(commands).filter(([name, value]) => typeof value === "number" && /^UpCmd.*(?:Start|Begin|Match|Enter|Join)/.test(name)).map(([, value]) => value));
            battleIds.add(2); battleIds.add(3);
            const send = NetClient.prototype.sendFront;
            NetClient.prototype.sendFront = function(request) {
                if (request && battleIds.has(request.protocolId)) releaseRetained();
                return send.apply(this, arguments);
            };
        }
        if (cc.director && cc.Director && cc.Director.EVENT_BEFORE_SCENE_LAUNCH) cc.director.on(cc.Director.EVENT_BEFORE_SCENE_LAUNCH, releaseRetained);
        function attach(page) {
            const preview = page.uiPlane;
            if (!preview || preview.__localPreviewState) return;
            const state = { key: null, ready: false, timer: null, clear: preview.clear };
            retained = preview;
            preview.__localPreviewState = state;
            const set = preview.setPlaneData;
            preview.setPlaneData = function(data, done, pause, extra, fail) {
                if (state.timer) { clearTimeout(state.timer); state.timer = null; }
                let key = null;
                try { key = JSON.stringify([data.toIdentifier(), !!pause, extra ?? null]); } catch (_) {}
                if (key && state.ready && state.key === key && this.battleMgr && this.battleMgr.isValid !== false && this.battleMgr.plane) {
                    if (this.battleMgr.planeMgr) this.battleMgr.planeMgr.setPlanePauseShoot(pause);
                    if (done) setTimeout(done, 0);
                    return;
                }
                state.ready = false;
                const complete = () => { state.key = key; state.ready = true; if (done) done(); };
                return set.call(this, data, complete, pause, extra, fail);
            };
        }
        MainPage.prototype.preInit = function() { attach(this); return originalPreInit.apply(this, arguments); };
        MainPage.prototype.hide = function() {
            const preview = this.uiPlane, state = preview && preview.__localPreviewState;
            if (!state || !state.ready || !preview.battleMgr) return originalHide.apply(this, arguments);
            const clear = preview.clear;
            preview.clear = function() {};
            try { return originalHide.apply(this, arguments); }
            finally {
                preview.clear = clear;
                if (state.timer) clearTimeout(state.timer);
                state.timer = setTimeout(() => { state.timer = null; state.ready = false; if (!preview.isValid) return; clear.call(preview); }, 20000);
            }
        };
        MainPage.prototype.__localPreviewCached = true;
    }

    window.__prepareNativeLocalBackend = function prepareNativeLocalBackend(cc) {
        installNativeBridgeGuard(cc);
        installNetworkRewrite();
        // Cocos 3.8.8 native binding takes the output buffer before count.
        // Game scripts use the public Spine API: (slot, start, count, buffer, ...).
        const vertexPrototype = globalThis.spine && globalThis.spine.VertexAttachment.prototype;
        if (vertexPrototype && !vertexPrototype.__localVertexOrderFixed) {
            const nativeCompute = vertexPrototype.computeWorldVertices;
            vertexPrototype.computeWorldVertices = function (slot, start, count, buffer, offset, stride) {
                return nativeCompute.call(this, slot, start, buffer, count, offset, stride);
            };
            vertexPrototype.__localVertexOrderFixed = true;
            console.log("[local-backend] native Spine vertex argument order fixed");
        }
        window.__nativeLocalCC = cc;
        window.cloverEnv = {
            channel: "android-local",
            env: "prod",
            cdnBaseUrl: BACKEND_ORIGIN,
            isOpt: false
        };
    };

    window.__installNativeLocalBackend = async function installNativeLocalBackend() {
        const [
            requestModule,
            loginModule,
            ownLoginModule,
            clientModule,
            playerModule,
            uiModule,
            loadingModule,
            commonModule,
            appPlatformModule,
            mainPageModule,
            guildButtonModule,
            guildPlayerModule,
            friendModule,
            configModule,
            configLoaderModule
        ] = await Promise.all([
            System.import("chunks:///_virtual/NetRequestClover.ts"),
            System.import("chunks:///_virtual/UILogin.ts"),
            System.import("chunks:///_virtual/OwnLoginRequestData.ts"),
            System.import("chunks:///_virtual/NetClientClover.ts"),
            System.import("chunks:///_virtual/PlayerData.ts"),
            System.import("chunks:///_virtual/UIMgr.ts"),
            System.import("chunks:///_virtual/PopupLoadingEnums.ts"),
            System.import("chunks:///_virtual/Common2.ts"),
            System.import("chunks:///_virtual/AppPlatform.ts"),
            System.import("chunks:///_virtual/UIMainPage.ts"),
            System.import("chunks:///_virtual/GuildButtonComponent.ts"),
            System.import("chunks:///_virtual/GuildPlayerData.ts"),
            System.import("chunks:///_virtual/NFriend.ts"),
            System.import("chunks:///_virtual/Config.ts"),
            System.import("chunks:///_virtual/ConfigLoader.ts")
        ]);

        const NetRequestClover = requestModule.NetRequestClover;
        const UILogin = loginModule.UILogin;
        const OwnLoginRequestData = ownLoginModule.OwnLoginRequestData;
        const NetClientClover = clientModule.NetClientClover;
        const PlayerData = playerModule.PlayerData;
        const UIMgr = uiModule.UIMgr;
        const LoadingStep = loadingModule.LoadingStep;
        const BgType = loadingModule.BgType;
        const Common = commonModule.Common;
        const AppPlatform = appPlatformModule.AppPlatform;
        const UIMainPage = mainPageModule.UIMainPage;
        const GuildButtonComponent = guildButtonModule.GuildButtonComponent;
        const GuildPlayerData = guildPlayerModule.GuildPlayerData;
        const NFriend = friendModule.NFriend;
        const FriendData = (await System.import("chunks:///_virtual/FriendData.ts")).FriendData;
        installNativePreviewCache(UIMainPage, window.__nativeLocalCC, NetClientClover, (await System.import("chunks:///_virtual/NetCmdEnum.ts")).NetCmdEnum);

        if (NetRequestClover.prototype.__localBackendPatched) return;

        const guideModule = await System.import("chunks:///_virtual/GuideMgr.ts");
        const guideEnums = await System.import("chunks:///_virtual/GuideEnums.ts");
        const originalShouldSkipGuide = guideModule.GuideMgr.prototype.shouldSkipGuide;
        guideModule.GuideMgr.prototype.shouldSkipGuide = function shouldSkipLegacySplitGuide(step) {
            // Legacy login progress can replay the split tutorial on every login.
            // Use the normal guide advancement path, including its server update.
            if (step && (step.guideID === guideEnums.GuideStep.EquipSplit ||
                step.guideID === guideEnums.GuideStep.EquipSplitFromMix)) {
                console.log("[local-backend] skipped legacy split tutorial: " + step.guideID);
                return true;
            }
            return originalShouldSkipGuide.apply(this, arguments);
        };

        // 1.30.5: the current server has no versioned remote-config mirror yet.
        // Load the matching public snapshot bundled inside this APK.
        configLoaderModule.ConfigLoader.loadRemoteConfig = function loadBundledRemoteConfig(callback) {
            configModule.remoteConfigPaths.forEach(function (property, table) {
                const text = jsb.fileUtils.getStringFromFile("local-remote-config/" + table + ".json");
                if (!text) throw new Error("Missing 1.30.5 bundled config: " + table);
                configModule.excel[property] = JSON.parse(text);
            });
            callback(100);
        };


        const simulatedRewardedVideoAds = Object.freeze({
            0: "IdleBonus",
            1: "ADEnergy",
            2: "ADReborn",
            3: "ADSummaryDouble",
            8: "ADNormalBox",
            9: "ADHighBox",
            10: "ADSweepDouble"
        });
        let rewardedVideoPending = false;

        NetRequestClover.prototype.setUrl = function setLocalBackendUrl() {
            this.zoneUrl = PROTOCOL_URL;
            this.fullUrl = PROTOCOL_URL;
        };
        NetRequestClover.prototype.getSendData = function getLocalBackendSendData() {
            this.sequence = this._sequence;
            this.isEncrypt = false;
            let payload = this.data;
            if (payload && payload.head && payload.head.cmdId === 2) {
                payload = Object.assign({}, payload, {
                    password: payload.__localPassword || "",
                    register: payload.register === true
                });
            }
            return JSON.stringify(payload);
        };

        let activeLoginUI = null;
        let pendingRegister = false;
        let pendingLoginCredentials = null;
        let loginFieldsInitialized = false;

        function getLocalStorage() {
            const cc = window.__nativeLocalCC;
            return cc && cc.sys && cc.sys.localStorage
                ? cc.sys.localStorage
                : null;
        }

        function readLocalValue(key) {
            try {
                const storage = getLocalStorage();
                return storage ? String(storage.getItem(key) || "") : "";
            } catch (_) {
                return "";
            }
        }

        function writeLocalValue(key, value) {
            try {
                const storage = getLocalStorage();
                storage && storage.setItem(key, String(value || ""));
            } catch (_) {}
        }

        function removeLocalValue(key) {
            try {
                const storage = getLocalStorage();
                storage && storage.removeItem(key);
            } catch (_) {}
        }

        function clearAutoLoginState() {
            [
                "autoLogin",
                "auto_login",
                "nextAutoLogin",
                "rememberLogin",
                "remember_login",
                "isAutoLogin",
                "loginAuto"
            ].forEach(removeLocalValue);
        }

        function hasSuccessfulLoginCredentials() {
            return readLocalValue("loginSuccess") === "1";
        }

        function getNodeText(node) {
            const parts = [String(node && node.name || "")];
            const components = node && (node.components || node._components) || [];
            for (let i = 0; i < components.length; i += 1) {
                const component = components[i];
                if (!component) continue;
                if (typeof component.string === "string") parts.push(component.string);
                if (typeof component.text === "string") parts.push(component.text);
            }
            return parts.join(" ");
        }

        function getSubtreeText(node) {
            let result = getNodeText(node);
            const children = node && node.children || [];
            for (let i = 0; i < children.length; i += 1) {
                result += " " + getSubtreeText(children[i]);
            }
            return result;
        }

        function findAutoLoginNodes(root) {
            const found = [];
            const marker = /login008|auto.?login|remember.?login|next.?login|login.?check|自动登录|下次登录/i;
            const visit = node => {
                if (!node) return;
                if (marker.test(getNodeText(node))) found.push(node);
                const children = node.children || [];
                for (let i = 0; i < children.length; i += 1) {
                    visit(children[i]);
                }
            };
            visit(root);
            return found;
        }

        function findAutoLoginOption(loginUI) {
            const root = loginUI && loginUI.ownLoginNode;
            if (!root) return null;
            const searchRoot = loginUI.node || root;
            const optionNodes = findAutoLoginNodes(searchRoot);
            return optionNodes.length > 0 ? optionNodes[0] : null;
        }

        function bindRegisterOption(loginUI) {
            const root = loginUI && loginUI.ownLoginNode;
            const cc = window.__nativeLocalCC;
            const Node = cc && cc.Node;
            const UITransform = cc && cc.UITransform;
            if (!root || !Node || !UITransform) return null;
            const optionNode = findAutoLoginOption(loginUI);
            if (!optionNode) return null;

            // Keep the original node and its transform in place. Disabling
            // only the checkbox Sprite avoids the Layout reflow caused by
            // adding or removing children from the login prefab.
            const Sprite = cc.Sprite;
            const sprite = Sprite && optionNode.getComponent
                ? optionNode.getComponent(Sprite)
                : null;
            if (sprite) sprite.enabled = false;
            const optionTransform = optionNode.getComponent
                ? optionNode.getComponent(UITransform)
                : null;
            if (optionTransform) {
                // Reuse the prefab node as a transparent hit target for the
                // full baked label. No child is added, so the login layout
                // constraints remain unchanged.
                optionTransform.setContentSize(320, 70);
                const position = optionNode.position;
                optionNode.setPosition(75, position.y, position.z);
            }

            // The 1.30.5 prefab still contains the original auto-login caption.
            // Keep its hit-target transform, and replace only its visual caption.
            if (cc.Label && !optionNode.__localRegisterLabel) {
                // The checkbox background and baked caption are sibling nodes
                // in 1.30.5, rather than children of the checkbox foreground.
                // Disable only renderers on this row; keep layout nodes intact.
                const rowY = optionNode.worldPosition.y;
                let hiddenRenderers = 0;
                const hideOriginalOptionRow = function (node) {
                    if (node !== root && Math.abs(node.worldPosition.y - rowY) <= 24) {
                        [cc.Sprite, cc.Label, cc.RichText].forEach(function (type) {
                            const component = type && node.getComponent && node.getComponent(type);
                            if (component && component.enabled) {
                                component.enabled = false;
                                hiddenRenderers += 1;
                            }
                        });
                    }
                    (node.children || []).forEach(hideOriginalOptionRow);
                };
                hideOriginalOptionRow(root);
                console.log("[local-backend] replaced auto-login row renderers: " + hiddenRenderers);
                const hideCaption = function (node) {
                    const sprite = cc.Sprite && node.getComponent && node.getComponent(cc.Sprite);
                    if (sprite) sprite.enabled = false;
                    const label = node.getComponent && node.getComponent(cc.Label);
                    if (label) label.enabled = false;
                    (node.children || []).forEach(hideCaption);
                };
                (optionNode.children || []).forEach(hideCaption);
                // The remaining checkbox outline and caption are baked into
                // the panel texture. Cover this row before drawing our label.
                if (cc.Graphics) {
                    const background = new Node("LocalRegisterBackground");
                    background.addComponent(UITransform).setContentSize(320, 70);
                    const graphics = background.addComponent(cc.Graphics);
                    graphics.fillColor = new cc.Color(8, 39, 76, 255);
                    graphics.roundRect(-160, -35, 320, 70, 6);
                    graphics.fill();
                    optionNode.addChild(background);
                    background.setPosition(0, 0, 0);
                }
                const caption = new Node("LocalRegisterLabel");
                caption.addComponent(UITransform).setContentSize(320, 70);
                const label = caption.addComponent(cc.Label);
                label.string = "注册账号";
                label.fontSize = 28;
                label.lineHeight = 40;
                label.color = new cc.Color(100, 220, 255, 255);
                label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
                label.verticalAlign = cc.Label.VerticalAlign.CENTER;
                optionNode.addChild(caption);
                caption.setPosition(0, 0, 0);
                optionNode.__localRegisterLabel = caption;
            }

            const touchEnd = Node.EventType && Node.EventType.TOUCH_END
                ? Node.EventType.TOUCH_END
                : "touch-end";
            if (optionNode.__localRegisterTouchBound) return optionNode;
            optionNode.on(touchEnd, event => {
                if (event && typeof event.stopPropagation === "function") event.stopPropagation();
                if (!activeLoginUI) return;
                if (window.__ltzjStartLocalAccountLogin) {
                    window.__ltzjStartLocalAccountLogin(activeLoginUI, true);
                    return;
                }
                if (pendingRegister) return;
                pendingRegister = true;
                activeLoginUI.startOwnAccountLogin();
            });
            optionNode.__localRegisterTouchBound = true;
            return optionNode;
        }

        function showOwnLoginNode(loginUI) {
            if (loginUI && loginUI.ownLoginNode) {
                activeLoginUI = loginUI;
                loginUI.ownLoginNode.active = true;
                clearAutoLoginState();
                if (!loginFieldsInitialized) {
                    if (hasSuccessfulLoginCredentials()) {
                        const storedAccount = readLocalValue("account");
                        const storedPassword = readLocalValue("password");
                        if (loginUI.userName) loginUI.userName.string = storedAccount;
                        if (loginUI.password) loginUI.password.string = storedPassword;
                    } else {
                        if (loginUI.userName) loginUI.userName.string = "";
                        if (loginUI.password) loginUI.password.string = "";
                    }
                    loginFieldsInitialized = true;
                }
                bindRegisterOption(loginUI);
                window.__h5RegisterMobileLoginEditBoxes?.(
                    [loginUI.userName, loginUI.password],
                    loginUI.ownLoginNode,
                    loginUI,
                );
            }
        }

        const originalOnEnable = UILogin.prototype.onEnable;
        UILogin.prototype.onEnable = function enableLocalLogin() {
            if (typeof originalOnEnable === "function") {
                originalOnEnable.apply(this, arguments);
            }
            showOwnLoginNode(this);
        };

        UILogin.prototype.checkReview = function skipReviewCheck() {
            Common.isReview = false;
            Common.isInReviewServer = false;
            UIMgr.instance.setMainPageLoadingStep(LoadingStep.CheckReview, BgType.Cover);
            this.resetZone();
            this.pipelineFlow();
        };
        UILogin.prototype.checkHotUpdate = function skipHotUpdate() {
            this.pipelineFlow();
        };

        function doLocalLogin() {
            window.__h5SyncMobileLoginInputs?.();
            UIMgr.instance.setMainPageLoadingStep(LoadingStep.Login, BgType.Cover);
            const account = this.userName && typeof this.userName.string === "string"
                ? this.userName.string.trim()
                : "";
            const password = this.password && typeof this.password.string === "string"
                ? this.password.string
                : "";

            PlayerData.instance.setAccount(account);
            if (!account) {
                pendingRegister = false;
                this.pipelineFlow("请输入用户名");
                return;
            }
            if (!password) {
                pendingRegister = false;
                this.pipelineFlow("请输入密码");
                return;
            }

            pendingLoginCredentials = pendingRegister
                ? null
                : {account: account, password: password};

            const request = OwnLoginRequestData.create();
            request.account = account;
            request.register = pendingRegister === true;
            Object.defineProperty(request, "__localPassword", {
                configurable: true,
                enumerable: false,
                value: password
            });
            NetClientClover.instance.sendLogin(request, false);
        }

        UILogin.prototype.doLogin = doLocalLogin;
        UILogin.prototype.xSdkInitAndLogin = doLocalLogin;
        UILogin.prototype.dyMgAppInitAndLogin = doLocalLogin;

        const originalHandleResponse = UILogin.prototype.handleResponse;
        UILogin.prototype.handleResponse = function handleLocalLoginResponse(response) {
            const responseCommandID = Number(response && response.responseCmdId);
            if (pendingRegister && responseCommandID === 1002) {
                pendingRegister = false;
                pendingLoginCredentials = null;
                showOwnLoginNode(this);
                this.pipelineFlow("注册成功，请使用账号密码登录");
                return true;
            }
            if (!pendingRegister && responseCommandID === 1002 && pendingLoginCredentials) {
                writeLocalValue("account", pendingLoginCredentials.account);
                writeLocalValue("password", pendingLoginCredentials.password);
                writeLocalValue("loginSuccess", "1");
                pendingLoginCredentials = null;
            }
            return originalHandleResponse.apply(this, arguments);
        };

        const originalHandleNetError = UILogin.prototype.handleNetError;
        UILogin.prototype.handleNetError = function handleLocalLoginError(error) {
            pendingRegister = false;
            pendingLoginCredentials = null;
            showOwnLoginNode(this);
            return originalHandleNetError.apply(this, arguments);
        };

        function getFullGuildName() {
            const guildInfo = GuildPlayerData && GuildPlayerData.instance
                ? GuildPlayerData.instance.guildInfo
                : null;
            return guildInfo && typeof guildInfo.guildName === "string"
                ? guildInfo.guildName.trim()
                : "";
        }

        function getPlayerDisplayName() {
            // Use the same current-player profile as the avatar details page.
            // PlayerData has no nickname field in 1.30.5.
            const me = FriendData.getMe();
            if (me && typeof me.showName === "string" && me.showName.trim()) {
                return me.showName;
            }
            return PlayerData.instance.nickname || PlayerData.instance.defaultName || "";
        }

        function refreshMainPagePlayerName(mainPage) {
            if (!mainPage || !mainPage.playerNameLabel) return;
            const playerName = getPlayerDisplayName();
            const guildName = getFullGuildName();
            mainPage.playerNameLabel.string = guildName
                ? "[" + guildName + "] " + playerName
                : playerName;
        }

        // Index carries the saved nickname, but 1.30.5 does not copy it to
        // the current-player friend profile until the details page is loaded.
        const netHandleModule = await System.import("chunks:///_virtual/NetHandleCloverImpl.ts");
        const originalIdentityResponse = netHandleModule.NetHandleCloverImpl.prototype.handleResponse;
        netHandleModule.NetHandleCloverImpl.prototype.handleResponse = function syncIndexNickname(response) {
            if (Number(response && response.responseCmdId) === 1001) {
                const player = response.data && response.data.playerPo;
                if (player && typeof player.nick === "string" && player.nick.trim()) {
                    const me = FriendData.getMe();
                    if (me) me.gName = player.nick;
                }
            }
            return originalIdentityResponse.apply(this, arguments);
        };

        const rankPageModule = await System.import("chunks:///_virtual/UIEndlessFriendRank.ts");
        const gameFriendsModule = await System.import("chunks:///_virtual/GameFriendsMgr.ts");
        const rankPrototype = rankPageModule.UIEndlessFriendRank.prototype;
        function refreshNativeRankVisibility(page) {
            if (page.friendList) page.friendList.node.active = true;
            if (page.dragScrollBar) page.dragScrollBar.active = true;
            if (page.listNode) page.listNode.active = false;
            if (page.subContextView) page.subContextView.node.active = false;
            if (page.subScrollNode) page.subScrollNode.active = false;
        }
        function loadNativeEndlessRank(page, tabIndex) {
            page.curTabIndex = tabIndex;
            const firstToggle = page.toggleContainer && page.toggleContainer.toggleItems[0];
            const checkedNode = firstToggle && firstToggle.checkMark && firstToggle.checkMark.node;
            if (checkedNode) {
                if (!page.__localWorldRankCheck) {
                    const findWorld = function (node) {
                        if (node.name === "Toggle2") return node;
                        for (const child of node.children) {
                            const found = findWorld(child);
                            if (found) return found;
                        }
                        return null;
                    };
                    const worldNode = findWorld(page.node);
                    if (worldNode) {
                        const clone = window.__nativeLocalCC.instantiate(checkedNode);
                        clone.parent = worldNode;
                        clone.getComponentsInChildren(window.__nativeLocalCC.Label).forEach(function (label) { label.string = "世界排行"; });
                        page.__localWorldRankCheck = clone;
                    }
                }
                checkedNode.active = tabIndex === 0;
                if (page.__localWorldRankCheck) page.__localWorldRankCheck.active = tabIndex === 1;
            }
            refreshNativeRankVisibility(page);
            const token = page.__localRankToken = (page.__localRankToken || 0) + 1;
            const request = gameFriendsModule.GameFriendsMgr.instance.sendFriendRankRequestData(tabIndex === 0 ? 1 : 2);
            if (!request) return;
            request.callback = function (response) {
                if (page.__localRankToken !== token || !window.__nativeLocalCC.isValid(page.node)) return;
                if (!response.success) {
                    UIMgr.instance.showTips("排行榜加载失败，请稍后重试");
                    return;
                }
                const rows = response.data && response.data.ranksBaseInfo;
                if (!Array.isArray(rows)) return;
                page.friendList.array = rows.map(function (entry, index) {
                    const friend = new NFriend();
                    friend.load(entry.baseInfo);
                    friend.endlessRanking = entry.score;
                    friend.endlessRankIndex = index + 1;
                    return friend;
                });
                console.log("[local-backend] loaded " + (tabIndex === 0 ? "friend" : "world") + " endless ranks: " + rows.length);
            };
        }
        rankPrototype.refreshUI = function refreshNativeRanks() { refreshNativeRankVisibility(this); };
        rankPrototype.showAppTips = function showNativeWorldRanks() { loadNativeEndlessRank(this, 1); };
        rankPrototype.onToggleCheckEvent = function switchNativeRankTab(toggle) {
            if (!toggle || !toggle.isChecked) return;
            const index = this.toggleContainer.toggleItems.indexOf(toggle);
            loadNativeEndlessRank(this, index === 0 ? 0 : 1);
        };
        const originalRankInit = rankPrototype.doInit;
        rankPrototype.doInit = function initNativeEndlessRanks() {
            originalRankInit.apply(this, arguments);
            if (!this.__localFriendRankTapBound && this.toggleContainer && this.toggleContainer.toggleItems[0]) {
                this.toggleContainer.toggleItems[0].node.on(window.__nativeLocalCC.Node.EventType.TOUCH_END, function () {
                    loadNativeEndlessRank(this, 0);
                }, this);
                this.__localFriendRankTapBound = true;
            }
            loadNativeEndlessRank(this, 0);
        };
        const originalRankHide = rankPrototype.hide;
        rankPrototype.hide = function hideNativeEndlessRanks() {
            this.__localRankToken = (this.__localRankToken || 0) + 1;
            return originalRankHide.apply(this, arguments);
        };

        function installFullGuildNameForOwnRank() {
            if (!NFriend || !NFriend.prototype || NFriend.prototype.__localFullGuildNamePatched) return;
            const originalGuildShortAndName = NFriend.prototype.guildShortAndName;
            if (typeof originalGuildShortAndName !== "function") return;
            NFriend.prototype.guildShortAndName = function localFullGuildName(showLimit = true, maxLength) {
                if (this && typeof this.isMe === "function" && this.isMe()) {
                    const guildName = getFullGuildName();
                    if (guildName) {
                        const displayName = this.showName || this.wName || "";
                        const fullName = "[" + guildName + "]" + displayName;
                        return fullName;
                    }
                }
                return originalGuildShortAndName.call(this, showLimit, maxLength);
            };
            NFriend.prototype.__localFullGuildNamePatched = true;
        }

        installFullGuildNameForOwnRank();

        if (UIMainPage && UIMainPage.prototype) {
            const refreshMainPageEndlessScore = mainPage => {
                if (!mainPage || !mainPage.endlessWeekScoreLabel || !PlayerData || !PlayerData.instance) return;
                const score = Number(PlayerData.instance.endlessWeekHighScore);
                if (Number.isFinite(score)) {
                    mainPage.endlessWeekScoreLabel.string = Math.floor(score).toString();
                }
            };
            const scheduleMainPageEndlessScore = mainPage => {
                refreshMainPageEndlessScore(mainPage);
                if (typeof mainPage.scheduleOnce === "function") {
                    mainPage.scheduleOnce(() => refreshMainPageEndlessScore(mainPage), 0);
                }
            };
            const originalMainPreInit = UIMainPage.prototype.preInit;
            UIMainPage.prototype.preInit = function refreshEndlessScoreOnPreInit() {
                if (typeof originalMainPreInit === "function") {
                    originalMainPreInit.apply(this, arguments);
                }
                scheduleMainPageEndlessScore(this);
            };
            const originalMainDoInit = UIMainPage.prototype.doInit;
            UIMainPage.prototype.doInit = function refreshEndlessScoreOnInit() {
                if (typeof originalMainDoInit === "function") {
                    originalMainDoInit.apply(this, arguments);
                }
                scheduleMainPageEndlessScore(this);
            };
            const originalMainHandleResponse = UIMainPage.prototype.handleResponse;
            UIMainPage.prototype.handleResponse = function refreshEndlessScoreOnIndex(response) {
                if (typeof originalMainHandleResponse === "function") {
                    originalMainHandleResponse.apply(this, arguments);
                }
                if (Number(response && response.responseCmdId) === 1001) {
                    scheduleMainPageEndlessScore(this);
                }
            };
            const originalRefreshUserInfo = UIMainPage.prototype.refreshUserInfo;
            UIMainPage.prototype.refreshUserInfo = function refreshFullPlayerIdentity() {
                if (typeof originalRefreshUserInfo === "function") {
                    originalRefreshUserInfo.apply(this, arguments);
                }
                refreshMainPagePlayerName(this);
                refreshMainPageEndlessScore(this);
            };
        }

        if (GuildButtonComponent && GuildButtonComponent.prototype) {
            const originalRefreshGuildButton = GuildButtonComponent.prototype.refreshUI;
            GuildButtonComponent.prototype.refreshUI = function refreshFullGuildName() {
                if (typeof originalRefreshGuildButton === "function") {
                    originalRefreshGuildButton.apply(this, arguments);
                }
                const guildName = getFullGuildName();
                if (guildName && this.shortNameLabel) {
                    this.shortNameLabel.string = "[" + guildName + "]";
                }
                const currentUI = UIMgr.instance && UIMgr.instance.currentUI;
                if (UIMainPage && currentUI instanceof UIMainPage) {
                    refreshMainPagePlayerName(currentUI);
                }
            };
        }

        if (AppPlatform && AppPlatform.prototype) {
            AppPlatform.prototype.initLauncherOption = function disableAds() {};
            AppPlatform.prototype.registerPayCallback = function disableChannelPay() {};
            AppPlatform.prototype.requestPurchase = function simulateVoucherPurchase(
                orderId,
                price,
                description,
                successCallback
            ) {
                console.log(
                    "[local-backend] simulated voucher purchase completed: " +
                    orderId + " (" + price + ", " + description + ")"
                );
                if (typeof successCallback === "function") {
                    successCallback(orderId);
                }
            };
            AppPlatform.prototype.requestPurchase.__localBackendVoucherSimulated = true;
            AppPlatform.prototype.initSolarEngine = function disableSolarEngine() {};
            AppPlatform.prototype.loginSolarEngine = function disableSolarEngineLogin() {};
            AppPlatform.prototype.login007 = function disableSecuritySdk() {};
            AppPlatform.prototype.loginBugly = function disableBugly() {};
            AppPlatform.prototype.loginCustomerService = function disableCustomerService() {};
            AppPlatform.prototype.trackLogin = function disableChannelTracking() {};
            AppPlatform.prototype.doRewardedVideoAd = function simulateRewardedVideoAd(
                adId,
                successCallback,
                failCallback
            ) {
                const normalizedAdId = Number(adId);
                const adName = simulatedRewardedVideoAds[normalizedAdId];
                if (!Object.prototype.hasOwnProperty.call(simulatedRewardedVideoAds, normalizedAdId)) {
                    console.warn("[local-backend] unsupported rewarded video ad: " + adId);
                    if (typeof failCallback === "function") {
                        failCallback({
                            code: "LOCAL_AD_UNSUPPORTED",
                            message: "unsupported rewarded video ad"
                        });
                    }
                    return;
                }
                if (rewardedVideoPending) {
                    console.warn("[local-backend] ignored duplicate rewarded video request: " + adName);
                    return;
                }

                if (this.adLoadTimer) {
                    clearTimeout(this.adLoadTimer);
                    this.adLoadTimer = 0;
                }
                this.adLoadCallBack = null;
                this.videoAdCallback = null;
                this.videoAdFailCallback = null;
                this.canReward = false;
                rewardedVideoPending = true;

                console.log(
                    "[local-backend] simulated rewarded video completed: " +
                    adName + " (" + normalizedAdId + ")"
                );
                setTimeout(function completeSimulatedRewardedVideo() {
                    try {
                        if (typeof successCallback === "function") {
                            successCallback();
                        }
                    } catch (error) {
                        console.error(
                            "[local-backend] rewarded video success callback failed: " + adName,
                            error
                        );
                    } finally {
                        setTimeout(function releaseRewardedVideoLock() {
                            rewardedVideoPending = false;
                        }, 600);
                    }
                }, 350);
            };
            AppPlatform.prototype.doRewardedVideoAd.__localBackendSimulated = true;
        }

        showOwnLoginNode(UIMgr.instance && UIMgr.instance.currentUI);
        NetRequestClover.prototype.__localBackendPatched = true;
        console.log("[local-backend] native package bridge enabled: " + PROTOCOL_URL);
    };
})();
