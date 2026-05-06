import Foundation
import Flutter

class MacServerDiscovery: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private static var shared: MacServerDiscovery?

    private var browser: NetServiceBrowser?
    private var service: NetService?
    private var completion: ((String?) -> Void)?
    private var timeoutWork: DispatchWorkItem?
    private var channel: FlutterMethodChannel?

    static func register(messenger: FlutterBinaryMessenger) {
        guard shared == nil else { return }  // single-registration guard
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
            // Default 5s — gives mDNS announce + SRV resolve a real
            // chance on iOS, where the first browse after wake or
            // permission grant can take 2s+ before the first
            // didFind callback fires.
            let timeout = TimeInterval(args?["timeoutSeconds"] as? Int ?? 5)
            discover(timeout: timeout) { url in
                result(url)
            }
        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func discover(timeout: TimeInterval, completion: @escaping (String?) -> Void) {
        self.completion = completion

        let work = DispatchWorkItem { [weak self] in self?.finish(url: nil) }
        timeoutWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: work)

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
        // Prefer the first IPv4 address from sender.addresses over
        // sender.hostName. sender.hostName is the Mac's `.local`
        // hostname (e.g. "CloudDominion-447.local"), which still
        // requires *another* mDNS A-record lookup at HTTP request
        // time — that second lookup races against iOS's mDNS cache
        // and frequently fails with ECONNREFUSED if the cache holds
        // a stale hostname (Mac sleeps/wakes increment the .local
        // suffix, so the cached entry rots). Using the resolved IPv4
        // directly bypasses that whole hop.
        if let addresses = sender.addresses, let ipv4 = firstIPv4Address(addresses) {
            let url = "http://\(ipv4):\(sender.port)"
            finish(url: url)
            return
        }
        // Fallback: hostname path (rare — only when no IPv4 address
        // was resolved, e.g. an IPv6-only network).
        if let host = sender.hostName {
            let url = "http://\(host):\(sender.port)"
            finish(url: url)
            return
        }
        finish(url: nil)
    }

    /// Walk the NSData blobs in NetService.addresses and return the
    /// first IPv4 (sockaddr_in) as a dotted-quad string. NetService
    /// addresses are an array of sockaddr buffers; on dual-stack
    /// networks both IPv4 and IPv6 entries appear, in arbitrary order.
    private func firstIPv4Address(_ addresses: [Data]) -> String? {
        for data in addresses {
            let result: String? = data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> String? in
                guard let baseAddress = raw.baseAddress else { return nil }
                let sockaddrPtr = baseAddress.assumingMemoryBound(to: sockaddr.self)
                guard sockaddrPtr.pointee.sa_family == sa_family_t(AF_INET) else { return nil }
                let sockaddrIn = baseAddress.assumingMemoryBound(to: sockaddr_in.self)
                var addr = sockaddrIn.pointee.sin_addr
                var buf = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                guard inet_ntop(AF_INET, &addr, &buf, socklen_t(INET_ADDRSTRLEN)) != nil else {
                    return nil
                }
                return String(cString: buf)
            }
            if let ipv4 = result { return ipv4 }
        }
        return nil
    }

    func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        finish(url: nil)
    }

    private func finish(url: String?) {
        timeoutWork?.cancel()
        timeoutWork = nil
        service?.delegate = nil  // prevent callbacks on torn-down state
        service = nil
        browser?.stop()
        browser = nil
        let c = completion
        completion = nil
        DispatchQueue.main.async { c?(url) }
    }
}
