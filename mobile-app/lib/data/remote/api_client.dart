import 'package:all_my_things/core/config/app_config.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Dio HTTP client for API communication
class ApiClient {
  ApiClient() : _dio = Dio() {
    debugPrint('ApiClient initialized with baseUrl: ${AppConfig.apiBaseUrl}');
    _dio.options = BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(milliseconds: AppConfig.apiTimeout),
      receiveTimeout: const Duration(milliseconds: AppConfig.apiTimeout),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (AppConfig.apiKey.isNotEmpty)
          'Authorization': 'Bearer ${AppConfig.apiKey}',
      },
    );

    // Connection-error retry: when the cached Bonjour-resolved URL has
    // rotted (Mac sleep/wake → hostname suffix increments → cached IP
    // goes stale), the first request fails with ECONNREFUSED. Re-browse
    // mDNS, swap in the fresh URL, retry once. Without this the user
    // has to force-quit + relaunch the app every time the Mac sleeps.
    _dio.interceptors.add(
      InterceptorsWrapper(
        onError: (error, handler) async {
          if (_alreadyRetried(error)) return handler.next(error);
          if (!_isConnectionError(error)) return handler.next(error);
          final fresh = await AppConfig.refresh();
          if (fresh == null || fresh == _dio.options.baseUrl) {
            return handler.next(error);
          }
          debugPrint('ApiClient: connection error; rebrowsed mDNS → $fresh; retrying once');
          _dio.options.baseUrl = fresh;
          final req = error.requestOptions;
          req.baseUrl = fresh;
          req.extra[_retriedKey] = true;
          try {
            final res = await _dio.fetch<dynamic>(req);
            return handler.resolve(res);
          } on DioException catch (retryErr) {
            return handler.next(retryErr);
          }
        },
      ),
    );
  }
  final Dio _dio;

  static const String _retriedKey = '__mdns_retry__';

  static bool _alreadyRetried(DioException error) =>
      error.requestOptions.extra[_retriedKey] == true;

  static bool _isConnectionError(DioException error) {
    if (error.type == DioExceptionType.connectionTimeout) return true;
    if (error.type == DioExceptionType.connectionError) return true;
    final msg = error.message?.toLowerCase() ?? '';
    if (msg.contains('connection refused')) return true;
    if (msg.contains('errno = 61')) return true;
    if (msg.contains('failed host lookup')) return true;
    return false;
  }

  Dio get dio => _dio;
}

/// Provider for API client
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});
