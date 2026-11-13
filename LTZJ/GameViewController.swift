import UIKit
import WebKit

final class GameViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    private let label = UILabel()
    private let progress = UIProgressView(progressViewStyle: .default)
    private let retry = UIButton(type: .system)
    private var server: LocalHTTPServer?
    private var web: WKWebView?
    private var busy = false
    private var lastUpdate: TimeInterval = 0
    private let progressLock = NSLock()
    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .systemBackground
        label.text = "准备游戏资源…"; label.numberOfLines = 0; label.textAlignment = .center
        retry.setTitle("重试 / 继续下载", for: .normal); retry.addTarget(self, action: #selector(startResourceInstall), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [label, progress, retry]); stack.axis = .vertical; stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24), stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        startResourceInstall()
    }
    @objc private func startResourceInstall() {
        guard !busy else { return }; busy = true; retry.isHidden = true; UIApplication.shared.isIdleTimerDisabled = true
        label.text = "正在获取在线配置…"; progress.progress = 0
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let root = try ResourceInstaller().install { [weak self] text, value in
                    guard let self = self else { return }
                    self.progressLock.lock()
                    let now = Date.timeIntervalSinceReferenceDate
                    let draw = value >= 1 || now - self.lastUpdate >= 0.25
                    if draw { self.lastUpdate = now }
                    self.progressLock.unlock()
                    guard draw else { return }
                    DispatchQueue.main.async {
                        self.label.text = text; self.progress.progress = Float(value)
                    }
                }
                DispatchQueue.main.async { self.launch(root: root) }
            } catch { DispatchQueue.main.async { self.showError(error) } }
        }
    }
    private func showError(_ error: Error) {
        busy = false; UIApplication.shared.isIdleTimerDisabled = false
        label.text = "资源准备失败\n\(error.localizedDescription)\n请检查网络、存储空间及服务器部署。"; retry.isHidden = false
    }
    private func launch(root: URL) {
        server?.stop(); let server = LocalHTTPServer(root: root); self.server = server
        server.start { result in DispatchQueue.main.async {
            switch result { case .success(let url): self.open(url); case .failure(let error): self.showError(error) }
        } }
    }
    private func open(_ url: URL) {
        let config = WKWebViewConfiguration(); config.allowsInlineMediaPlayback = true; config.mediaTypesRequiringUserActionForPlayback = []
        let source = """
        (() => {
          const rewrite = value => {
            try { const u = new URL(value, location.href); if (u.origin === 'http://ltzj-server.ulccc.com:23081') return location.origin + u.pathname + u.search + u.hash; } catch (_) {}
            return value;
          };
          const open = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url, ...rest) { return open.call(this, method, rewrite(url), ...rest); };
          const fetch = window.fetch;
          window.fetch = function(input, options) {
            if (typeof input === 'string' || input instanceof URL) input = rewrite(String(input));
            else if (input instanceof Request) { const address = rewrite(input.url); if (address !== input.url) input = new Request(address, input); }
            return fetch.call(this, input, options);
          };
        })();
        """
        config.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        let web = WKWebView(frame: .zero, configuration: config); web.uiDelegate = self; web.navigationDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false; web.scrollView.isScrollEnabled = false; view.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor), web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        self.web = web; busy = false; web.load(URLRequest(url: url))
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { webView.removeFromSuperview(); showError(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "雷霆战机", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler() }); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "雷霆战机", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler(true) }); alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) }); present(alert, animated: true)
    }
    deinit { server?.stop() }
}
