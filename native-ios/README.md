# 雷霆战机 Cocos Creator 3.8.8 原生 iOS 工程

资源来自用户指定的 `server-1.30.5/整理交付-1.30.5/02-客户端及配套资源/服务器配套/www/wwwroot/thunderfighter-h5`。独立输出目录，不修改该交付目录。

本工程使用 Cocos 原生 iOS 模板、JSB、V8 和 Metal。游戏逻辑仍为 JavaScript，渲染由 Cocos 原生引擎负责。游戏启动不使用 WKWebView、本地 HTTP 服务器或 WebGL 网页适配。

## 已构造内容

- `project/ios`、`project/common`：官方 3.8.8 原生模板及竖屏配置。
- `build-input/data`：游戏资源及原生启动入口；155 份 `.jsc` 均有明文 `.js` 对应，原生输出只保留明文脚本。
- `build-input/proj/cfg.cmake`：iOS 15、arm64、Metal、V8、Spine 3.8 配置。
- 游戏资源、引擎脚本、主脚本从指定目录复制。登录、私服通信和远程配置复用同版本 `server-1.30.5/client-android` 的现有适配，并增加 iOS SDK 缺失防护。
- 登录服务器：`http://ltzj-server.ulccc.com:23081`。
- 这是资源内置的原生验证版。首次下载/热更新尚未迁移到原生端；不复用旧 WebView 的更新资源缓存。

## Mac 编译

将整个 `native-ios` 目录复制到安装完整 Xcode 的 Mac。需要 Git、Node.js、CMake（建议 3.28 或更新版本）以及网络访问 GitHub 的能力。

```sh
cd native-ios
bash tools/build-mac.sh
```

脚本下载 Cocos 引擎 `v3.8.8` 和官方外部依赖 `v3.8.8-2`，生成 Xcode 工程、编译 arm64 Release，并输出 `dist/LTZJNative-unsigned.ipa`。资源已内置，体积较大，建议预留至少 25 GB 磁盘空间。签名后才能安装到 iPhone。

如自行配置引擎，参考 `tools/build-mac.sh` 的 CMake 参数。源模板及许可证保留在 project 中。

## 验证与限制

已通过 GitHub Actions macOS 真机目标 Release 编译（run 45831298611），尚未进行 iPhone 真机测试。公网资源地址检查返回 503，尚未验证登录和战斗。原生 SDK 防护仅处理缺失的广告/统计渠道桥接，不构成这些 SDK 的完整 iOS 实现。

建议真机检查：冷启动、账号密码登录、主界面、进入战斗、音效、输入框、前后台切换、Spine 动画及内存峰值。Android 构建的引擎脚本在 iOS 绑定上的兼容性、游戏中的渠道 SDK 分支仍需实际运行验证。

加载并发已设为保守值，不代表已解决掉帧。应先对比同一台设备的加载停顿，再针对纹理上传和界面创建做性能优化。

官方依据：
- https://docs.cocos.com/creator/3.8/manual/en/editor/publish/native-options.html
- https://github.com/cocos/cocos-engine/tree/v3.8.8/templates/ios

原网页客户端和已发布 IPA 保持原状。

成功构建：https://github.com/misaka10406/ltzjios/actions/runs/45831298611

黑屏修复：恢复原生引擎导入映射，移除网页渲染强制项，加入屏幕启动诊断。修复版已通过 Actions 编译，尚未进行 iPhone 实测。

版本 1.30.5（3）：根据真机崩溃栈，关闭不配套的原生调试绘制、辅助几何绘制与遮挡查询模块。新二进制的 PipelineSceneData::activate 只有 8 字节且无辅助初始化调用；旧版为 48 字节并调用三个辅助模块。尚待 iPhone 复测。
