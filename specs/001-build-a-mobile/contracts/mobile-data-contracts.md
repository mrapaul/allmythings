# Mobile Data Contracts

**Feature**: Visual Home Inventory Manager
**Date**: 2025-10-18
**Platform**: Flutter Mobile App

## Overview

This document defines the data contracts (models, DTOs, interfaces) used within the Flutter mobile application. These contracts ensure type safety and consistency across the app.

## Domain Models

### InventoryItem

Represents a single inventory item with its photo and detection metadata.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'inventory_item.freezed.dart';
part 'inventory_item.g.dart';

@freezed
class InventoryItem with _$InventoryItem {
  const factory InventoryItem({
    required int id,
    required String photoPath,
    required String thumbnailPath,
    required DetectionData detectionData,
    required List<Label> labels,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _InventoryItem;

  factory InventoryItem.fromJson(Map<String, dynamic> json) =>
      _$InventoryItemFromJson(json);
}
```

**Validation**:
- `id` > 0
- `photoPath` and `thumbnailPath` must be valid file paths
- `labels` can be empty but not null
- `createdAt` <= `updatedAt`

---

### Label

Represents a single label (tag) on an inventory item.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'label.freezed.dart';
part 'label.g.dart';

@freezed
class Label with _$Label {
  const factory Label({
    required int id,
    required int itemId,
    String? key,
    required String value,
    required DateTime createdAt,
  }) = _Label;

  const Label._(); // Private constructor for custom methods

  factory Label.fromJson(Map<String, dynamic> json) =>
      _$LabelFromJson(json);

  /// Display format: "key: value" or just "value" if key is null
  String get displayText => key != null ? '$key: $value' : value;

  /// Lowercase value for case-insensitive comparison
  String get normalizedValue => value.toLowerCase().trim();
}
```

**Validation**:
- `id` > 0
- `itemId` > 0
- `value` not empty, max 100 chars
- `key` max 50 chars if present

---

### DetectionData

Metadata from the object detection process.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'detection_data.freezed.dart';
part 'detection_data.g.dart';

@freezed
class DetectionData with _$DetectionData {
  const factory DetectionData({
    required BoundingBox boundingBox,
    required double confidence,
    required String detectedLabel,
    required int imageWidth,
    required int imageHeight,
  }) = _DetectionData;

  factory DetectionData.fromJson(Map<String, dynamic> json) =>
      _$DetectionDataFromJson(json);
}
```

**Validation**:
- `confidence` between 0.0 and 1.0
- `imageWidth` and `imageHeight` > 0
- `detectedLabel` not empty

---

### BoundingBox

Normalized bounding box coordinates (0-1 range).

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'bounding_box.freezed.dart';
part 'bounding_box.g.dart';

@freezed
class BoundingBox with _$BoundingBox {
  const factory BoundingBox({
    required double x,
    required double y,
    required double width,
    required double height,
  }) = _BoundingBox;

  const BoundingBox._();

  factory BoundingBox.fromJson(Map<String, dynamic> json) =>
      _$BoundingBoxFromJson(json);

  /// Convert to absolute pixel coordinates
  Rect toRect(double imageWidth, double imageHeight) {
    return Rect.fromLTWH(
      x * imageWidth,
      y * imageHeight,
      width * imageWidth,
      height * imageHeight,
    );
  }

  /// Check if coordinates are valid (0-1 range)
  bool get isValid =>
      x >= 0 && x <= 1 &&
      y >= 0 && y <= 1 &&
      width >= 0 && width <= 1 &&
      height >= 0 && height <= 1 &&
      (x + width) <= 1 &&
      (y + height) <= 1;
}
```

**Validation**:
- All coordinates between 0.0 and 1.0
- `x + width` <= 1.0
- `y + height` <= 1.0

---

## Data Transfer Objects (DTOs)

### DetectionRequest

Request to detect objects from a photo.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';
import 'dart:io';

part 'detection_request.freezed.dart';

@freezed
class DetectionRequest with _$DetectionRequest {
  const factory DetectionRequest({
    required File imageFile,
    @Default(0.7) double minConfidence,
    @Default(20) int maxResults,
  }) = _DetectionRequest;

  const DetectionRequest._();

  /// Validate request before sending
  bool get isValid =>
      imageFile.existsSync() &&
      minConfidence >= 0.0 &&
      minConfidence <= 1.0 &&
      maxResults > 0 &&
      maxResults <= 50;

  /// Convert to multipart form data
  Future<Map<String, dynamic>> toMultipartFormData() async {
    return {
      'image': await MultipartFile.fromFile(
        imageFile.path,
        contentType: MediaType('image', 'jpeg'),
      ),
      'minConfidence': minConfidence.toString(),
      'maxResults': maxResults.toString(),
    };
  }
}
```

---

### DetectionResponse

Response from vision API with detected objects.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'detection_response.freezed.dart';
part 'detection_response.g.dart';

@freezed
class DetectionResponse with _$DetectionResponse {
  const factory DetectionResponse({
    required bool success,
    required bool ensembleMode,
    required int processingTimeMs,
    required List<Detection> detections,
    required List<ProviderResult> providerResults,
    EnsembleMetrics? ensembleMetrics,
  }) = _DetectionResponse;

  factory DetectionResponse.fromJson(Map<String, dynamic> json) =>
      _$DetectionResponseFromJson(json);
}
```

---

### ProviderResult

Result from a single vision provider.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'provider_result.freezed.dart';
part 'provider_result.g.dart';

enum VisionProvider {
  meta,
  google,
  aws,
  tensorflow,
}

@freezed
class ProviderResult with _$ProviderResult {
  const factory ProviderResult({
    required VisionProvider provider,
    required bool success,
    required int processingTimeMs,
    List<Detection>? detections,
    String? error,
  }) = _ProviderResult;

  factory ProviderResult.fromJson(Map<String, dynamic> json) =>
      _$ProviderResultFromJson(json);
}
```

---

### EnsembleMetrics

Metrics about the ensemble fusion process.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'ensemble_metrics.freezed.dart';
part 'ensemble_metrics.g.dart';

@freezed
class EnsembleMetrics with _$EnsembleMetrics {
  const factory EnsembleMetrics({
    required List<VisionProvider> providersUsed,
    required double averageConfidence,
    required double consensusRate,
  }) = _EnsembleMetrics;

  factory EnsembleMetrics.fromJson(Map<String, dynamic> json) =>
      _$EnsembleMetricsFromJson(json);
}
```

---

### Detection

A single detected object from the vision API (ensemble-fused).

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'detection.freezed.dart';
part 'detection.g.dart';

@freezed
class Detection with _$Detection {
  const factory Detection({
    required String id,
    required String label,
    required double confidence,
    required BoundingBox boundingBox,
    required int imageWidth,
    required int imageHeight,
    EnsembleDetails? ensembleDetails,
    List<AlternativeLabel>? alternativeLabels,
  }) = _Detection;

  factory Detection.fromJson(Map<String, dynamic> json) =>
      _$DetectionFromJson(json);
}

@freezed
class EnsembleDetails with _$EnsembleDetails {
  const factory EnsembleDetails({
    required List<VisionProvider> providerAgreement,
    required Map<String, double> confidenceByProvider,
    required bool labelConsensus,
  }) = _EnsembleDetails;

  factory EnsembleDetails.fromJson(Map<String, dynamic> json) =>
      _$EnsembleDetailsFromJson(json);
}

@freezed
class AlternativeLabel with _$AlternativeLabel {
  const factory AlternativeLabel({
    required String label,
    required double confidence,
    VisionProvider? provider,
  }) = _AlternativeLabel;

  factory AlternativeLabel.fromJson(Map<String, dynamic> json) =>
      _$AlternativeLabelFromJson(json);
}
```

---

## Result Types

Using `fpdart` for functional error handling.

### InventoryResult

```dart
import 'package:fpdart/fpdart.dart';

// Type alias for inventory operations
typedef InventoryResult<T> = Either<InventoryFailure, T>;

// Common failure types
@freezed
class InventoryFailure with _$InventoryFailure {
  const factory InventoryFailure.network({
    required String message,
    Exception? exception,
  }) = NetworkFailure;

  const factory InventoryFailure.storage({
    required String message,
    Exception? exception,
  }) = StorageFailure;

  const factory InventoryFailure.vision({
    required String message,
    String? code,
    Exception? exception,
  }) = VisionFailure;

  const factory InventoryFailure.validation({
    required String message,
    Map<String, String>? fieldErrors,
  }) = ValidationFailure;

  const factory InventoryFailure.notFound({
    required String message,
  }) = NotFoundFailure;

  const factory InventoryFailure.unknown({
    required String message,
    Exception? exception,
  }) = UnknownFailure;
}
```

**Usage Example**:

```dart
Future<InventoryResult<InventoryItem>> getItem(int id) async {
  try {
    final item = await database.getInventoryItem(id);
    if (item == null) {
      return left(const InventoryFailure.notFound(
        message: 'Item not found',
      ));
    }
    return right(item);
  } on DatabaseException catch (e) {
    return left(InventoryFailure.storage(
      message: 'Database error',
      exception: e,
    ));
  }
}
```

---

## UI State Models

### InventoryListState

State for the inventory list screen.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'inventory_list_state.freezed.dart';

@freezed
class InventoryListState with _$InventoryListState {
  const factory InventoryListState.initial() = _Initial;

  const factory InventoryListState.loading() = _Loading;

  const factory InventoryListState.loaded({
    required List<InventoryItem> items,
    required int totalCount,
    @Default(false) bool hasMore,
  }) = _Loaded;

  const factory InventoryListState.error({
    required String message,
    InventoryFailure? failure,
  }) = _Error;
}
```

---

### CameraState

State for the camera capture flow.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'camera_state.freezed.dart';

@freezed
class CameraState with _$CameraState {
  const factory CameraState.ready({
    required CameraController controller,
  }) = _Ready;

  const factory CameraState.capturing() = _Capturing;

  const factory CameraState.processing({
    required String imagePath,
    @Default(0.0) double progress,
  }) = _Processing;

  const factory CameraState.detected({
    required String imagePath,
    required List<Detection> detections,
  }) = _Detected;

  const factory CameraState.error({
    required String message,
    InventoryFailure? failure,
  }) = _Error;

  const factory CameraState.permissionDenied() = _PermissionDenied;
}
```

---

### SearchState

State for search functionality.

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'search_state.freezed.dart';

@freezed
class SearchState with _$SearchState {
  const factory SearchState.initial() = _Initial;

  const factory SearchState.searching({
    required String query,
  }) = _Searching;

  const factory SearchState.results({
    required String query,
    required List<InventoryItem> items,
    required int totalCount,
  }) = _Results;

  const factory SearchState.empty({
    required String query,
  }) = _Empty;

  const factory SearchState.error({
    required String message,
  }) = _Error;
}
```

---

## Repository Interfaces

### InventoryRepository

```dart
abstract class InventoryRepository {
  /// Get all inventory items (paginated)
  Future<InventoryResult<List<InventoryItem>>> getItems({
    int limit = 50,
    int offset = 0,
  });

  /// Get single item by ID
  Future<InventoryResult<InventoryItem>> getItemById(int id);

  /// Create new item from detection
  Future<InventoryResult<InventoryItem>> createItem({
    required String photoPath,
    required String thumbnailPath,
    required DetectionData detectionData,
    required String autoLabel,
  });

  /// Update item
  Future<InventoryResult<InventoryItem>> updateItem(InventoryItem item);

  /// Delete item
  Future<InventoryResult<void>> deleteItem(int id);

  /// Search items by label
  Future<InventoryResult<List<InventoryItem>>> searchByLabel(String query);

  /// Get items count
  Future<InventoryResult<int>> getItemCount();
}
```

---

### LabelRepository

```dart
abstract class LabelRepository {
  /// Get all labels for an item
  Future<InventoryResult<List<Label>>> getLabelsForItem(int itemId);

  /// Add label to item
  Future<InventoryResult<Label>> addLabel({
    required int itemId,
    String? key,
    required String value,
  });

  /// Update label
  Future<InventoryResult<Label>> updateLabel({
    required int id,
    String? key,
    required String value,
  });

  /// Delete label
  Future<InventoryResult<void>> deleteLabel(int id);

  /// Check if label exists (case-insensitive)
  Future<InventoryResult<bool>> labelExists({
    required int itemId,
    String? key,
    required String value,
  });
}
```

---

### VisionRepository

```dart
abstract class VisionRepository {
  /// Detect objects in photo
  Future<InventoryResult<DetectionResponse>> detectObjects(
    DetectionRequest request,
  );

  /// Check if vision service is available
  Future<InventoryResult<bool>> isServiceAvailable();
}
```

---

## Validation Extensions

```dart
extension StringValidation on String {
  bool get isValidLabelValue =>
      trim().isNotEmpty && length <= 100;

  bool get isValidLabelKey =>
      isEmpty || length <= 50;

  String get normalized => toLowerCase().trim();
}

extension DoubleValidation on double {
  bool get isValidConfidence => this >= 0.0 && this <= 1.0;

  bool get isValidNormalizedCoordinate => this >= 0.0 && this <= 1.0;
}

extension IntValidation on int {
  bool get isValidId => this > 0;
}
```

---

## JSON Converters

### DateTime Converter

```dart
class DateTimeConverter implements JsonConverter<DateTime, int> {
  const DateTimeConverter();

  @override
  DateTime fromJson(int json) =>
      DateTime.fromMillisecondsSinceEpoch(json);

  @override
  int toJson(DateTime object) =>
      object.millisecondsSinceEpoch;
}
```

### DetectionData Converter (for storing in SQLite)

```dart
class DetectionDataConverter
    implements JsonConverter<DetectionData, String> {
  const DetectionDataConverter();

  @override
  DetectionData fromJson(String json) =>
      DetectionData.fromJson(jsonDecode(json));

  @override
  String toJson(DetectionData object) =>
      jsonEncode(object.toJson());
}
```

---

## Contract Testing

All contracts should be validated with:

1. **JSON Serialization Tests**:
```dart
test('InventoryItem serialization round-trip', () {
  final item = InventoryItem(...);
  final json = item.toJson();
  final deserialized = InventoryItem.fromJson(json);
  expect(deserialized, equals(item));
});
```

2. **Validation Tests**:
```dart
test('BoundingBox validates coordinates', () {
  final valid = BoundingBox(x: 0.1, y: 0.2, width: 0.3, height: 0.4);
  expect(valid.isValid, isTrue);

  final invalid = BoundingBox(x: 0.8, y: 0.8, width: 0.5, height: 0.5);
  expect(invalid.isValid, isFalse); // exceeds bounds
});
```

3. **API Contract Tests**:
```dart
test('DetectionResponse matches API contract', () {
  final jsonResponse = {...}; // From actual API
  final response = DetectionResponse.fromJson(jsonResponse);
  expect(response.success, isTrue);
  expect(response.detections, isNotEmpty);
});
```

---

## Contract Validation Checklist

- [x] All domain models defined with freezed
- [x] All DTOs defined for API communication
- [x] Result types defined with fpdart Either
- [x] UI state models defined for Riverpod
- [x] Repository interfaces defined
- [x] Validation rules documented
- [x] JSON converters provided
- [x] Contract testing strategy defined
- [x] Type safety enforced throughout
- [x] Nullable fields properly annotated

**Status**: ✅ Mobile contracts complete and type-safe
