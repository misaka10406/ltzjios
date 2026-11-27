# 网页资源生成原生 Cocos iOS IPA：复建说明

最终版本：1.30.5（7）。最后整理：2026-11-27。

## 下次最快生成

本目录已经是可继续构建的最终项目。资源在 `build-input/data`，最终适配代码在 `runtime`。普通修改不需要重新提取网页资源，不要重新覆盖原生模板。

Windows 在本项目的上一级目录执行：

```powershell
python native-ios/runtime/patch_resources.py
node native-ios/tools/test-account-actions.cjs
node native-ios/tools/test-native-boot.js
node native-ios/tools/test-native-platform.js
node native-ios/tools/test-portable-ns.js
```

需要修改服务器时编辑 `build-input/data/local-server.json`。目前为 `http://ltzj-server.ulccc.com:23081`。修改适配脚本应编辑 `runtime`，然后执行覆盖脚本；只修改 build-input 中的同名脚本会被后续覆盖。

在 Mac（完整 Xcode、Node.js、Python 3、CMake、Git）中，从本目录执行：

```sh
bash tools/build-mac.sh
```

脚本获取官方 cocos-engine `v3.8.8`、external `v3.8.8-2`，编译 arm64 Release。输出 `dist/LTZJNative-unsigned.ipa`。请预留至少 25 GB 磁盘空间。IPA 未签名，需使用自己的签名工具签名安装。

## 目录与保留规则

- `project`：最终 iOS/通用原生模板，含启动诊断、Security 安全随机数桥接、图标、竖屏与网络配置。
- `build-input/data`：完整内置游戏资源，也是离线复建必需输入。不要当缓存删除。
- `build-input/proj`：构建所需配置；`source-manifest.json` 记录原资源来源。
- `runtime`：最终启动、服务器及账号适配、原 NS 模块的 JavaScript 移植、Metal 着色器资源补齐脚本和许可证。
- `config`：原生编译选项和 GitHub Actions 工作流。
- `tools`：仍可复用的资源准备、编译、测试、打包、上传和校验脚本。
- `dist`：只保留最终版本 7 IPA、SHA256 和验证记录。
- `vendor`、`build`、旧的 `native-ios-delivery` 都是可再生成的下载、缓存或交付中间产物。

原网页资源、Android 客户端、服务端目录属于输入及其他项目，本次整理不删除。

## 第一次转换所做的工作

输入目录：
`server-1.30.5/整理交付-1.30.5/02-客户端及配套资源/服务器配套/www/wwwroot/thunderfighter-h5`

1. 确认 Cocos Creator 版本为 3.8.8。复制 assets、src、jsb-adapter 等资源到独立 build-input/data，不改原资源。155 个加密 .jsc 都有同名明文 .js，因此只保留明文，并关闭资源包 encrypted 标记。
2. 使用官方同版本 iOS 原生模板，V8 + JSB + Metal；不是 WKWebView。保留游戏 JavaScript 逻辑，由原生引擎负责渲染。
3. 复用同版本 Android 的协议适配、远程配置快照及本地账号接口，按 iOS 缺失的渠道 SDK 添加防护。服务器通信为 `/api/p.f`，账号密码登录/注册由本地适配处理。
4. 原生导入映射必须将 cc 指向 `./cocos-js/cc.954ce.js`，不能用网页的虚拟 cc 模块。移除网页 renderMode 强制项。
5. 游戏场景运行前，在 onPostProjectInitDelegate 安装 backend 和账号适配。诊断层等待 UILogin 实际激活后才隐藏，超时显示场景及错误。
6. 通用引擎没有 Android 专用 NativeEncrypt，iOS 又会跳过原 Wasm 初始化。将原资源 `076d9b02-40fb-4e8c-adab-b6458c16c5a2.97e86.bin` 内的 Wasm 经 Binaryen 123.0.0 wasm2js -O 移植为 JavaScript，保持 ns.ts 模块入口。随机数据使用 Apple SecRandomCopyBytes，不用 Math.random 代替安全随机数。30 组加密/解码和 1000 次数值键对照测试通过。
7. 资源缺少调试绘制所需效果，原生 initDebugRenderer 曾触发空指针崩溃。cfg.cmake 强制关闭 USE_DEBUG_RENDERER、USE_GEOMETRY_RENDERER、USE_OCCLUSION_QUERY。必须保留这三个配置及二进制回归校验。
8. 网页/Android 资源只有 glsl1/glsl3，Metal 路径使用 glsl4，导致游戏音乐、点击正常但画面黑屏。patch_metal_shaders.py 根据原始反射信息补齐 14 个 GLSL 450 着色器的 set/binding/location。56 组阶段/宏组合曾通过 glslang SPIR-V 编译。升级资源后须重新检查新增效果、绑定和宏组合，不能假设所有其他游戏都适用。
9. 两套账号适配曾分别维护注册标记，造成按钮写着注册却发送登录。最终统一注册入口，只保留原界面内一个“注册账号”，点击发送 register=true；底部“点击立即启航”仍发送登录请求。注册完成或报错后重置标记。

