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

    // Add interceptors for logging and retry
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          // Log request
          return handler.next(options);
        },
        onResponse: (response, handler) {
          // Log response
          return handler.next(response);
        },
        onError: (error, handler) {
          // Log error
          return handler.next(error);
        },
      ),
    );
  }
  final Dio _dio;

  Dio get dio => _dio;
}

/// Provider for API client
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});
