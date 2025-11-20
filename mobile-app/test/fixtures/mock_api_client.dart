import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/domain/models/detection_response.dart';
import 'package:mocktail/mocktail.dart';

/// Mock API client for testing
class MockApiClient extends Mock implements ApiClient {
  final Map<String, dynamic> _responseQueue = {};

  /// Queue a response for a specific detection endpoint
  void queueDetectionResponse(String imageKey, DetectionResponse response) {
    _responseQueue[imageKey] = response;
  }

  /// Clear queued responses
  void clearResponses() {
    _responseQueue.clear();
  }

  /// Get number of pending responses
  int get pendingResponses => _responseQueue.length;
}

/// Mock API client with automatic response generation
class FakeApiClient extends ApiClient {
  late final Map<String, DetectionResponse> _responses = {};
  List<String> requestHistory = [];
  bool throwOnNextRequest = false;
  String? nextError;

  @override
  Future<DetectionResponse> detectObjects(String imagePath) async {
    requestHistory.add(imagePath);

    if (throwOnNextRequest) {
      throwOnNextRequest = false;
      throw Exception(nextError ?? 'API Error');
    }

    if (_responses.containsKey(imagePath)) {
      return _responses[imagePath]!;
    }

    // Default response
    throw Exception('No mocked response for $imagePath');
  }

  /// Setup a response for a specific image
  void setupResponse(String imagePath, DetectionResponse response) {
    _responses[imagePath] = response;
  }

  /// Get request history
  List<String> getRequestHistory() => List.unmodifiable(requestHistory);

  /// Clear history
  void clearHistory() {
    requestHistory.clear();
  }

  /// Setup failure for next request
  void setupFailure(String error) {
    throwOnNextRequest = true;
    nextError = error;
  }
}
