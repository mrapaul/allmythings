import 'package:flutter/services.dart';

class MacServerDiscovery {
  static const _channel = MethodChannel('com.allmythings/server_discovery');

  /// Resolves the Mac API server on the local network via mDNS (Bonjour).
  /// Returns the base URL (e.g. "http://192.168.1.10:14000") or null if not found.
  static Future<String?> resolve({Duration timeout = const Duration(seconds: 2)}) async {
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
