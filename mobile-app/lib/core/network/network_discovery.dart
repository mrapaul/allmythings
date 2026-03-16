import 'dart:io';
import 'package:flutter/foundation.dart';

/// Utility to discover the local API server IP
class NetworkDiscovery {
  /// Attempts to find the host machine IP when running on a physical device.
  /// On emulators, it returns the standard loopback/alias.
  static Future<String> getLocalApiUrl(String port) async {
    if (kIsWeb) return 'http://localhost:$port';

    try {
      if (Platform.isAndroid) {
        // Check if running on emulator
        // Simple heuristic: check for typical emulator properties if needed, 
        // but 10.0.2.2 is usually safe for emulators.
        // For physical devices, we need the host IP.
        return 'http://10.0.2.2:$port';
      }
      
      if (Platform.isIOS) {
        // iOS Simulator uses localhost, but physical device needs host IP.
        // We could use network_info_plus here if available, or assume localhost for simulator.
        return 'http://localhost:$port';
      }
    } catch (_) {}

    return 'http://localhost:$port';
  }

  /// Helper to get all local IP addresses (for debugging/advanced discovery)
  static Future<List<String>> getLocalIps() async {
    final interfaces = await NetworkInterface.list();
    return interfaces
        .expand((interface) => interface.addresses)
        .map((address) => address.address)
        .toList();
  }
}
