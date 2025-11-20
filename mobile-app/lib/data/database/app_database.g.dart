// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $InventoryItemsTable extends InventoryItems
    with TableInfo<$InventoryItemsTable, InventoryItem> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $InventoryItemsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _photoPathMeta = const VerificationMeta(
    'photoPath',
  );
  @override
  late final GeneratedColumn<String> photoPath = GeneratedColumn<String>(
    'photo_path',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _thumbnailPathMeta = const VerificationMeta(
    'thumbnailPath',
  );
  @override
  late final GeneratedColumn<String> thumbnailPath = GeneratedColumn<String>(
    'thumbnail_path',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _detectionDataMeta = const VerificationMeta(
    'detectionData',
  );
  @override
  late final GeneratedColumn<String> detectionData = GeneratedColumn<String>(
    'detection_data',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    photoPath,
    thumbnailPath,
    detectionData,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'inventory_items';
  @override
  VerificationContext validateIntegrity(
    Insertable<InventoryItem> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('photo_path')) {
      context.handle(
        _photoPathMeta,
        photoPath.isAcceptableOrUnknown(data['photo_path']!, _photoPathMeta),
      );
    } else if (isInserting) {
      context.missing(_photoPathMeta);
    }
    if (data.containsKey('thumbnail_path')) {
      context.handle(
        _thumbnailPathMeta,
        thumbnailPath.isAcceptableOrUnknown(
          data['thumbnail_path']!,
          _thumbnailPathMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_thumbnailPathMeta);
    }
    if (data.containsKey('detection_data')) {
      context.handle(
        _detectionDataMeta,
        detectionData.isAcceptableOrUnknown(
          data['detection_data']!,
          _detectionDataMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_detectionDataMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  InventoryItem map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return InventoryItem(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      photoPath: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}photo_path'],
      )!,
      thumbnailPath: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}thumbnail_path'],
      )!,
      detectionData: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}detection_data'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $InventoryItemsTable createAlias(String alias) {
    return $InventoryItemsTable(attachedDatabase, alias);
  }
}

class InventoryItem extends DataClass implements Insertable<InventoryItem> {
  /// Primary key
  final int id;

  /// Absolute path to full-resolution photo
  final String photoPath;

  /// Absolute path to thumbnail (256x256)
  final String thumbnailPath;

  /// JSON: detection metadata (bounding boxes, confidence, etc.)
  final String detectionData;

  /// Timestamp when item was created
  final DateTime createdAt;

  /// Timestamp when item was last modified
  final DateTime updatedAt;
  const InventoryItem({
    required this.id,
    required this.photoPath,
    required this.thumbnailPath,
    required this.detectionData,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['photo_path'] = Variable<String>(photoPath);
    map['thumbnail_path'] = Variable<String>(thumbnailPath);
    map['detection_data'] = Variable<String>(detectionData);
    map['created_at'] = Variable<DateTime>(createdAt);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  InventoryItemsCompanion toCompanion(bool nullToAbsent) {
    return InventoryItemsCompanion(
      id: Value(id),
      photoPath: Value(photoPath),
      thumbnailPath: Value(thumbnailPath),
      detectionData: Value(detectionData),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory InventoryItem.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return InventoryItem(
      id: serializer.fromJson<int>(json['id']),
      photoPath: serializer.fromJson<String>(json['photoPath']),
      thumbnailPath: serializer.fromJson<String>(json['thumbnailPath']),
      detectionData: serializer.fromJson<String>(json['detectionData']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'photoPath': serializer.toJson<String>(photoPath),
      'thumbnailPath': serializer.toJson<String>(thumbnailPath),
      'detectionData': serializer.toJson<String>(detectionData),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  InventoryItem copyWith({
    int? id,
    String? photoPath,
    String? thumbnailPath,
    String? detectionData,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) => InventoryItem(
    id: id ?? this.id,
    photoPath: photoPath ?? this.photoPath,
    thumbnailPath: thumbnailPath ?? this.thumbnailPath,
    detectionData: detectionData ?? this.detectionData,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  InventoryItem copyWithCompanion(InventoryItemsCompanion data) {
    return InventoryItem(
      id: data.id.present ? data.id.value : this.id,
      photoPath: data.photoPath.present ? data.photoPath.value : this.photoPath,
      thumbnailPath: data.thumbnailPath.present
          ? data.thumbnailPath.value
          : this.thumbnailPath,
      detectionData: data.detectionData.present
          ? data.detectionData.value
          : this.detectionData,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('InventoryItem(')
          ..write('id: $id, ')
          ..write('photoPath: $photoPath, ')
          ..write('thumbnailPath: $thumbnailPath, ')
          ..write('detectionData: $detectionData, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    photoPath,
    thumbnailPath,
    detectionData,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is InventoryItem &&
          other.id == this.id &&
          other.photoPath == this.photoPath &&
          other.thumbnailPath == this.thumbnailPath &&
          other.detectionData == this.detectionData &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class InventoryItemsCompanion extends UpdateCompanion<InventoryItem> {
  final Value<int> id;
  final Value<String> photoPath;
  final Value<String> thumbnailPath;
  final Value<String> detectionData;
  final Value<DateTime> createdAt;
  final Value<DateTime> updatedAt;
  const InventoryItemsCompanion({
    this.id = const Value.absent(),
    this.photoPath = const Value.absent(),
    this.thumbnailPath = const Value.absent(),
    this.detectionData = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
  });
  InventoryItemsCompanion.insert({
    this.id = const Value.absent(),
    required String photoPath,
    required String thumbnailPath,
    required String detectionData,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) : photoPath = Value(photoPath),
       thumbnailPath = Value(thumbnailPath),
       detectionData = Value(detectionData),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<InventoryItem> custom({
    Expression<int>? id,
    Expression<String>? photoPath,
    Expression<String>? thumbnailPath,
    Expression<String>? detectionData,
    Expression<DateTime>? createdAt,
    Expression<DateTime>? updatedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (photoPath != null) 'photo_path': photoPath,
      if (thumbnailPath != null) 'thumbnail_path': thumbnailPath,
      if (detectionData != null) 'detection_data': detectionData,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
    });
  }

  InventoryItemsCompanion copyWith({
    Value<int>? id,
    Value<String>? photoPath,
    Value<String>? thumbnailPath,
    Value<String>? detectionData,
    Value<DateTime>? createdAt,
    Value<DateTime>? updatedAt,
  }) {
    return InventoryItemsCompanion(
      id: id ?? this.id,
      photoPath: photoPath ?? this.photoPath,
      thumbnailPath: thumbnailPath ?? this.thumbnailPath,
      detectionData: detectionData ?? this.detectionData,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (photoPath.present) {
      map['photo_path'] = Variable<String>(photoPath.value);
    }
    if (thumbnailPath.present) {
      map['thumbnail_path'] = Variable<String>(thumbnailPath.value);
    }
    if (detectionData.present) {
      map['detection_data'] = Variable<String>(detectionData.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('InventoryItemsCompanion(')
          ..write('id: $id, ')
          ..write('photoPath: $photoPath, ')
          ..write('thumbnailPath: $thumbnailPath, ')
          ..write('detectionData: $detectionData, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }
}

class $LabelsTable extends Labels with TableInfo<$LabelsTable, Label> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LabelsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _itemIdMeta = const VerificationMeta('itemId');
  @override
  late final GeneratedColumn<int> itemId = GeneratedColumn<int>(
    'item_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES inventory_items (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, itemId, key, value, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'labels';
  @override
  VerificationContext validateIntegrity(
    Insertable<Label> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('item_id')) {
      context.handle(
        _itemIdMeta,
        itemId.isAcceptableOrUnknown(data['item_id']!, _itemIdMeta),
      );
    } else if (isInserting) {
      context.missing(_itemIdMeta);
    }
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  List<Set<GeneratedColumn>> get uniqueKeys => [
    {itemId, key, value},
  ];
  @override
  Label map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Label(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      itemId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}item_id'],
      )!,
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      ),
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $LabelsTable createAlias(String alias) {
    return $LabelsTable(attachedDatabase, alias);
  }
}

class Label extends DataClass implements Insertable<Label> {
  /// Primary key
  final int id;

  /// Foreign key to inventory_items table
  final int itemId;

  /// Optional category (type, color, brand, room)
  final String? key;

  /// Label value (laptop, black, Apple, bedroom)
  final String value;

  /// Timestamp when label was added
  final DateTime createdAt;
  const Label({
    required this.id,
    required this.itemId,
    this.key,
    required this.value,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['item_id'] = Variable<int>(itemId);
    if (!nullToAbsent || key != null) {
      map['key'] = Variable<String>(key);
    }
    map['value'] = Variable<String>(value);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  LabelsCompanion toCompanion(bool nullToAbsent) {
    return LabelsCompanion(
      id: Value(id),
      itemId: Value(itemId),
      key: key == null && nullToAbsent ? const Value.absent() : Value(key),
      value: Value(value),
      createdAt: Value(createdAt),
    );
  }

  factory Label.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Label(
      id: serializer.fromJson<int>(json['id']),
      itemId: serializer.fromJson<int>(json['itemId']),
      key: serializer.fromJson<String?>(json['key']),
      value: serializer.fromJson<String>(json['value']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'itemId': serializer.toJson<int>(itemId),
      'key': serializer.toJson<String?>(key),
      'value': serializer.toJson<String>(value),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  Label copyWith({
    int? id,
    int? itemId,
    Value<String?> key = const Value.absent(),
    String? value,
    DateTime? createdAt,
  }) => Label(
    id: id ?? this.id,
    itemId: itemId ?? this.itemId,
    key: key.present ? key.value : this.key,
    value: value ?? this.value,
    createdAt: createdAt ?? this.createdAt,
  );
  Label copyWithCompanion(LabelsCompanion data) {
    return Label(
      id: data.id.present ? data.id.value : this.id,
      itemId: data.itemId.present ? data.itemId.value : this.itemId,
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Label(')
          ..write('id: $id, ')
          ..write('itemId: $itemId, ')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, itemId, key, value, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Label &&
          other.id == this.id &&
          other.itemId == this.itemId &&
          other.key == this.key &&
          other.value == this.value &&
          other.createdAt == this.createdAt);
}

class LabelsCompanion extends UpdateCompanion<Label> {
  final Value<int> id;
  final Value<int> itemId;
  final Value<String?> key;
  final Value<String> value;
  final Value<DateTime> createdAt;
  const LabelsCompanion({
    this.id = const Value.absent(),
    this.itemId = const Value.absent(),
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  LabelsCompanion.insert({
    this.id = const Value.absent(),
    required int itemId,
    this.key = const Value.absent(),
    required String value,
    required DateTime createdAt,
  }) : itemId = Value(itemId),
       value = Value(value),
       createdAt = Value(createdAt);
  static Insertable<Label> custom({
    Expression<int>? id,
    Expression<int>? itemId,
    Expression<String>? key,
    Expression<String>? value,
    Expression<DateTime>? createdAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (itemId != null) 'item_id': itemId,
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (createdAt != null) 'created_at': createdAt,
    });
  }

  LabelsCompanion copyWith({
    Value<int>? id,
    Value<int>? itemId,
    Value<String?>? key,
    Value<String>? value,
    Value<DateTime>? createdAt,
  }) {
    return LabelsCompanion(
      id: id ?? this.id,
      itemId: itemId ?? this.itemId,
      key: key ?? this.key,
      value: value ?? this.value,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (itemId.present) {
      map['item_id'] = Variable<int>(itemId.value);
    }
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LabelsCompanion(')
          ..write('id: $id, ')
          ..write('itemId: $itemId, ')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }
}

class $LabelSearchFtsTable extends LabelSearchFts
    with TableInfo<$LabelSearchFtsTable, LabelSearchEntry> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LabelSearchFtsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _labelIdMeta = const VerificationMeta(
    'labelId',
  );
  @override
  late final GeneratedColumn<int> labelId = GeneratedColumn<int>(
    'label_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    $customConstraints: 'NOT NULL',
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [labelId, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'label_search_fts';
  @override
  VerificationContext validateIntegrity(
    Insertable<LabelSearchEntry> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('label_id')) {
      context.handle(
        _labelIdMeta,
        labelId.isAcceptableOrUnknown(data['label_id']!, _labelIdMeta),
      );
    } else if (isInserting) {
      context.missing(_labelIdMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {labelId};
  @override
  LabelSearchEntry map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LabelSearchEntry(
      labelId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}label_id'],
      )!,
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      )!,
    );
  }

  @override
  $LabelSearchFtsTable createAlias(String alias) {
    return $LabelSearchFtsTable(attachedDatabase, alias);
  }

  @override
  bool get withoutRowId => true;
}

class LabelSearchEntry extends DataClass
    implements Insertable<LabelSearchEntry> {
  /// Reference to labels(id) for result joining
  final int labelId;

  /// Label value indexed for full-text search
  final String value;
  const LabelSearchEntry({required this.labelId, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['label_id'] = Variable<int>(labelId);
    map['value'] = Variable<String>(value);
    return map;
  }

  LabelSearchFtsCompanion toCompanion(bool nullToAbsent) {
    return LabelSearchFtsCompanion(
      labelId: Value(labelId),
      value: Value(value),
    );
  }

  factory LabelSearchEntry.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LabelSearchEntry(
      labelId: serializer.fromJson<int>(json['labelId']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'labelId': serializer.toJson<int>(labelId),
      'value': serializer.toJson<String>(value),
    };
  }

  LabelSearchEntry copyWith({int? labelId, String? value}) => LabelSearchEntry(
    labelId: labelId ?? this.labelId,
    value: value ?? this.value,
  );
  LabelSearchEntry copyWithCompanion(LabelSearchFtsCompanion data) {
    return LabelSearchEntry(
      labelId: data.labelId.present ? data.labelId.value : this.labelId,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LabelSearchEntry(')
          ..write('labelId: $labelId, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(labelId, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LabelSearchEntry &&
          other.labelId == this.labelId &&
          other.value == this.value);
}

class LabelSearchFtsCompanion extends UpdateCompanion<LabelSearchEntry> {
  final Value<int> labelId;
  final Value<String> value;
  const LabelSearchFtsCompanion({
    this.labelId = const Value.absent(),
    this.value = const Value.absent(),
  });
  LabelSearchFtsCompanion.insert({required int labelId, required String value})
    : labelId = Value(labelId),
      value = Value(value);
  static Insertable<LabelSearchEntry> custom({
    Expression<int>? labelId,
    Expression<String>? value,
  }) {
    return RawValuesInsertable({
      if (labelId != null) 'label_id': labelId,
      if (value != null) 'value': value,
    });
  }

  LabelSearchFtsCompanion copyWith({
    Value<int>? labelId,
    Value<String>? value,
  }) {
    return LabelSearchFtsCompanion(
      labelId: labelId ?? this.labelId,
      value: value ?? this.value,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (labelId.present) {
      map['label_id'] = Variable<int>(labelId.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LabelSearchFtsCompanion(')
          ..write('labelId: $labelId, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }
}

class $CategoriesTable extends Categories
    with TableInfo<$CategoriesTable, Category> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CategoriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    additionalChecks: GeneratedColumn.checkTextLength(
      minTextLength: 1,
      maxTextLength: 100,
    ),
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _iconNameMeta = const VerificationMeta(
    'iconName',
  );
  @override
  late final GeneratedColumn<String> iconName = GeneratedColumn<String>(
    'icon_name',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _colorHexMeta = const VerificationMeta(
    'colorHex',
  );
  @override
  late final GeneratedColumn<String> colorHex = GeneratedColumn<String>(
    'color_hex',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _isSystemMeta = const VerificationMeta(
    'isSystem',
  );
  @override
  late final GeneratedColumn<bool> isSystem = GeneratedColumn<bool>(
    'is_system',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_system" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    iconName,
    colorHex,
    isSystem,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'categories';
  @override
  VerificationContext validateIntegrity(
    Insertable<Category> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('icon_name')) {
      context.handle(
        _iconNameMeta,
        iconName.isAcceptableOrUnknown(data['icon_name']!, _iconNameMeta),
      );
    }
    if (data.containsKey('color_hex')) {
      context.handle(
        _colorHexMeta,
        colorHex.isAcceptableOrUnknown(data['color_hex']!, _colorHexMeta),
      );
    }
    if (data.containsKey('is_system')) {
      context.handle(
        _isSystemMeta,
        isSystem.isAcceptableOrUnknown(data['is_system']!, _isSystemMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Category map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Category(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      iconName: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}icon_name'],
      ),
      colorHex: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}color_hex'],
      ),
      isSystem: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_system'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $CategoriesTable createAlias(String alias) {
    return $CategoriesTable(attachedDatabase, alias);
  }
}

class Category extends DataClass implements Insertable<Category> {
  /// Primary key
  final int id;

  /// Category name (e.g., "Kitchen", "Living Room", "Electronics")
  final String name;

  /// Optional icon name for UI
  final String? iconName;

  /// Color hex code for UI (e.g., "#FF5733")
  final String? colorHex;

  /// Whether this is a system-defined category
  final bool isSystem;

  /// Timestamp when created
  final DateTime createdAt;
  const Category({
    required this.id,
    required this.name,
    this.iconName,
    this.colorHex,
    required this.isSystem,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || iconName != null) {
      map['icon_name'] = Variable<String>(iconName);
    }
    if (!nullToAbsent || colorHex != null) {
      map['color_hex'] = Variable<String>(colorHex);
    }
    map['is_system'] = Variable<bool>(isSystem);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  CategoriesCompanion toCompanion(bool nullToAbsent) {
    return CategoriesCompanion(
      id: Value(id),
      name: Value(name),
      iconName: iconName == null && nullToAbsent
          ? const Value.absent()
          : Value(iconName),
      colorHex: colorHex == null && nullToAbsent
          ? const Value.absent()
          : Value(colorHex),
      isSystem: Value(isSystem),
      createdAt: Value(createdAt),
    );
  }

  factory Category.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Category(
      id: serializer.fromJson<int>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      iconName: serializer.fromJson<String?>(json['iconName']),
      colorHex: serializer.fromJson<String?>(json['colorHex']),
      isSystem: serializer.fromJson<bool>(json['isSystem']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'name': serializer.toJson<String>(name),
      'iconName': serializer.toJson<String?>(iconName),
      'colorHex': serializer.toJson<String?>(colorHex),
      'isSystem': serializer.toJson<bool>(isSystem),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  Category copyWith({
    int? id,
    String? name,
    Value<String?> iconName = const Value.absent(),
    Value<String?> colorHex = const Value.absent(),
    bool? isSystem,
    DateTime? createdAt,
  }) => Category(
    id: id ?? this.id,
    name: name ?? this.name,
    iconName: iconName.present ? iconName.value : this.iconName,
    colorHex: colorHex.present ? colorHex.value : this.colorHex,
    isSystem: isSystem ?? this.isSystem,
    createdAt: createdAt ?? this.createdAt,
  );
  Category copyWithCompanion(CategoriesCompanion data) {
    return Category(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      iconName: data.iconName.present ? data.iconName.value : this.iconName,
      colorHex: data.colorHex.present ? data.colorHex.value : this.colorHex,
      isSystem: data.isSystem.present ? data.isSystem.value : this.isSystem,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Category(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('iconName: $iconName, ')
          ..write('colorHex: $colorHex, ')
          ..write('isSystem: $isSystem, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, name, iconName, colorHex, isSystem, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Category &&
          other.id == this.id &&
          other.name == this.name &&
          other.iconName == this.iconName &&
          other.colorHex == this.colorHex &&
          other.isSystem == this.isSystem &&
          other.createdAt == this.createdAt);
}

class CategoriesCompanion extends UpdateCompanion<Category> {
  final Value<int> id;
  final Value<String> name;
  final Value<String?> iconName;
  final Value<String?> colorHex;
  final Value<bool> isSystem;
  final Value<DateTime> createdAt;
  const CategoriesCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.iconName = const Value.absent(),
    this.colorHex = const Value.absent(),
    this.isSystem = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  CategoriesCompanion.insert({
    this.id = const Value.absent(),
    required String name,
    this.iconName = const Value.absent(),
    this.colorHex = const Value.absent(),
    this.isSystem = const Value.absent(),
    required DateTime createdAt,
  }) : name = Value(name),
       createdAt = Value(createdAt);
  static Insertable<Category> custom({
    Expression<int>? id,
    Expression<String>? name,
    Expression<String>? iconName,
    Expression<String>? colorHex,
    Expression<bool>? isSystem,
    Expression<DateTime>? createdAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (iconName != null) 'icon_name': iconName,
      if (colorHex != null) 'color_hex': colorHex,
      if (isSystem != null) 'is_system': isSystem,
      if (createdAt != null) 'created_at': createdAt,
    });
  }

  CategoriesCompanion copyWith({
    Value<int>? id,
    Value<String>? name,
    Value<String?>? iconName,
    Value<String?>? colorHex,
    Value<bool>? isSystem,
    Value<DateTime>? createdAt,
  }) {
    return CategoriesCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      iconName: iconName ?? this.iconName,
      colorHex: colorHex ?? this.colorHex,
      isSystem: isSystem ?? this.isSystem,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (iconName.present) {
      map['icon_name'] = Variable<String>(iconName.value);
    }
    if (colorHex.present) {
      map['color_hex'] = Variable<String>(colorHex.value);
    }
    if (isSystem.present) {
      map['is_system'] = Variable<bool>(isSystem.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CategoriesCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('iconName: $iconName, ')
          ..write('colorHex: $colorHex, ')
          ..write('isSystem: $isSystem, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }
}

class $ItemCategoriesTable extends ItemCategories
    with TableInfo<$ItemCategoriesTable, ItemCategory> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ItemCategoriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _itemIdMeta = const VerificationMeta('itemId');
  @override
  late final GeneratedColumn<int> itemId = GeneratedColumn<int>(
    'item_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES inventory_items (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _categoryIdMeta = const VerificationMeta(
    'categoryId',
  );
  @override
  late final GeneratedColumn<int> categoryId = GeneratedColumn<int>(
    'category_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES categories (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [itemId, categoryId, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'item_categories';
  @override
  VerificationContext validateIntegrity(
    Insertable<ItemCategory> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('item_id')) {
      context.handle(
        _itemIdMeta,
        itemId.isAcceptableOrUnknown(data['item_id']!, _itemIdMeta),
      );
    } else if (isInserting) {
      context.missing(_itemIdMeta);
    }
    if (data.containsKey('category_id')) {
      context.handle(
        _categoryIdMeta,
        categoryId.isAcceptableOrUnknown(data['category_id']!, _categoryIdMeta),
      );
    } else if (isInserting) {
      context.missing(_categoryIdMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {itemId, categoryId};
  @override
  ItemCategory map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ItemCategory(
      itemId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}item_id'],
      )!,
      categoryId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}category_id'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $ItemCategoriesTable createAlias(String alias) {
    return $ItemCategoriesTable(attachedDatabase, alias);
  }
}

class ItemCategory extends DataClass implements Insertable<ItemCategory> {
  /// Reference to inventory item
  final int itemId;

  /// Reference to category
  final int categoryId;

  /// Timestamp when association was created
  final DateTime createdAt;
  const ItemCategory({
    required this.itemId,
    required this.categoryId,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['item_id'] = Variable<int>(itemId);
    map['category_id'] = Variable<int>(categoryId);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  ItemCategoriesCompanion toCompanion(bool nullToAbsent) {
    return ItemCategoriesCompanion(
      itemId: Value(itemId),
      categoryId: Value(categoryId),
      createdAt: Value(createdAt),
    );
  }

  factory ItemCategory.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ItemCategory(
      itemId: serializer.fromJson<int>(json['itemId']),
      categoryId: serializer.fromJson<int>(json['categoryId']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'itemId': serializer.toJson<int>(itemId),
      'categoryId': serializer.toJson<int>(categoryId),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  ItemCategory copyWith({int? itemId, int? categoryId, DateTime? createdAt}) =>
      ItemCategory(
        itemId: itemId ?? this.itemId,
        categoryId: categoryId ?? this.categoryId,
        createdAt: createdAt ?? this.createdAt,
      );
  ItemCategory copyWithCompanion(ItemCategoriesCompanion data) {
    return ItemCategory(
      itemId: data.itemId.present ? data.itemId.value : this.itemId,
      categoryId: data.categoryId.present
          ? data.categoryId.value
          : this.categoryId,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ItemCategory(')
          ..write('itemId: $itemId, ')
          ..write('categoryId: $categoryId, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(itemId, categoryId, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ItemCategory &&
          other.itemId == this.itemId &&
          other.categoryId == this.categoryId &&
          other.createdAt == this.createdAt);
}

class ItemCategoriesCompanion extends UpdateCompanion<ItemCategory> {
  final Value<int> itemId;
  final Value<int> categoryId;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const ItemCategoriesCompanion({
    this.itemId = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ItemCategoriesCompanion.insert({
    required int itemId,
    required int categoryId,
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  }) : itemId = Value(itemId),
       categoryId = Value(categoryId),
       createdAt = Value(createdAt);
  static Insertable<ItemCategory> custom({
    Expression<int>? itemId,
    Expression<int>? categoryId,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (itemId != null) 'item_id': itemId,
      if (categoryId != null) 'category_id': categoryId,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ItemCategoriesCompanion copyWith({
    Value<int>? itemId,
    Value<int>? categoryId,
    Value<DateTime>? createdAt,
    Value<int>? rowid,
  }) {
    return ItemCategoriesCompanion(
      itemId: itemId ?? this.itemId,
      categoryId: categoryId ?? this.categoryId,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (itemId.present) {
      map['item_id'] = Variable<int>(itemId.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<int>(categoryId.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ItemCategoriesCompanion(')
          ..write('itemId: $itemId, ')
          ..write('categoryId: $categoryId, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SyncQueueTable extends SyncQueue
    with TableInfo<$SyncQueueTable, SyncQueueItem> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncQueueTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _itemIdMeta = const VerificationMeta('itemId');
  @override
  late final GeneratedColumn<int> itemId = GeneratedColumn<int>(
    'item_id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES inventory_items (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _operationMeta = const VerificationMeta(
    'operation',
  );
  @override
  late final GeneratedColumn<String> operation = GeneratedColumn<String>(
    'operation',
    aliasedName,
    false,
    additionalChecks: GeneratedColumn.checkTextLength(
      minTextLength: 1,
      maxTextLength: 10,
    ),
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _retryCountMeta = const VerificationMeta(
    'retryCount',
  );
  @override
  late final GeneratedColumn<int> retryCount = GeneratedColumn<int>(
    'retry_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _lastErrorMeta = const VerificationMeta(
    'lastError',
  );
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
    'last_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _queuedAtMeta = const VerificationMeta(
    'queuedAt',
  );
  @override
  late final GeneratedColumn<DateTime> queuedAt = GeneratedColumn<DateTime>(
    'queued_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _lastAttemptAtMeta = const VerificationMeta(
    'lastAttemptAt',
  );
  @override
  late final GeneratedColumn<DateTime> lastAttemptAt =
      GeneratedColumn<DateTime>(
        'last_attempt_at',
        aliasedName,
        true,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: false,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    itemId,
    operation,
    retryCount,
    lastError,
    queuedAt,
    lastAttemptAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_queue';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncQueueItem> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('item_id')) {
      context.handle(
        _itemIdMeta,
        itemId.isAcceptableOrUnknown(data['item_id']!, _itemIdMeta),
      );
    } else if (isInserting) {
      context.missing(_itemIdMeta);
    }
    if (data.containsKey('operation')) {
      context.handle(
        _operationMeta,
        operation.isAcceptableOrUnknown(data['operation']!, _operationMeta),
      );
    } else if (isInserting) {
      context.missing(_operationMeta);
    }
    if (data.containsKey('retry_count')) {
      context.handle(
        _retryCountMeta,
        retryCount.isAcceptableOrUnknown(data['retry_count']!, _retryCountMeta),
      );
    }
    if (data.containsKey('last_error')) {
      context.handle(
        _lastErrorMeta,
        lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta),
      );
    }
    if (data.containsKey('queued_at')) {
      context.handle(
        _queuedAtMeta,
        queuedAt.isAcceptableOrUnknown(data['queued_at']!, _queuedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_queuedAtMeta);
    }
    if (data.containsKey('last_attempt_at')) {
      context.handle(
        _lastAttemptAtMeta,
        lastAttemptAt.isAcceptableOrUnknown(
          data['last_attempt_at']!,
          _lastAttemptAtMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  SyncQueueItem map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncQueueItem(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      itemId: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}item_id'],
      )!,
      operation: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}operation'],
      )!,
      retryCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}retry_count'],
      )!,
      lastError: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}last_error'],
      ),
      queuedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}queued_at'],
      )!,
      lastAttemptAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}last_attempt_at'],
      ),
    );
  }

  @override
  $SyncQueueTable createAlias(String alias) {
    return $SyncQueueTable(attachedDatabase, alias);
  }
}

class SyncQueueItem extends DataClass implements Insertable<SyncQueueItem> {
  /// Primary key
  final int id;

  /// Reference to inventory item
  final int itemId;

  /// Type of sync operation: 'create', 'update', 'delete'
  final String operation;

  /// Number of retry attempts
  final int retryCount;

  /// Last error message (if any)
  final String? lastError;

  /// Timestamp when queued
  final DateTime queuedAt;

  /// Timestamp of last sync attempt
  final DateTime? lastAttemptAt;
  const SyncQueueItem({
    required this.id,
    required this.itemId,
    required this.operation,
    required this.retryCount,
    this.lastError,
    required this.queuedAt,
    this.lastAttemptAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['item_id'] = Variable<int>(itemId);
    map['operation'] = Variable<String>(operation);
    map['retry_count'] = Variable<int>(retryCount);
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    map['queued_at'] = Variable<DateTime>(queuedAt);
    if (!nullToAbsent || lastAttemptAt != null) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt);
    }
    return map;
  }

  SyncQueueCompanion toCompanion(bool nullToAbsent) {
    return SyncQueueCompanion(
      id: Value(id),
      itemId: Value(itemId),
      operation: Value(operation),
      retryCount: Value(retryCount),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      queuedAt: Value(queuedAt),
      lastAttemptAt: lastAttemptAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastAttemptAt),
    );
  }

  factory SyncQueueItem.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncQueueItem(
      id: serializer.fromJson<int>(json['id']),
      itemId: serializer.fromJson<int>(json['itemId']),
      operation: serializer.fromJson<String>(json['operation']),
      retryCount: serializer.fromJson<int>(json['retryCount']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      queuedAt: serializer.fromJson<DateTime>(json['queuedAt']),
      lastAttemptAt: serializer.fromJson<DateTime?>(json['lastAttemptAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'itemId': serializer.toJson<int>(itemId),
      'operation': serializer.toJson<String>(operation),
      'retryCount': serializer.toJson<int>(retryCount),
      'lastError': serializer.toJson<String?>(lastError),
      'queuedAt': serializer.toJson<DateTime>(queuedAt),
      'lastAttemptAt': serializer.toJson<DateTime?>(lastAttemptAt),
    };
  }

  SyncQueueItem copyWith({
    int? id,
    int? itemId,
    String? operation,
    int? retryCount,
    Value<String?> lastError = const Value.absent(),
    DateTime? queuedAt,
    Value<DateTime?> lastAttemptAt = const Value.absent(),
  }) => SyncQueueItem(
    id: id ?? this.id,
    itemId: itemId ?? this.itemId,
    operation: operation ?? this.operation,
    retryCount: retryCount ?? this.retryCount,
    lastError: lastError.present ? lastError.value : this.lastError,
    queuedAt: queuedAt ?? this.queuedAt,
    lastAttemptAt: lastAttemptAt.present
        ? lastAttemptAt.value
        : this.lastAttemptAt,
  );
  SyncQueueItem copyWithCompanion(SyncQueueCompanion data) {
    return SyncQueueItem(
      id: data.id.present ? data.id.value : this.id,
      itemId: data.itemId.present ? data.itemId.value : this.itemId,
      operation: data.operation.present ? data.operation.value : this.operation,
      retryCount: data.retryCount.present
          ? data.retryCount.value
          : this.retryCount,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      queuedAt: data.queuedAt.present ? data.queuedAt.value : this.queuedAt,
      lastAttemptAt: data.lastAttemptAt.present
          ? data.lastAttemptAt.value
          : this.lastAttemptAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncQueueItem(')
          ..write('id: $id, ')
          ..write('itemId: $itemId, ')
          ..write('operation: $operation, ')
          ..write('retryCount: $retryCount, ')
          ..write('lastError: $lastError, ')
          ..write('queuedAt: $queuedAt, ')
          ..write('lastAttemptAt: $lastAttemptAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    itemId,
    operation,
    retryCount,
    lastError,
    queuedAt,
    lastAttemptAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncQueueItem &&
          other.id == this.id &&
          other.itemId == this.itemId &&
          other.operation == this.operation &&
          other.retryCount == this.retryCount &&
          other.lastError == this.lastError &&
          other.queuedAt == this.queuedAt &&
          other.lastAttemptAt == this.lastAttemptAt);
}

class SyncQueueCompanion extends UpdateCompanion<SyncQueueItem> {
  final Value<int> id;
  final Value<int> itemId;
  final Value<String> operation;
  final Value<int> retryCount;
  final Value<String?> lastError;
  final Value<DateTime> queuedAt;
  final Value<DateTime?> lastAttemptAt;
  const SyncQueueCompanion({
    this.id = const Value.absent(),
    this.itemId = const Value.absent(),
    this.operation = const Value.absent(),
    this.retryCount = const Value.absent(),
    this.lastError = const Value.absent(),
    this.queuedAt = const Value.absent(),
    this.lastAttemptAt = const Value.absent(),
  });
  SyncQueueCompanion.insert({
    this.id = const Value.absent(),
    required int itemId,
    required String operation,
    this.retryCount = const Value.absent(),
    this.lastError = const Value.absent(),
    required DateTime queuedAt,
    this.lastAttemptAt = const Value.absent(),
  }) : itemId = Value(itemId),
       operation = Value(operation),
       queuedAt = Value(queuedAt);
  static Insertable<SyncQueueItem> custom({
    Expression<int>? id,
    Expression<int>? itemId,
    Expression<String>? operation,
    Expression<int>? retryCount,
    Expression<String>? lastError,
    Expression<DateTime>? queuedAt,
    Expression<DateTime>? lastAttemptAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (itemId != null) 'item_id': itemId,
      if (operation != null) 'operation': operation,
      if (retryCount != null) 'retry_count': retryCount,
      if (lastError != null) 'last_error': lastError,
      if (queuedAt != null) 'queued_at': queuedAt,
      if (lastAttemptAt != null) 'last_attempt_at': lastAttemptAt,
    });
  }

  SyncQueueCompanion copyWith({
    Value<int>? id,
    Value<int>? itemId,
    Value<String>? operation,
    Value<int>? retryCount,
    Value<String?>? lastError,
    Value<DateTime>? queuedAt,
    Value<DateTime?>? lastAttemptAt,
  }) {
    return SyncQueueCompanion(
      id: id ?? this.id,
      itemId: itemId ?? this.itemId,
      operation: operation ?? this.operation,
      retryCount: retryCount ?? this.retryCount,
      lastError: lastError ?? this.lastError,
      queuedAt: queuedAt ?? this.queuedAt,
      lastAttemptAt: lastAttemptAt ?? this.lastAttemptAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (itemId.present) {
      map['item_id'] = Variable<int>(itemId.value);
    }
    if (operation.present) {
      map['operation'] = Variable<String>(operation.value);
    }
    if (retryCount.present) {
      map['retry_count'] = Variable<int>(retryCount.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (queuedAt.present) {
      map['queued_at'] = Variable<DateTime>(queuedAt.value);
    }
    if (lastAttemptAt.present) {
      map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncQueueCompanion(')
          ..write('id: $id, ')
          ..write('itemId: $itemId, ')
          ..write('operation: $operation, ')
          ..write('retryCount: $retryCount, ')
          ..write('lastError: $lastError, ')
          ..write('queuedAt: $queuedAt, ')
          ..write('lastAttemptAt: $lastAttemptAt')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $InventoryItemsTable inventoryItems = $InventoryItemsTable(this);
  late final $LabelsTable labels = $LabelsTable(this);
  late final $LabelSearchFtsTable labelSearchFts = $LabelSearchFtsTable(this);
  late final $CategoriesTable categories = $CategoriesTable(this);
  late final $ItemCategoriesTable itemCategories = $ItemCategoriesTable(this);
  late final $SyncQueueTable syncQueue = $SyncQueueTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    inventoryItems,
    labels,
    labelSearchFts,
    categories,
    itemCategories,
    syncQueue,
  ];
  @override
  StreamQueryUpdateRules get streamUpdateRules => const StreamQueryUpdateRules([
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'inventory_items',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('labels', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'inventory_items',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('item_categories', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'categories',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('item_categories', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'inventory_items',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('sync_queue', kind: UpdateKind.delete)],
    ),
  ]);
}

typedef $$InventoryItemsTableCreateCompanionBuilder =
    InventoryItemsCompanion Function({
      Value<int> id,
      required String photoPath,
      required String thumbnailPath,
      required String detectionData,
      required DateTime createdAt,
      required DateTime updatedAt,
    });
typedef $$InventoryItemsTableUpdateCompanionBuilder =
    InventoryItemsCompanion Function({
      Value<int> id,
      Value<String> photoPath,
      Value<String> thumbnailPath,
      Value<String> detectionData,
      Value<DateTime> createdAt,
      Value<DateTime> updatedAt,
    });

final class $$InventoryItemsTableReferences
    extends BaseReferences<_$AppDatabase, $InventoryItemsTable, InventoryItem> {
  $$InventoryItemsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static MultiTypedResultKey<$LabelsTable, List<Label>> _labelsRefsTable(
    _$AppDatabase db,
  ) => MultiTypedResultKey.fromTable(
    db.labels,
    aliasName: $_aliasNameGenerator(db.inventoryItems.id, db.labels.itemId),
  );

  $$LabelsTableProcessedTableManager get labelsRefs {
    final manager = $$LabelsTableTableManager(
      $_db,
      $_db.labels,
    ).filter((f) => f.itemId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_labelsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$ItemCategoriesTable, List<ItemCategory>>
  _itemCategoriesRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.itemCategories,
    aliasName: $_aliasNameGenerator(
      db.inventoryItems.id,
      db.itemCategories.itemId,
    ),
  );

  $$ItemCategoriesTableProcessedTableManager get itemCategoriesRefs {
    final manager = $$ItemCategoriesTableTableManager(
      $_db,
      $_db.itemCategories,
    ).filter((f) => f.itemId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_itemCategoriesRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$SyncQueueTable, List<SyncQueueItem>>
  _syncQueueRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.syncQueue,
    aliasName: $_aliasNameGenerator(db.inventoryItems.id, db.syncQueue.itemId),
  );

  $$SyncQueueTableProcessedTableManager get syncQueueRefs {
    final manager = $$SyncQueueTableTableManager(
      $_db,
      $_db.syncQueue,
    ).filter((f) => f.itemId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_syncQueueRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$InventoryItemsTableFilterComposer
    extends Composer<_$AppDatabase, $InventoryItemsTable> {
  $$InventoryItemsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get photoPath => $composableBuilder(
    column: $table.photoPath,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get thumbnailPath => $composableBuilder(
    column: $table.thumbnailPath,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get detectionData => $composableBuilder(
    column: $table.detectionData,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> labelsRefs(
    Expression<bool> Function($$LabelsTableFilterComposer f) f,
  ) {
    final $$LabelsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.labels,
      getReferencedColumn: (t) => t.itemId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$LabelsTableFilterComposer(
            $db: $db,
            $table: $db.labels,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> itemCategoriesRefs(
    Expression<bool> Function($$ItemCategoriesTableFilterComposer f) f,
  ) {
    final $$ItemCategoriesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.itemCategories,
      getReferencedColumn: (t) => t.itemId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ItemCategoriesTableFilterComposer(
            $db: $db,
            $table: $db.itemCategories,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> syncQueueRefs(
    Expression<bool> Function($$SyncQueueTableFilterComposer f) f,
  ) {
    final $$SyncQueueTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.syncQueue,
      getReferencedColumn: (t) => t.itemId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SyncQueueTableFilterComposer(
            $db: $db,
            $table: $db.syncQueue,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$InventoryItemsTableOrderingComposer
    extends Composer<_$AppDatabase, $InventoryItemsTable> {
  $$InventoryItemsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get photoPath => $composableBuilder(
    column: $table.photoPath,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get thumbnailPath => $composableBuilder(
    column: $table.thumbnailPath,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get detectionData => $composableBuilder(
    column: $table.detectionData,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$InventoryItemsTableAnnotationComposer
    extends Composer<_$AppDatabase, $InventoryItemsTable> {
  $$InventoryItemsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get photoPath =>
      $composableBuilder(column: $table.photoPath, builder: (column) => column);

  GeneratedColumn<String> get thumbnailPath => $composableBuilder(
    column: $table.thumbnailPath,
    builder: (column) => column,
  );

  GeneratedColumn<String> get detectionData => $composableBuilder(
    column: $table.detectionData,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  Expression<T> labelsRefs<T extends Object>(
    Expression<T> Function($$LabelsTableAnnotationComposer a) f,
  ) {
    final $$LabelsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.labels,
      getReferencedColumn: (t) => t.itemId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$LabelsTableAnnotationComposer(
            $db: $db,
            $table: $db.labels,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> itemCategoriesRefs<T extends Object>(
    Expression<T> Function($$ItemCategoriesTableAnnotationComposer a) f,
  ) {
    final $$ItemCategoriesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.itemCategories,
      getReferencedColumn: (t) => t.itemId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ItemCategoriesTableAnnotationComposer(
            $db: $db,
            $table: $db.itemCategories,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> syncQueueRefs<T extends Object>(
    Expression<T> Function($$SyncQueueTableAnnotationComposer a) f,
  ) {
    final $$SyncQueueTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.syncQueue,
      getReferencedColumn: (t) => t.itemId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$SyncQueueTableAnnotationComposer(
            $db: $db,
            $table: $db.syncQueue,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$InventoryItemsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $InventoryItemsTable,
          InventoryItem,
          $$InventoryItemsTableFilterComposer,
          $$InventoryItemsTableOrderingComposer,
          $$InventoryItemsTableAnnotationComposer,
          $$InventoryItemsTableCreateCompanionBuilder,
          $$InventoryItemsTableUpdateCompanionBuilder,
          (InventoryItem, $$InventoryItemsTableReferences),
          InventoryItem,
          PrefetchHooks Function({
            bool labelsRefs,
            bool itemCategoriesRefs,
            bool syncQueueRefs,
          })
        > {
  $$InventoryItemsTableTableManager(
    _$AppDatabase db,
    $InventoryItemsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$InventoryItemsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$InventoryItemsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$InventoryItemsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> photoPath = const Value.absent(),
                Value<String> thumbnailPath = const Value.absent(),
                Value<String> detectionData = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
              }) => InventoryItemsCompanion(
                id: id,
                photoPath: photoPath,
                thumbnailPath: thumbnailPath,
                detectionData: detectionData,
                createdAt: createdAt,
                updatedAt: updatedAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String photoPath,
                required String thumbnailPath,
                required String detectionData,
                required DateTime createdAt,
                required DateTime updatedAt,
              }) => InventoryItemsCompanion.insert(
                id: id,
                photoPath: photoPath,
                thumbnailPath: thumbnailPath,
                detectionData: detectionData,
                createdAt: createdAt,
                updatedAt: updatedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$InventoryItemsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({
                labelsRefs = false,
                itemCategoriesRefs = false,
                syncQueueRefs = false,
              }) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (labelsRefs) db.labels,
                    if (itemCategoriesRefs) db.itemCategories,
                    if (syncQueueRefs) db.syncQueue,
                  ],
                  addJoins: null,
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (labelsRefs)
                        await $_getPrefetchedData<
                          InventoryItem,
                          $InventoryItemsTable,
                          Label
                        >(
                          currentTable: table,
                          referencedTable: $$InventoryItemsTableReferences
                              ._labelsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$InventoryItemsTableReferences(
                                db,
                                table,
                                p0,
                              ).labelsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.itemId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (itemCategoriesRefs)
                        await $_getPrefetchedData<
                          InventoryItem,
                          $InventoryItemsTable,
                          ItemCategory
                        >(
                          currentTable: table,
                          referencedTable: $$InventoryItemsTableReferences
                              ._itemCategoriesRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$InventoryItemsTableReferences(
                                db,
                                table,
                                p0,
                              ).itemCategoriesRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.itemId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (syncQueueRefs)
                        await $_getPrefetchedData<
                          InventoryItem,
                          $InventoryItemsTable,
                          SyncQueueItem
                        >(
                          currentTable: table,
                          referencedTable: $$InventoryItemsTableReferences
                              ._syncQueueRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$InventoryItemsTableReferences(
                                db,
                                table,
                                p0,
                              ).syncQueueRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.itemId == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$InventoryItemsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $InventoryItemsTable,
      InventoryItem,
      $$InventoryItemsTableFilterComposer,
      $$InventoryItemsTableOrderingComposer,
      $$InventoryItemsTableAnnotationComposer,
      $$InventoryItemsTableCreateCompanionBuilder,
      $$InventoryItemsTableUpdateCompanionBuilder,
      (InventoryItem, $$InventoryItemsTableReferences),
      InventoryItem,
      PrefetchHooks Function({
        bool labelsRefs,
        bool itemCategoriesRefs,
        bool syncQueueRefs,
      })
    >;
typedef $$LabelsTableCreateCompanionBuilder =
    LabelsCompanion Function({
      Value<int> id,
      required int itemId,
      Value<String?> key,
      required String value,
      required DateTime createdAt,
    });
typedef $$LabelsTableUpdateCompanionBuilder =
    LabelsCompanion Function({
      Value<int> id,
      Value<int> itemId,
      Value<String?> key,
      Value<String> value,
      Value<DateTime> createdAt,
    });

final class $$LabelsTableReferences
    extends BaseReferences<_$AppDatabase, $LabelsTable, Label> {
  $$LabelsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $InventoryItemsTable _itemIdTable(_$AppDatabase db) =>
      db.inventoryItems.createAlias(
        $_aliasNameGenerator(db.labels.itemId, db.inventoryItems.id),
      );

  $$InventoryItemsTableProcessedTableManager get itemId {
    final $_column = $_itemColumn<int>('item_id')!;

    final manager = $$InventoryItemsTableTableManager(
      $_db,
      $_db.inventoryItems,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_itemIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$LabelsTableFilterComposer
    extends Composer<_$AppDatabase, $LabelsTable> {
  $$LabelsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  $$InventoryItemsTableFilterComposer get itemId {
    final $$InventoryItemsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.itemId,
      referencedTable: $db.inventoryItems,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$InventoryItemsTableFilterComposer(
            $db: $db,
            $table: $db.inventoryItems,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$LabelsTableOrderingComposer
    extends Composer<_$AppDatabase, $LabelsTable> {
  $$LabelsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$InventoryItemsTableOrderingComposer get itemId {
    final $$InventoryItemsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.itemId,
      referencedTable: $db.inventoryItems,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$InventoryItemsTableOrderingComposer(
            $db: $db,
            $table: $db.inventoryItems,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$LabelsTableAnnotationComposer
    extends Composer<_$AppDatabase, $LabelsTable> {
  $$LabelsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  $$InventoryItemsTableAnnotationComposer get itemId {
    final $$InventoryItemsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.itemId,
      referencedTable: $db.inventoryItems,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$InventoryItemsTableAnnotationComposer(
            $db: $db,
            $table: $db.inventoryItems,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$LabelsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $LabelsTable,
          Label,
          $$LabelsTableFilterComposer,
          $$LabelsTableOrderingComposer,
          $$LabelsTableAnnotationComposer,
          $$LabelsTableCreateCompanionBuilder,
          $$LabelsTableUpdateCompanionBuilder,
          (Label, $$LabelsTableReferences),
          Label,
          PrefetchHooks Function({bool itemId})
        > {
  $$LabelsTableTableManager(_$AppDatabase db, $LabelsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LabelsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LabelsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LabelsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> itemId = const Value.absent(),
                Value<String?> key = const Value.absent(),
                Value<String> value = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => LabelsCompanion(
                id: id,
                itemId: itemId,
                key: key,
                value: value,
                createdAt: createdAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int itemId,
                Value<String?> key = const Value.absent(),
                required String value,
                required DateTime createdAt,
              }) => LabelsCompanion.insert(
                id: id,
                itemId: itemId,
                key: key,
                value: value,
                createdAt: createdAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) =>
                    (e.readTable(table), $$LabelsTableReferences(db, table, e)),
              )
              .toList(),
          prefetchHooksCallback: ({itemId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (itemId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.itemId,
                                referencedTable: $$LabelsTableReferences
                                    ._itemIdTable(db),
                                referencedColumn: $$LabelsTableReferences
                                    ._itemIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$LabelsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $LabelsTable,
      Label,
      $$LabelsTableFilterComposer,
      $$LabelsTableOrderingComposer,
      $$LabelsTableAnnotationComposer,
      $$LabelsTableCreateCompanionBuilder,
      $$LabelsTableUpdateCompanionBuilder,
      (Label, $$LabelsTableReferences),
      Label,
      PrefetchHooks Function({bool itemId})
    >;
typedef $$LabelSearchFtsTableCreateCompanionBuilder =
    LabelSearchFtsCompanion Function({
      required int labelId,
      required String value,
    });
typedef $$LabelSearchFtsTableUpdateCompanionBuilder =
    LabelSearchFtsCompanion Function({Value<int> labelId, Value<String> value});

class $$LabelSearchFtsTableFilterComposer
    extends Composer<_$AppDatabase, $LabelSearchFtsTable> {
  $$LabelSearchFtsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get labelId => $composableBuilder(
    column: $table.labelId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );
}

class $$LabelSearchFtsTableOrderingComposer
    extends Composer<_$AppDatabase, $LabelSearchFtsTable> {
  $$LabelSearchFtsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get labelId => $composableBuilder(
    column: $table.labelId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$LabelSearchFtsTableAnnotationComposer
    extends Composer<_$AppDatabase, $LabelSearchFtsTable> {
  $$LabelSearchFtsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get labelId =>
      $composableBuilder(column: $table.labelId, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$LabelSearchFtsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $LabelSearchFtsTable,
          LabelSearchEntry,
          $$LabelSearchFtsTableFilterComposer,
          $$LabelSearchFtsTableOrderingComposer,
          $$LabelSearchFtsTableAnnotationComposer,
          $$LabelSearchFtsTableCreateCompanionBuilder,
          $$LabelSearchFtsTableUpdateCompanionBuilder,
          (
            LabelSearchEntry,
            BaseReferences<
              _$AppDatabase,
              $LabelSearchFtsTable,
              LabelSearchEntry
            >,
          ),
          LabelSearchEntry,
          PrefetchHooks Function()
        > {
  $$LabelSearchFtsTableTableManager(
    _$AppDatabase db,
    $LabelSearchFtsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LabelSearchFtsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LabelSearchFtsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LabelSearchFtsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> labelId = const Value.absent(),
                Value<String> value = const Value.absent(),
              }) => LabelSearchFtsCompanion(labelId: labelId, value: value),
          createCompanionCallback:
              ({required int labelId, required String value}) =>
                  LabelSearchFtsCompanion.insert(
                    labelId: labelId,
                    value: value,
                  ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$LabelSearchFtsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $LabelSearchFtsTable,
      LabelSearchEntry,
      $$LabelSearchFtsTableFilterComposer,
      $$LabelSearchFtsTableOrderingComposer,
      $$LabelSearchFtsTableAnnotationComposer,
      $$LabelSearchFtsTableCreateCompanionBuilder,
      $$LabelSearchFtsTableUpdateCompanionBuilder,
      (
        LabelSearchEntry,
        BaseReferences<_$AppDatabase, $LabelSearchFtsTable, LabelSearchEntry>,
      ),
      LabelSearchEntry,
      PrefetchHooks Function()
    >;
typedef $$CategoriesTableCreateCompanionBuilder =
    CategoriesCompanion Function({
      Value<int> id,
      required String name,
      Value<String?> iconName,
      Value<String?> colorHex,
      Value<bool> isSystem,
      required DateTime createdAt,
    });
typedef $$CategoriesTableUpdateCompanionBuilder =
    CategoriesCompanion Function({
      Value<int> id,
      Value<String> name,
      Value<String?> iconName,
      Value<String?> colorHex,
      Value<bool> isSystem,
      Value<DateTime> createdAt,
    });

final class $$CategoriesTableReferences
    extends BaseReferences<_$AppDatabase, $CategoriesTable, Category> {
  $$CategoriesTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$ItemCategoriesTable, List<ItemCategory>>
  _itemCategoriesRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.itemCategories,
    aliasName: $_aliasNameGenerator(
      db.categories.id,
      db.itemCategories.categoryId,
    ),
  );

  $$ItemCategoriesTableProcessedTableManager get itemCategoriesRefs {
    final manager = $$ItemCategoriesTableTableManager(
      $_db,
      $_db.itemCategories,
    ).filter((f) => f.categoryId.id.sqlEquals($_itemColumn<int>('id')!));

    final cache = $_typedResult.readTableOrNull(_itemCategoriesRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$CategoriesTableFilterComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get iconName => $composableBuilder(
    column: $table.iconName,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get colorHex => $composableBuilder(
    column: $table.colorHex,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isSystem => $composableBuilder(
    column: $table.isSystem,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> itemCategoriesRefs(
    Expression<bool> Function($$ItemCategoriesTableFilterComposer f) f,
  ) {
    final $$ItemCategoriesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.itemCategories,
      getReferencedColumn: (t) => t.categoryId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ItemCategoriesTableFilterComposer(
            $db: $db,
            $table: $db.itemCategories,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$CategoriesTableOrderingComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get iconName => $composableBuilder(
    column: $table.iconName,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get colorHex => $composableBuilder(
    column: $table.colorHex,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isSystem => $composableBuilder(
    column: $table.isSystem,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CategoriesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get iconName =>
      $composableBuilder(column: $table.iconName, builder: (column) => column);

  GeneratedColumn<String> get colorHex =>
      $composableBuilder(column: $table.colorHex, builder: (column) => column);

  GeneratedColumn<bool> get isSystem =>
      $composableBuilder(column: $table.isSystem, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  Expression<T> itemCategoriesRefs<T extends Object>(
    Expression<T> Function($$ItemCategoriesTableAnnotationComposer a) f,
  ) {
    final $$ItemCategoriesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.itemCategories,
      getReferencedColumn: (t) => t.categoryId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ItemCategoriesTableAnnotationComposer(
            $db: $db,
            $table: $db.itemCategories,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$CategoriesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CategoriesTable,
          Category,
          $$CategoriesTableFilterComposer,
          $$CategoriesTableOrderingComposer,
          $$CategoriesTableAnnotationComposer,
          $$CategoriesTableCreateCompanionBuilder,
          $$CategoriesTableUpdateCompanionBuilder,
          (Category, $$CategoriesTableReferences),
          Category,
          PrefetchHooks Function({bool itemCategoriesRefs})
        > {
  $$CategoriesTableTableManager(_$AppDatabase db, $CategoriesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CategoriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CategoriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CategoriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String?> iconName = const Value.absent(),
                Value<String?> colorHex = const Value.absent(),
                Value<bool> isSystem = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => CategoriesCompanion(
                id: id,
                name: name,
                iconName: iconName,
                colorHex: colorHex,
                isSystem: isSystem,
                createdAt: createdAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String name,
                Value<String?> iconName = const Value.absent(),
                Value<String?> colorHex = const Value.absent(),
                Value<bool> isSystem = const Value.absent(),
                required DateTime createdAt,
              }) => CategoriesCompanion.insert(
                id: id,
                name: name,
                iconName: iconName,
                colorHex: colorHex,
                isSystem: isSystem,
                createdAt: createdAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$CategoriesTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({itemCategoriesRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (itemCategoriesRefs) db.itemCategories,
              ],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (itemCategoriesRefs)
                    await $_getPrefetchedData<
                      Category,
                      $CategoriesTable,
                      ItemCategory
                    >(
                      currentTable: table,
                      referencedTable: $$CategoriesTableReferences
                          ._itemCategoriesRefsTable(db),
                      managerFromTypedResult: (p0) =>
                          $$CategoriesTableReferences(
                            db,
                            table,
                            p0,
                          ).itemCategoriesRefs,
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where((e) => e.categoryId == item.id),
                      typedResults: items,
                    ),
                ];
              },
            );
          },
        ),
      );
}

typedef $$CategoriesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CategoriesTable,
      Category,
      $$CategoriesTableFilterComposer,
      $$CategoriesTableOrderingComposer,
      $$CategoriesTableAnnotationComposer,
      $$CategoriesTableCreateCompanionBuilder,
      $$CategoriesTableUpdateCompanionBuilder,
      (Category, $$CategoriesTableReferences),
      Category,
      PrefetchHooks Function({bool itemCategoriesRefs})
    >;
typedef $$ItemCategoriesTableCreateCompanionBuilder =
    ItemCategoriesCompanion Function({
      required int itemId,
      required int categoryId,
      required DateTime createdAt,
      Value<int> rowid,
    });
typedef $$ItemCategoriesTableUpdateCompanionBuilder =
    ItemCategoriesCompanion Function({
      Value<int> itemId,
      Value<int> categoryId,
      Value<DateTime> createdAt,
      Value<int> rowid,
    });

final class $$ItemCategoriesTableReferences
    extends BaseReferences<_$AppDatabase, $ItemCategoriesTable, ItemCategory> {
  $$ItemCategoriesTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $InventoryItemsTable _itemIdTable(_$AppDatabase db) =>
      db.inventoryItems.createAlias(
        $_aliasNameGenerator(db.itemCategories.itemId, db.inventoryItems.id),
      );

  $$InventoryItemsTableProcessedTableManager get itemId {
    final $_column = $_itemColumn<int>('item_id')!;

    final manager = $$InventoryItemsTableTableManager(
      $_db,
      $_db.inventoryItems,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_itemIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static $CategoriesTable _categoryIdTable(_$AppDatabase db) =>
      db.categories.createAlias(
        $_aliasNameGenerator(db.itemCategories.categoryId, db.categories.id),
      );

  $$CategoriesTableProcessedTableManager get categoryId {
    final $_column = $_itemColumn<int>('category_id')!;

    final manager = $$CategoriesTableTableManager(
      $_db,
      $_db.categories,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_categoryIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$ItemCategoriesTableFilterComposer
    extends Composer<_$AppDatabase, $ItemCategoriesTable> {
  $$ItemCategoriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  $$InventoryItemsTableFilterComposer get itemId {
    final $$InventoryItemsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.itemId,
      referencedTable: $db.inventoryItems,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$InventoryItemsTableFilterComposer(
            $db: $db,
            $table: $db.inventoryItems,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$CategoriesTableFilterComposer get categoryId {
    final $$CategoriesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.categoryId,
      referencedTable: $db.categories,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$CategoriesTableFilterComposer(
            $db: $db,
            $table: $db.categories,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ItemCategoriesTableOrderingComposer
    extends Composer<_$AppDatabase, $ItemCategoriesTable> {
  $$ItemCategoriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$InventoryItemsTableOrderingComposer get itemId {
    final $$InventoryItemsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.itemId,
      referencedTable: $db.inventoryItems,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$InventoryItemsTableOrderingComposer(
            $db: $db,
            $table: $db.inventoryItems,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$CategoriesTableOrderingComposer get categoryId {
    final $$CategoriesTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.categoryId,
      referencedTable: $db.categories,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$CategoriesTableOrderingComposer(
            $db: $db,
            $table: $db.categories,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ItemCategoriesTableAnnotationComposer
    extends Composer<_$AppDatabase, $ItemCategoriesTable> {
  $$ItemCategoriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  $$InventoryItemsTableAnnotationComposer get itemId {
    final $$InventoryItemsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.itemId,
      referencedTable: $db.inventoryItems,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$InventoryItemsTableAnnotationComposer(
            $db: $db,
            $table: $db.inventoryItems,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  $$CategoriesTableAnnotationComposer get categoryId {
    final $$CategoriesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.categoryId,
      referencedTable: $db.categories,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$CategoriesTableAnnotationComposer(
            $db: $db,
            $table: $db.categories,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ItemCategoriesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ItemCategoriesTable,
          ItemCategory,
          $$ItemCategoriesTableFilterComposer,
          $$ItemCategoriesTableOrderingComposer,
          $$ItemCategoriesTableAnnotationComposer,
          $$ItemCategoriesTableCreateCompanionBuilder,
          $$ItemCategoriesTableUpdateCompanionBuilder,
          (ItemCategory, $$ItemCategoriesTableReferences),
          ItemCategory,
          PrefetchHooks Function({bool itemId, bool categoryId})
        > {
  $$ItemCategoriesTableTableManager(
    _$AppDatabase db,
    $ItemCategoriesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ItemCategoriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ItemCategoriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ItemCategoriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> itemId = const Value.absent(),
                Value<int> categoryId = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ItemCategoriesCompanion(
                itemId: itemId,
                categoryId: categoryId,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required int itemId,
                required int categoryId,
                required DateTime createdAt,
                Value<int> rowid = const Value.absent(),
              }) => ItemCategoriesCompanion.insert(
                itemId: itemId,
                categoryId: categoryId,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$ItemCategoriesTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({itemId = false, categoryId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (itemId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.itemId,
                                referencedTable: $$ItemCategoriesTableReferences
                                    ._itemIdTable(db),
                                referencedColumn:
                                    $$ItemCategoriesTableReferences
                                        ._itemIdTable(db)
                                        .id,
                              )
                              as T;
                    }
                    if (categoryId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.categoryId,
                                referencedTable: $$ItemCategoriesTableReferences
                                    ._categoryIdTable(db),
                                referencedColumn:
                                    $$ItemCategoriesTableReferences
                                        ._categoryIdTable(db)
                                        .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$ItemCategoriesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ItemCategoriesTable,
      ItemCategory,
      $$ItemCategoriesTableFilterComposer,
      $$ItemCategoriesTableOrderingComposer,
      $$ItemCategoriesTableAnnotationComposer,
      $$ItemCategoriesTableCreateCompanionBuilder,
      $$ItemCategoriesTableUpdateCompanionBuilder,
      (ItemCategory, $$ItemCategoriesTableReferences),
      ItemCategory,
      PrefetchHooks Function({bool itemId, bool categoryId})
    >;
typedef $$SyncQueueTableCreateCompanionBuilder =
    SyncQueueCompanion Function({
      Value<int> id,
      required int itemId,
      required String operation,
      Value<int> retryCount,
      Value<String?> lastError,
      required DateTime queuedAt,
      Value<DateTime?> lastAttemptAt,
    });
typedef $$SyncQueueTableUpdateCompanionBuilder =
    SyncQueueCompanion Function({
      Value<int> id,
      Value<int> itemId,
      Value<String> operation,
      Value<int> retryCount,
      Value<String?> lastError,
      Value<DateTime> queuedAt,
      Value<DateTime?> lastAttemptAt,
    });

final class $$SyncQueueTableReferences
    extends BaseReferences<_$AppDatabase, $SyncQueueTable, SyncQueueItem> {
  $$SyncQueueTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $InventoryItemsTable _itemIdTable(_$AppDatabase db) =>
      db.inventoryItems.createAlias(
        $_aliasNameGenerator(db.syncQueue.itemId, db.inventoryItems.id),
      );

  $$InventoryItemsTableProcessedTableManager get itemId {
    final $_column = $_itemColumn<int>('item_id')!;

    final manager = $$InventoryItemsTableTableManager(
      $_db,
      $_db.inventoryItems,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_itemIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$SyncQueueTableFilterComposer
    extends Composer<_$AppDatabase, $SyncQueueTable> {
  $$SyncQueueTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get operation => $composableBuilder(
    column: $table.operation,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get retryCount => $composableBuilder(
    column: $table.retryCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get queuedAt => $composableBuilder(
    column: $table.queuedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => ColumnFilters(column),
  );

  $$InventoryItemsTableFilterComposer get itemId {
    final $$InventoryItemsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.itemId,
      referencedTable: $db.inventoryItems,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$InventoryItemsTableFilterComposer(
            $db: $db,
            $table: $db.inventoryItems,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$SyncQueueTableOrderingComposer
    extends Composer<_$AppDatabase, $SyncQueueTable> {
  $$SyncQueueTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get operation => $composableBuilder(
    column: $table.operation,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get retryCount => $composableBuilder(
    column: $table.retryCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get lastError => $composableBuilder(
    column: $table.lastError,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get queuedAt => $composableBuilder(
    column: $table.queuedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$InventoryItemsTableOrderingComposer get itemId {
    final $$InventoryItemsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.itemId,
      referencedTable: $db.inventoryItems,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$InventoryItemsTableOrderingComposer(
            $db: $db,
            $table: $db.inventoryItems,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$SyncQueueTableAnnotationComposer
    extends Composer<_$AppDatabase, $SyncQueueTable> {
  $$SyncQueueTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get operation =>
      $composableBuilder(column: $table.operation, builder: (column) => column);

  GeneratedColumn<int> get retryCount => $composableBuilder(
    column: $table.retryCount,
    builder: (column) => column,
  );

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<DateTime> get queuedAt =>
      $composableBuilder(column: $table.queuedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get lastAttemptAt => $composableBuilder(
    column: $table.lastAttemptAt,
    builder: (column) => column,
  );

  $$InventoryItemsTableAnnotationComposer get itemId {
    final $$InventoryItemsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.itemId,
      referencedTable: $db.inventoryItems,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$InventoryItemsTableAnnotationComposer(
            $db: $db,
            $table: $db.inventoryItems,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$SyncQueueTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $SyncQueueTable,
          SyncQueueItem,
          $$SyncQueueTableFilterComposer,
          $$SyncQueueTableOrderingComposer,
          $$SyncQueueTableAnnotationComposer,
          $$SyncQueueTableCreateCompanionBuilder,
          $$SyncQueueTableUpdateCompanionBuilder,
          (SyncQueueItem, $$SyncQueueTableReferences),
          SyncQueueItem,
          PrefetchHooks Function({bool itemId})
        > {
  $$SyncQueueTableTableManager(_$AppDatabase db, $SyncQueueTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncQueueTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncQueueTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncQueueTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<int> itemId = const Value.absent(),
                Value<String> operation = const Value.absent(),
                Value<int> retryCount = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<DateTime> queuedAt = const Value.absent(),
                Value<DateTime?> lastAttemptAt = const Value.absent(),
              }) => SyncQueueCompanion(
                id: id,
                itemId: itemId,
                operation: operation,
                retryCount: retryCount,
                lastError: lastError,
                queuedAt: queuedAt,
                lastAttemptAt: lastAttemptAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required int itemId,
                required String operation,
                Value<int> retryCount = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                required DateTime queuedAt,
                Value<DateTime?> lastAttemptAt = const Value.absent(),
              }) => SyncQueueCompanion.insert(
                id: id,
                itemId: itemId,
                operation: operation,
                retryCount: retryCount,
                lastError: lastError,
                queuedAt: queuedAt,
                lastAttemptAt: lastAttemptAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$SyncQueueTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({itemId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (itemId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.itemId,
                                referencedTable: $$SyncQueueTableReferences
                                    ._itemIdTable(db),
                                referencedColumn: $$SyncQueueTableReferences
                                    ._itemIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$SyncQueueTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $SyncQueueTable,
      SyncQueueItem,
      $$SyncQueueTableFilterComposer,
      $$SyncQueueTableOrderingComposer,
      $$SyncQueueTableAnnotationComposer,
      $$SyncQueueTableCreateCompanionBuilder,
      $$SyncQueueTableUpdateCompanionBuilder,
      (SyncQueueItem, $$SyncQueueTableReferences),
      SyncQueueItem,
      PrefetchHooks Function({bool itemId})
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$InventoryItemsTableTableManager get inventoryItems =>
      $$InventoryItemsTableTableManager(_db, _db.inventoryItems);
  $$LabelsTableTableManager get labels =>
      $$LabelsTableTableManager(_db, _db.labels);
  $$LabelSearchFtsTableTableManager get labelSearchFts =>
      $$LabelSearchFtsTableTableManager(_db, _db.labelSearchFts);
  $$CategoriesTableTableManager get categories =>
      $$CategoriesTableTableManager(_db, _db.categories);
  $$ItemCategoriesTableTableManager get itemCategories =>
      $$ItemCategoriesTableTableManager(_db, _db.itemCategories);
  $$SyncQueueTableTableManager get syncQueue =>
      $$SyncQueueTableTableManager(_db, _db.syncQueue);
}
