/// Mobile Telemetry and Observability Module
///
/// Provides crash reporting, performance monitoring, and analytics
/// for the Flutter mobile application.

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:logging/logging.dart';

/// Mobile telemetry service for crash reporting and performance monitoring
class MobileTelemetry {
  static final MobileTelemetry _instance = MobileTelemetry._internal();
  factory MobileTelemetry() => _instance;
  MobileTelemetry._internal();

  final Logger _logger = Logger('MobileTelemetry');
  bool _initialized = false;

  // Performance metrics
  final Map<String, DateTime> _operationStartTimes = {};
  final List<PerformanceMetric> _performanceMetrics = [];

  /// Initialize telemetry with crash reporting
  Future<void> initialize({
    required String dsn,
    required String environment,
    bool enablePerformanceMonitoring = true,
  }) async {
    if (_initialized) {
      _logger.warning('Telemetry already initialized');
      return;
    }

    try {
      // Initialize crash reporting (e.g., Sentry, Firebase Crashlytics)
      // await Sentry.init((options) {
      //   options.dsn = dsn;
      //   options.environment = environment;
      //   options.tracesSampleRate = 1.0;
      //   options.enableAutoPerformanceTracing = enablePerformanceMonitoring;
      // });

      // Setup global error handlers
      FlutterError.onError = (FlutterErrorDetails details) {
        _handleFlutterError(details);
      };

      PlatformDispatcher.instance.onError = (error, stack) {
        _handlePlatformError(error, stack);
        return true;
      };

      _initialized = true;
      _logger.info('Telemetry initialized successfully');
    } catch (e, stackTrace) {
      _logger.severe('Failed to initialize telemetry', e, stackTrace);
    }
  }

  /// Handle Flutter framework errors
  void _handleFlutterError(FlutterErrorDetails details) {
    _logger.severe('Flutter error', details.exception, details.stack);

    // Report to crash reporting service
    // Sentry.captureException(
    //   details.exception,
    //   stackTrace: details.stack,
    //   hint: Hint.withMap({'library': details.library}),
    // );

    // In debug mode, also print to console
    if (kDebugMode) {
      FlutterError.presentError(details);
    }
  }

  /// Handle platform errors
  void _handlePlatformError(Object error, StackTrace stackTrace) {
    _logger.severe('Platform error', error, stackTrace);

    // Report to crash reporting service
    // Sentry.captureException(error, stackTrace: stackTrace);
  }

  /// Record a custom error
  void recordError(
    dynamic error,
    StackTrace? stackTrace, {
    Map<String, dynamic>? context,
    String? userId,
  }) {
    _logger.severe('Custom error', error, stackTrace);

    // Add context and user info
    // final scope = Scope()
    //   ..setContexts('custom', context ?? {})
    //   ..setUser(SentryUser(id: userId));

    // Report to crash reporting service
    // Sentry.captureException(error, stackTrace: stackTrace);
  }

  /// Start tracking a performance operation
  void startOperation(String operationName) {
    _operationStartTimes[operationName] = DateTime.now();
  }

  /// End tracking a performance operation
  void endOperation(
    String operationName, {
    Map<String, dynamic>? metadata,
  }) {
    final startTime = _operationStartTimes.remove(operationName);
    if (startTime == null) {
      _logger.warning('Operation $operationName was not started');
      return;
    }

    final duration = DateTime.now().difference(startTime);
    final metric = PerformanceMetric(
      name: operationName,
      duration: duration,
      timestamp: DateTime.now(),
      metadata: metadata,
    );

    _performanceMetrics.add(metric);
    _logger.info(
      'Performance: $operationName took ${duration.inMilliseconds}ms',
    );

    // Report to performance monitoring service
    // Sentry.getSpan()?.setMeasurement(operationName, duration.inMilliseconds.toDouble());
  }

  /// Track a user event (analytics)
  void trackEvent(
    String eventName, {
    Map<String, dynamic>? properties,
    String? userId,
  }) {
    _logger.info('Event: $eventName', properties);

    // Send to analytics service (e.g., Firebase Analytics, Mixpanel)
    // FirebaseAnalytics.instance.logEvent(
    //   name: eventName,
    //   parameters: properties,
    // );
  }

  /// Track a screen view
  void trackScreenView(String screenName) {
    _logger.info('Screen view: $screenName');

    // Send to analytics service
    // FirebaseAnalytics.instance.logScreenView(screenName: screenName);
  }

  /// Set user context
  void setUser(String userId, {Map<String, dynamic>? properties}) {
    _logger.info('Set user: $userId');

    // Update user context in crash reporting
    // Sentry.configureScope((scope) {
    //   scope.setUser(SentryUser(
    //     id: userId,
    //     email: properties?['email'],
    //     username: properties?['username'],
    //   ));
    // });
  }

  /// Clear user context
  void clearUser() {
    _logger.info('Clear user');

    // Clear user context in crash reporting
    // Sentry.configureScope((scope) => scope.setUser(null));
  }

  /// Add breadcrumb (navigation trail for debugging)
  void addBreadcrumb(
    String message, {
    String? category,
    Map<String, dynamic>? data,
  }) {
    _logger.fine('Breadcrumb: $message');

    // Add breadcrumb to crash reporting
    // Sentry.addBreadcrumb(Breadcrumb(
    //   message: message,
    //   category: category,
    //   data: data,
    //   timestamp: DateTime.now(),
    // ));
  }

  /// Get performance metrics summary
  Map<String, dynamic> getPerformanceSummary() {
    final metrics = <String, List<int>>{};

    for (final metric in _performanceMetrics) {
      metrics[metric.name] ??= [];
      metrics[metric.name]!.add(metric.duration.inMilliseconds);
    }

    final summary = <String, dynamic>{};
    for (final entry in metrics.entries) {
      final durations = entry.value;
      summary[entry.key] = {
        'count': durations.length,
        'min': durations.reduce((a, b) => a < b ? a : b),
        'max': durations.reduce((a, b) => a > b ? a : b),
        'avg': durations.reduce((a, b) => a + b) / durations.length,
      };
    }

    return summary;
  }

  /// Flush pending telemetry data
  Future<void> flush() async {
    try {
      // Flush crash reporting queue
      // await Sentry.close();

      _logger.info('Telemetry data flushed');
    } catch (e, stackTrace) {
      _logger.severe('Failed to flush telemetry', e, stackTrace);
    }
  }
}

/// Performance metric data class
class PerformanceMetric {
  final String name;
  final Duration duration;
  final DateTime timestamp;
  final Map<String, dynamic>? metadata;

  PerformanceMetric({
    required this.name,
    required this.duration,
    required this.timestamp,
    this.metadata,
  });

  Map<String, dynamic> toJson() => {
        'name': name,
        'duration_ms': duration.inMilliseconds,
        'timestamp': timestamp.toIso8601String(),
        'metadata': metadata,
      };
}

/// Extension for easy performance tracking
extension PerformanceTracking<T> on Future<T> {
  Future<T> trackPerformance(String operationName) async {
    final telemetry = MobileTelemetry();
    telemetry.startOperation(operationName);

    try {
      final result = await this;
      telemetry.endOperation(operationName);
      return result;
    } catch (e, stackTrace) {
      telemetry.endOperation(operationName, metadata: {'error': e.toString()});
      telemetry.recordError(e, stackTrace);
      rethrow;
    }
  }
}
