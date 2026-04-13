import Foundation
import Flutter

class MacServerDiscovery: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private static var shared: MacServerDiscovery?

    private var browser: NetServiceBrowser?
    private var service: NetService?
    private var completion: ((String?) -> Void)?
    private var timer: Timer?
    private var channel: FlutterMethodChannel?

    static func register(messenger: FlutterBinaryMessenger) {
        let instance = MacServerDiscovery()
        MacServerDiscovery.shared = instance  // explicit app-lifetime ownership; prevents deallocation
        let channel = FlutterMethodChannel(
            name: "com.allmythings/server_discovery",
            binaryMessenger: messenger
        )
        instance.channel = channel
        channel.setMethodCallHandler { [weak instance] call, result in
            instance?.handle(call, result: result) ?? result(FlutterMethodNotImplemented)
        }
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "discover":
            let args = call.arguments as? [String: Any]
            let timeout = TimeInterval(args?["timeoutSeconds"] as? Int ?? 2)
            discover(timeout: timeout) { url in
                result(url)
            }
        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func discover(timeout: TimeInterval, completion: @escaping (String?) -> Void) {
        self.completion = completion

        timer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            self?.finish(url: nil)
        }

        browser = NetServiceBrowser()
        browser?.delegate = self
        browser?.schedule(in: .main, forMode: .common)  // ensure delegate callbacks fire on main thread
        browser?.searchForServices(ofType: "_http._tcp.", inDomain: "local.")
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        if service.name == "allmythings-server" {
            self.service = service
            service.delegate = self
            service.resolve(withTimeout: 5.0)
        }
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        guard let host = sender.hostName else {
            finish(url: nil)
            return
        }
        let url = "http://\(host):\(sender.port)"
        finish(url: url)
    }

    func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        finish(url: nil)
    }

    private func finish(url: String?) {
        timer?.invalidate()
        timer = nil
        service?.delegate = nil  // prevent callbacks on torn-down state
        service = nil
        browser?.stop()
        browser = nil
        let c = completion
        completion = nil
        DispatchQueue.main.async { c?(url) }
    }
}
