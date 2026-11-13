# 雷霆战机 iOS 客户端

最低 iOS 15，iPhone/iPad 竖屏，Bundle ID com.ltzj.ios。
使用 WKWebView、本机 HTTP 服务、在线资源清单、Range 断点续传、SHA-256 和 CRC 校验，包含参考工程的 ZIP64 修复。

服务器：http://ltzj-server.ulccc.com:23081
在线清单：http://ltzj-server.ulccc.com:23081/ios-update/resource-manifest.json

将 server/ios-update 整个目录上传到服务器 /www/wwwroot/thunderfighter-h5/ios-update。ZIP 与清单必须配套；先上传 ZIP，再上传清单。现有网关静态文件服务可提供这些文件，需确认公网支持下载和 Range 请求。
资源从指定 app.apk 的 assets 提取，并合并当前雷霆战机服务端的网页适配（APK 使用原生启动，不能直接放入 WKWebView）。extracted-game 是完整合并结果，resource-origin.json 记录适配文件来源。

GitHub Actions 在 macOS runner 编译 LTZJ.xcodeproj 并生成 LTZJ-unsigned.ipa。此 IPA 未签名，需签名后安装。尚未进行 iPhone 真机测试。首次下载请保持前台并预留至少 8 GB 空间。
仓库只包含客户端工程和构建配置，不上传游戏资源或服务端源码。
