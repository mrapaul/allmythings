import 'package:flutter/services.dart';

class MacServerDiscovery {
  static const _channel = MethodChannel('com.allmythings/server_discovery');

  /// Resolves the Mac API server on the local network via mDNS (Bonjour).
  /// Returns the base URL (e.g. "http://192.168.1.10:14000") or null if not found.
  ///
  /// Default timeout 5s — the iOS NetServiceBrowser's first browse after
  /// app launch / wake / Local-Network permission grant routinely takes
  /// 2s+ before the first didFind callback fires. The native side now
  /// returns an IP directly (parsed from NetService.addresses) so the
  /// returned URL doesn't need a second mDNS hop at HTTP request time.
  static Future<String?> resolve({Duration timeout = const Duration(seconds: 5)}) async {
    try {
      final url = await _channel.invokeMethod<String>(
        'discover',
        {'timeoutSeconds': timeout.inSeconds},
      );
      return url;
    } catch (_) {
      return null;
    }
  }
}
