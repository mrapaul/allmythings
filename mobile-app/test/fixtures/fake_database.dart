import 'package:all_my_things/data/database/app_database.dart';
import 'package:drift/drift.dart';
import 'package:mockito/mockito.dart';

/// In-memory fake implementation of AppDatabase for testing
class FakeAppDatabase extends Mock implements AppDatabase {
  final List<InventoryItem> _inventoryItems = [];
  final List<Label> _labels = [];
  final List<LabelSearch> _labelSearches = [];

  int _nextItemId = 1;
  int _nextLabelId = 1;

  /// Get all inventory items
  Future<List<InventoryItem>> getAllItems() async {
    return _inventoryItems;
  }

  /// Get a specific item by ID
  Future<InventoryItem?> getItemById(int id) async {
    try {
      return _inventoryItems.firstWhere((item) => item.id == id);
    } catch (e) {
      return null;
    }
  }

  /// Search items by label
  Future<List<InventoryItem>> searchItemsByLabel(String label) async {
    return _inventoryItems
        .where((item) => item.label.toLowerCase().contains(label.toLowerCase()))
        .toList();
  }

  /// Insert a new item
  Future<int> insertItem(InventoryItem item) async {
    final newItem = item.copyWith(id: _nextItemId);
    _inventoryItems.add(newItem);
    _nextItemId++;
    return newItem.id;
  }

  /// Update an existing item
  Future<bool> updateItem(InventoryItem item) async {
    final index = _inventoryItems.indexWhere((i) => i.id == item.id);
    if (index >= 0) {
      _inventoryItems[index] = item.copyWith(updatedAt: DateTime.now());
      return true;
    }
    return false;
  }

  /// Delete an item
  Future<bool> deleteItem(int id) async {
    _inventoryItems.removeWhere((item) => item.id == id);
    return true;
  }

  /// Get all labels
  Future<List<Label>> getAllLabels() async {
    return _labels;
  }

  /// Insert a new label
  Future<int> insertLabel(Label label) async {
    final newLabel = label.copyWith(id: _nextLabelId);
    _labels.add(newLabel);
    _nextLabelId++;
    return newLabel.id;
  }

  /// Update label frequency
  Future<bool> updateLabelFrequency(int id, int frequency) async {
    final index = _labels.indexWhere((l) => l.id == id);
    if (index >= 0) {
      _labels[index] = _labels[index].copyWith(frequency: frequency);
      return true;
    }
    return false;
  }

  /// Clear all data
  Future<void> clearAllData() async {
    _inventoryItems.clear();
    _labels.clear();
    _labelSearches.clear();
    _nextItemId = 1;
    _nextLabelId = 1;
  }

  /// Get items count
  Future<int> getItemsCount() async {
    return _inventoryItems.length;
  }

  /// Get items paginated
  Future<List<InventoryItem>> getItemsPaginated({
    int offset = 0,
    int limit = 10,
  }) async {
    return _inventoryItems.skip(offset).take(limit).toList();
  }
}

/// Extension on InventoryItem for copyWith functionality
extension InventoryItemCopyWith on InventoryItem {
  InventoryItem copyWith({
    int? id,
    String? label,
    String? imagePath,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? location,
  }) {
    return InventoryItem(
      id: id ?? this.id,
      label: label ?? this.label,
      imagePath: imagePath ?? this.imagePath,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      location: location ?? this.location,
    );
  }
}

/// Extension on Label for copyWith functionality
extension LabelCopyWith on Label {
  Label copyWith({
    int? id,
    String? name,
    int? frequency,
  }) {
    return Label(
      id: id ?? this.id,
      name: name ?? this.name,
      frequency: frequency ?? this.frequency,
    );
  }
}