仅当确实需要从零重提取时，使用 `tools/prepare.py --source <资源目录>`。它要求 build-input/data 不存在；先妥善保留当前最终项目再操作。它依赖旁边 `server-1.30.5/client-android` 的配套配置，生成结束必须覆盖最终 runtime。更换资源版本时需要检查硬编码的文件哈希名、引擎版本、NS 模块及 shader 绑定。

## GitHub Actions 复建

仓库 `misaka10406/ltzjios`，分支 `native-ios`，工作流配置 `config/native-ios.yml`。本机上传脚本使用已经登录的 GitHub 凭据，不在工程里保存 token。仓库公开，上传新资源前应确认其公开范围。

当前已有不可变草稿 Release `native-ios-inputs-20261126`，保存初始完整资源的分片。工作流只提取其中 build-input，再覆盖分支上最新 runtime 和 config，因此脚本修复不必再次上传 2 GB 资源。

Windows 从项目上一级执行 `./native-ios/tools/upload_actions.ps1`，即可上传代码并触发构建。清理后的本地不再保留分片，上传脚本允许复用远端已有输入 Release。

如果是新仓库或更换了资源：先运行 `tools/package.py`、`tools/split_delivery.py`，改用新的输入 Release 标签，并同步修改上传脚本和工作流下载标签。不能把新资源直接覆盖旧不可变分片。原上传脚本对已有同名同大小分片会跳过，因此更新标签是必要步骤。

本次成功的引擎编译为 run 45920296546。最终版本 6 只改 JavaScript 与 Info.plist 版本号，沿用该次已编译二进制；其来源不应误写为重新编译的版本 6。

长构建约每 10 分钟检查一次状态即可。完成后可下载 Release 中的 IPA 分片与 ipa-parts.json 合并，并校验 SHA256；也可下载小体积 artifact `LTZJNative-binary-only`，用本地最终资源组装：

```powershell
python native-ios/tools/verify_pipeline_binary.py <binary-only.zip> --expect-disabled
python native-ios/tools/assemble_bootfix.py --run <编译run编号> --binary <binary-only.zip> --output <输出ipa路径>
```

如果仅更新脚本而复用旧二进制，需同步 bare app 内 Info.plist 的 CFBundleVersion，并记录真实编译来源。不要假设 --run 参数会改变二进制或版本号。

## 打包时的坑与校验

- external 稀疏下载必须包含 `ios sources cmake mac/bin`，否则缺 host SWIG。
- 使用 CUSTOM_COPY_RESOURCE_HOOK 避免 CMake 枚举大量资源，但实际拷贝由 build-mac.sh 完成。
- 精确选择 `build/xcode/Release-iphoneos/LTZJNative-mobile.app`；不要随意选 find 返回的第一个 .app，曾误打出只有资源、没有可执行程序的包。
- 先保存不含游戏资源的 bare app，再拷贝游戏数据；校验 Info.plist、Bundle ID、arm64 可执行文件、游戏脚本及资源。
- assemble_bootfix.py 会校验最终脚本与本地 staged 文件一致，并检查全部 14 个 glsl4 资源；替换游戏版本后应更新这个数量断言。
- verify_pipeline_binary.py 检查 PipelineSceneData::activate 中的危险辅助初始化调用确实已移除。
- 每次发版更新 CFBundleVersion。签名后用手机验证冷启动、注册、登录、主界面、战斗画面、音乐、输入框、前后台切换。

当前版本 5 用户已确认画面恢复并可操作登录界面；版本 6 的账号按钮修改经过请求测试与打包校验，尚待用户真机复测。原生化不等于已测量或保证帧率提升。

## 可选工具再生成

日常复建不需要 Binaryen 或 glslang，最终 NS JavaScript 已在 runtime 中保留。

重做 NS 移植时：下载 npm binaryen 123.0.0 到 vendor/binaryen，将原 bin 复制为 vendor/ns.wasm，运行 `node vendor/binaryen/package/bin/wasm2js vendor/ns.wasm -O -o vendor/ns-asm.js`，再运行 `python tools/build_portable_ns.py`，检查生成 factory 的初始化逻辑并运行差分测试。该生成器仅针对当前原模块结构。

官方引擎参考：https://github.com/cocos/cocos-engine/tree/v3.8.8

版本 1.30.5（7）：登录成功响应后保存账号密码并在新启动的登录界面回填。注册成功、登录失败不保存输入，回到当前登录界面不覆盖正在修改的内容。仍需点击“立即启航”，不自动发登录请求。使用 Cocos sys.localStorage 与现有存储键保持兼容。通过多次独立运行上下文的模拟重启测试，尚待手机验证持久化。沿用原生 run 45920296546，仅更新脚本及版本元数据。
