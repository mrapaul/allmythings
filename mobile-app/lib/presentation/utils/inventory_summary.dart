import 'dart:convert';

import 'package:all_my_things/data/database/app_database.dart';

/// Lightweight projection of an [InventoryItem] for the masonry tile.
/// Keeps the home feed from doing N+1 label lookups — derives label /
/// category / aspect from the embedded SceneObservation JSON.
///
/// All fields fail-soft: a malformed `detectionData` payload yields a
/// blank summary rather than crashing the feed.
class InventorySummary {
  const InventorySummary({
    required this.label,
    required this.category,
    required this.aspectRatio,
    required this.tagCount,
  });

  /// Human-readable primary label ("Sofa", "Lamp", etc.). May be blank
  /// when the SceneObservation is empty (failed/pending items).
  final String label;

  /// Category bucket the home filter cycles through. Falls back to
  /// "Other" when nothing better is available.
  final String category;

  /// height / width — drives the masonry tile shape.
  final double aspectRatio;

  /// Tag count from the structured attributes — used only for stat counters.
  final int tagCount;

  /// Pulls the first detection out of an InventoryItem's detectionData JSON
  /// and projects it into a tile-friendly summary. Defensive — returns an
  /// empty summary if anything's malformed (any throw, not just
  /// FormatException, because cast errors on partial payloads are common
  /// and we'd rather show a blank tile than crash the feed).
  static InventorySummary fromItem(InventoryItem item) {
    if (item.detectionData.isEmpty || item.detectionData == '{}') {
      return _empty();
    }
    try {
      final decoded = jsonDecode(item.detectionData);
      if (decoded is! Map<String, dynamic>) return _empty();
      final detections = decoded['detections'];
      if (detections is! List || detections.isEmpty) return _empty();
      final first = detections.first;
      if (first is! Map<String, dynamic>) return _empty();

      final rawLabel = first['primaryLabel'];
      final label = rawLabel is String ? rawLabel.trim() : '';
      final attrs = first['vlmStructuredAttributes'];
      final attrsMap =
          attrs is Map<String, dynamic> ? attrs : <String, dynamic>{};
      final category = _extractCategory(attrsMap, label);
      final aspect = _extractAspect(first['bbox']);
      final tagCount = attrsMap.length;

      return InventorySummary(
        label: label,
        category: category,
        aspectRatio: aspect,
        tagCount: tagCount,
      );
    } catch (_) {
      // Any malformed payload — JSON cast error, missing keys, etc.
      // Return an empty summary so the feed renders the row blank
      // rather than crashing the entire grid.
      return _empty();
    }
  }

  static InventorySummary _empty() => const InventorySummary(
        label: '',
        category: 'Other',
        aspectRatio: 1,
        tagCount: 0,
      );

  static String _extractCategory(Map<String, dynamic> attrs, String fallback) {
    for (final key in const ['category', 'subcategory', 'type', 'class']) {
      final v = attrs[key];
      if (v is String && v.trim().isNotEmpty) return _humanize(v);
    }
    return fallback.isNotEmpty ? _humanize(fallback) : 'Other';
  }

  static double _extractAspect(dynamic bbox) {
    if (bbox is! Map) return 1;
    final w = (bbox['width'] as num?)?.toDouble() ?? 0;
    final h = (bbox['height'] as num?)?.toDouble() ?? 0;
    if (w <= 0 || h <= 0) return 1;
    return h / w;
  }

  static String _humanize(String raw) {
    final cleaned = raw.replaceAll('_', ' ').trim();
    if (cleaned.isEmpty) return 'Other';
    return cleaned[0].toUpperCase() + cleaned.substring(1);
  }
}
