/// Secure Storage Implementation
/// Implements encrypted storage for sensitive data
/// OWASP Mobile Security compliant
library;

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:encrypt/encrypt.dart';
import 'package:crypto/crypto.dart';

/// Secure storage service for sensitive data
class SecureStorageService {
  SecureStorageService._();
  static final instance = SecureStorageService._();

  // Flutter Secure Storage instance
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      resetOnError: true,
    ),
    iOptions: IOSOptions(
      accessibility: IOSAccessibility.first_unlock_this_device,
      synchronizable: false,
    ),
  );

  // Encryption key management
  static const _masterKeyAlias = 'master_encryption_key';
  static const _keyDerivationSalt = 'visual_inventory_salt_v1';

  // Security constants
  static const _keyLength = 32; // 256 bits
  static const _ivLength = 16; // 128 bits
  static const _iterations = 10000; // PBKDF2 iterations

  // Cache for decrypted values (cleared on app background)
  final Map<String, String> _cache = {};

  /// Initialize secure storage
  Future<void> initialize() async {
    try {
      // Generate master key if not exists
      final masterKey = await _getMasterKey();
      if (masterKey == null) {
        await _generateMasterKey();
      }

      // Verify storage integrity
      await _verifyStorageIntegrity();

      // Clear cache
      _cache.clear();

      if (kDebugMode) {
        print('SecureStorage: Initialized successfully');
      }
    } catch (e) {
      if (kDebugMode) {
        print('SecureStorage: Initialization failed: $e');
      }
      // In production, report to crash analytics
      rethrow;
    }
  }

  /// Store sensitive data securely
  Future<void> write({
    required String key,
    required String value,
    bool useAdditionalEncryption = true,
  }) async {
    try {
      var dataToStore = value;

      if (useAdditionalEncryption) {
        // Add additional layer of encryption for highly sensitive data
        dataToStore = await _encryptData(value);
      }

      // Store using Flutter Secure Storage
      await _storage.write(key: key, value: dataToStore);

      // Update cache
      _cache[key] = value;

      // Log write operation (without sensitive data)
      _logSecurityEvent('WRITE', key);
    } catch (e) {
      _logSecurityEvent('WRITE_FAILED', key, error: e.toString());
      rethrow;
    }
  }

  /// Read sensitive data
  Future<String?> read({
    required String key,
    bool useAdditionalEncryption = true,
  }) async {
    try {
      // Check cache first
      if (_cache.containsKey(key)) {
        return _cache[key];
      }

      // Read from secure storage
      final storedData = await _storage.read(key: key);
      if (storedData == null) {
        return null;
      }

      String decryptedValue = storedData;

      if (useAdditionalEncryption) {
        // Decrypt additional encryption layer
        decryptedValue = await _decryptData(storedData);
      }

      // Update cache
      _cache[key] = decryptedValue;

      // Log read operation
      _logSecurityEvent('READ', key);

      return decryptedValue;
    } catch (e) {
      _logSecurityEvent('READ_FAILED', key, error: e.toString());
      return null;
    }
  }

  /// Delete sensitive data
  Future<void> delete({required String key}) async {
    try {
      await _storage.delete(key: key);
      _cache.remove(key);
      _logSecurityEvent('DELETE', key);
    } catch (e) {
      _logSecurityEvent('DELETE_FAILED', key, error: e.toString());
      rethrow;
    }
  }

  /// Delete all stored data
  Future<void> deleteAll() async {
    try {
      await _storage.deleteAll();
      _cache.clear();
      _logSecurityEvent('DELETE_ALL', 'all_keys');
    } catch (e) {
      _logSecurityEvent('DELETE_ALL_FAILED', 'all_keys', error: e.toString());
      rethrow;
    }
  }

  /// Check if key exists
  Future<bool> containsKey({required String key}) async {
    try {
      return await _storage.containsKey(key: key);
    } catch (e) {
      return false;
    }
  }

  /// Clear cache (call on app background)
  void clearCache() {
    _cache.clear();
  }

  /// Store authentication token
  Future<void> storeAuthToken(String token) async {
    await write(
      key: 'auth_token',
      value: token,
    );
  }

  /// Retrieve authentication token
  Future<String?> getAuthToken() async {
    return read(
      key: 'auth_token',
    );
  }

  /// Store refresh token
  Future<void> storeRefreshToken(String token) async {
    await write(
      key: 'refresh_token',
      value: token,
    );
  }

  /// Retrieve refresh token
  Future<String?> getRefreshToken() async {
    return read(
      key: 'refresh_token',
    );
  }

  /// Store user credentials (for biometric re-authentication)
  Future<void> storeCredentials({
    required String username,
    required String password,
  }) async {
    final credentials = json.encode({
      'username': username,
      'password': password,
      'timestamp': DateTime.now().toIso8601String(),
    });

    await write(
      key: 'user_credentials',
      value: credentials,
    );
  }

  /// Clear authentication data
  Future<void> clearAuthData() async {
    await delete(key: 'auth_token');
    await delete(key: 'refresh_token');
    await delete(key: 'user_credentials');
    _cache.clear();
  }

  // ============= Private Helper Methods =============

  /// Generate master encryption key
  Future<void> _generateMasterKey() async {
    final random = Random.secure();
    final key = List<int>.generate(_keyLength, (_) => random.nextInt(256));
    final encodedKey = base64Encode(key);

    await _storage.write(key: _masterKeyAlias, value: encodedKey);
  }

  /// Get master encryption key
  Future<String?> _getMasterKey() async {
    return _storage.read(key: _masterKeyAlias);
  }

  /// Encrypt data with AES
  Future<String> _encryptData(String plainText) async {
    try {
      // Get master key
      final masterKeyString = await _getMasterKey();
      if (masterKeyString == null) {
        throw Exception('Master key not found');
      }

      // Decode master key
      final masterKey = base64Decode(masterKeyString);

      // Generate random IV
      final random = Random.secure();
      final iv = List<int>.generate(_ivLength, (_) => random.nextInt(256));

      // Create encrypter
      final key = Key(Uint8List.fromList(masterKey));
      final encrypter = Encrypter(AES(key, mode: AESMode.cbc));

      // Encrypt data
      final encrypted = encrypter.encrypt(
        plainText,
        iv: IV(Uint8List.fromList(iv)),
      );

      // Combine IV and encrypted data
      final combined = <int>[];
      combined.addAll(iv);
      combined.addAll(encrypted.bytes);

      // Return base64 encoded
      return base64Encode(combined);
    } catch (e) {
      throw Exception('Encryption failed: $e');
    }
  }

  /// Decrypt data with AES
  Future<String> _decryptData(String encryptedData) async {
    try {
      // Get master key
      final masterKeyString = await _getMasterKey();
      if (masterKeyString == null) {
        throw Exception('Master key not found');
      }

      // Decode master key
      final masterKey = base64Decode(masterKeyString);

      // Decode encrypted data
      final combined = base64Decode(encryptedData);

      // Extract IV and encrypted bytes
      final iv = combined.sublist(0, _ivLength);
      final encryptedBytes = combined.sublist(_ivLength);

      // Create encrypter
      final key = Key(Uint8List.fromList(masterKey));
      final encrypter = Encrypter(AES(key, mode: AESMode.cbc));

      // Decrypt data
      final decrypted = encrypter.decrypt(
        Encrypted(Uint8List.fromList(encryptedBytes)),
        iv: IV(Uint8List.fromList(iv)),
      );

      return decrypted;
    } catch (e) {
      throw Exception('Decryption failed: $e');
    }
  }

  /// Verify storage integrity
  Future<void> _verifyStorageIntegrity() async {
    try {
      // Write test value
      const testKey = '__integrity_check__';
      const testValue = 'test_value';

      await write(key: testKey, value: testValue);
      final retrieved = await read(key: testKey);

      if (retrieved != testValue) {
        throw Exception('Storage integrity check failed');
      }

      await delete(key: testKey);
    } catch (e) {
      throw Exception('Storage integrity verification failed: $e');
    }
  }

  /// Log security events
  void _logSecurityEvent(
    String action,
    String key, {
    String? error,
  }) {
    if (kDebugMode) {
      final timestamp = DateTime.now().toIso8601String();
      final message = error != null
          ? 'SecureStorage [$timestamp]: $action failed for key: $key - Error: $error'
          : 'SecureStorage [$timestamp]: $action for key: $key';
      print(message);
    }

    // In production, send to security monitoring service
  }
}

/// Secure key-value pair for type-safe storage
class SecureKey<T> {
  const SecureKey(this.key);
  final String key;
}

/// Common secure storage keys
class SecureKeys {
  static const authToken = SecureKey<String>('auth_token');
  static const refreshToken = SecureKey<String>('refresh_token');
  static const userId = SecureKey<String>('user_id');
  static const userEmail = SecureKey<String>('user_email');
  static const biometricEnabled = SecureKey<bool>('biometric_enabled');
  static const pinCode = SecureKey<String>('pin_code');
  static const sessionId = SecureKey<String>('session_id');
  static const deviceId = SecureKey<String>('device_id');
  static const encryptionKey = SecureKey<String>('encryption_key');
  static const lastSyncTime = SecureKey<String>('last_sync_time');
}