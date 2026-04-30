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
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
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
  static const VerificationMeta _serverPhotoUrlMeta = const VerificationMeta(
    'serverPhotoUrl',
  );
  @override
  late final GeneratedColumn<String> serverPhotoUrl = GeneratedColumn<String>(
    'server_photo_url',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
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
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('completed'),
  );
  static const VerificationMeta _isFlaggedMeta = const VerificationMeta(
    'isFlagged',
  );
  @override
  late final GeneratedColumn<bool> isFlagged = GeneratedColumn<bool>(
    'is_flagged',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_flagged" IN (0, 1))',
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
    serverPhotoUrl,
    detectionData,
    status,
    isFlagged,
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
    } else if (isInserting) {
      context.missing(_idMeta);
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
    if (data.containsKey('server_photo_url')) {
      context.handle(
        _serverPhotoUrlMeta,
        serverPhotoUrl.isAcceptableOrUnknown(
          data['server_photo_url']!,
          _serverPhotoUrlMeta,
        ),
      );
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
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    }
    if (data.containsKey('is_flagged')) {
      context.handle(
        _isFlaggedMeta,
        isFlagged.isAcceptableOrUnknown(data['is_flagged']!, _isFlaggedMeta),
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
        DriftSqlType.string,
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
      serverPhotoUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}server_photo_url'],
      ),
      detectionData: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}detection_data'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      isFlagged: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_flagged'],
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
  /// Primary key — IS the sceneId from cross_frame_dedup. One row per scene.
  final String id;

  /// Absolute path to full-resolution photo
  final String photoPath;

  /// Absolute path to thumbnail (256x256)
  final String thumbnailPath;

  /// URL to the photo on the Mac server (e.g., /photos/uuid.jpg)
  final String? serverPhotoUrl;

  /// JSON: detection metadata (bounding boxes, confidence, etc.)
  final String detectionData;

  /// Processing status (pending, completed, failed, flagged).
  final String status;

  /// True when self_diagnosis flagged the run (empty_detection_set,
  /// single_source_run, or diagnosis_budget_exhausted).
  final bool isFlagged;

  /// Timestamp when item was created
  final DateTime createdAt;

  /// Timestamp when item was last modified
  final DateTime updatedAt;
  const InventoryItem({
    required this.id,
    required this.photoPath,
    required this.thumbnailPath,
    this.serverPhotoUrl,
    required this.detectionData,
    required this.status,
    required this.isFlagged,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['photo_path'] = Variable<String>(photoPath);
    map['thumbnail_path'] = Variable<String>(thumbnailPath);
    if (!nullToAbsent || serverPhotoUrl != null) {
      map['server_photo_url'] = Variable<String>(serverPhotoUrl);
    }
    map['detection_data'] = Variable<String>(detectionData);
    map['status'] = Variable<String>(status);
    map['is_flagged'] = Variable<bool>(isFlagged);
    map['created_at'] = Variable<DateTime>(createdAt);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  InventoryItemsCompanion toCompanion(bool nullToAbsent) {
    return InventoryItemsCompanion(
      id: Value(id),
      photoPath: Value(photoPath),
      thumbnailPath: Value(thumbnailPath),
      serverPhotoUrl: serverPhotoUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(serverPhotoUrl),
      detectionData: Value(detectionData),
      status: Value(status),
      isFlagged: Value(isFlagged),
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
      id: serializer.fromJson<String>(json['id']),
      photoPath: serializer.fromJson<String>(json['photoPath']),
      thumbnailPath: serializer.fromJson<String>(json['thumbnailPath']),
      serverPhotoUrl: serializer.fromJson<String?>(json['serverPhotoUrl']),
      detectionData: serializer.fromJson<String>(json['detectionData']),
      status: serializer.fromJson<String>(json['status']),
      isFlagged: serializer.fromJson<bool>(json['isFlagged']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'photoPath': serializer.toJson<String>(photoPath),
      'thumbnailPath': serializer.toJson<String>(thumbnailPath),
      'serverPhotoUrl': serializer.toJson<String?>(serverPhotoUrl),
      'detectionData': serializer.toJson<String>(detectionData),
      'status': serializer.toJson<String>(status),
      'isFlagged': serializer.toJson<bool>(isFlagged),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  InventoryItem copyWith({
    String? id,
    String? photoPath,
    String? thumbnailPath,
    Value<String?> serverPhotoUrl = const Value.absent(),
    String? detectionData,
    String? status,
    bool? isFlagged,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) => InventoryItem(
    id: id ?? this.id,
    photoPath: photoPath ?? this.photoPath,
    thumbnailPath: thumbnailPath ?? this.thumbnailPath,
    serverPhotoUrl: serverPhotoUrl.present
        ? serverPhotoUrl.value
        : this.serverPhotoUrl,
    detectionData: detectionData ?? this.detectionData,
    status: status ?? this.status,
    isFlagged: isFlagged ?? this.isFlagged,
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
      serverPhotoUrl: data.serverPhotoUrl.present
          ? data.serverPhotoUrl.value
          : this.serverPhotoUrl,
      detectionData: data.detectionData.present
          ? data.detectionData.value
          : this.detectionData,
      status: data.status.present ? data.status.value : this.status,
      isFlagged: data.isFlagged.present ? data.isFlagged.value : this.isFlagged,
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
          ..write('serverPhotoUrl: $serverPhotoUrl, ')
          ..write('detectionData: $detectionData, ')
          ..write('status: $status, ')
          ..write('isFlagged: $isFlagged, ')
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
    serverPhotoUrl,
    detectionData,
    status,
    isFlagged,
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
          other.serverPhotoUrl == this.serverPhotoUrl &&
          other.detectionData == this.detectionData &&
          other.status == this.status &&
          other.isFlagged == this.isFlagged &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class InventoryItemsCompanion extends UpdateCompanion<InventoryItem> {
  final Value<String> id;
  final Value<String> photoPath;
  final Value<String> thumbnailPath;
  final Value<String?> serverPhotoUrl;
  final Value<String> detectionData;
  final Value<String> status;
  final Value<bool> isFlagged;
  final Value<DateTime> createdAt;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const InventoryItemsCompanion({
    this.id = const Value.absent(),
    this.photoPath = const Value.absent(),
    this.thumbnailPath = const Value.absent(),
    this.serverPhotoUrl = const Value.absent(),
    this.detectionData = const Value.absent(),
    this.status = const Value.absent(),
    this.isFlagged = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  InventoryItemsCompanion.insert({
    required String id,
    required String photoPath,
    required String thumbnailPath,
    this.serverPhotoUrl = const Value.absent(),
    required String detectionData,
    this.status = const Value.absent(),
    this.isFlagged = const Value.absent(),
    required DateTime createdAt,
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       photoPath = Value(photoPath),
       thumbnailPath = Value(thumbnailPath),
       detectionData = Value(detectionData),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<InventoryItem> custom({
    Expression<String>? id,
    Expression<String>? photoPath,
    Expression<String>? thumbnailPath,
    Expression<String>? serverPhotoUrl,
    Expression<String>? detectionData,
    Expression<String>? status,
    Expression<bool>? isFlagged,
    Expression<DateTime>? createdAt,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (photoPath != null) 'photo_path': photoPath,
      if (thumbnailPath != null) 'thumbnail_path': thumbnailPath,
      if (serverPhotoUrl != null) 'server_photo_url': serverPhotoUrl,
      if (detectionData != null) 'detection_data': detectionData,
      if (status != null) 'status': status,
      if (isFlagged != null) 'is_flagged': isFlagged,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  InventoryItemsCompanion copyWith({
    Value<String>? id,
    Value<String>? photoPath,
    Value<String>? thumbnailPath,
    Value<String?>? serverPhotoUrl,
    Value<String>? detectionData,
    Value<String>? status,
    Value<bool>? isFlagged,
    Value<DateTime>? createdAt,
    Value<DateTime>? updatedAt,
    Value<int>? rowid,
  }) {
    return InventoryItemsCompanion(
      id: id ?? this.id,
      photoPath: photoPath ?? this.photoPath,
      thumbnailPath: thumbnailPath ?? this.thumbnailPath,
      serverPhotoUrl: serverPhotoUrl ?? this.serverPhotoUrl,
      detectionData: detectionData ?? this.detectionData,
      status: status ?? this.status,
      isFlagged: isFlagged ?? this.isFlagged,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (photoPath.present) {
      map['photo_path'] = Variable<String>(photoPath.value);
    }
    if (thumbnailPath.present) {
      map['thumbnail_path'] = Variable<String>(thumbnailPath.value);
    }
    if (serverPhotoUrl.present) {
      map['server_photo_url'] = Variable<String>(serverPhotoUrl.value);
    }
    if (detectionData.present) {
      map['detection_data'] = Variable<String>(detectionData.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (isFlagged.present) {
      map['is_flagged'] = Variable<bool>(isFlagged.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('InventoryItemsCompanion(')
          ..write('id: $id, ')
          ..write('photoPath: $photoPath, ')
          ..write('thumbnailPath: $thumbnailPath, ')
          ..write('serverPhotoUrl: $serverPhotoUrl, ')
          ..write('detectionData: $detectionData, ')
          ..write('status: $status, ')
          ..write('isFlagged: $isFlagged, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
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
  late final GeneratedColumn<String> itemId = GeneratedColumn<String>(
    'item_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
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
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
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
  static const VerificationMeta _confidenceMeta = const VerificationMeta(
    'confidence',
  );
  @override
  late final GeneratedColumn<double> confidence = GeneratedColumn<double>(
    'confidence',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(1),
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
    itemId,
    key,
    value,
    confidence,
    createdAt,
  ];
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
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    if (data.containsKey('confidence')) {
      context.handle(
        _confidenceMeta,
        confidence.isAcceptableOrUnknown(data['confidence']!, _confidenceMeta),
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
        DriftSqlType.string,
        data['${effectivePrefix}item_id'],
      )!,
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      value: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}value'],
      )!,
      confidence: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}confidence'],
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

  /// Foreign key to inventory_items.id (now a TEXT sceneId since v6).
  final String itemId;

  /// Category key (type, color, brand, material, etc.)
  final String key;

  /// Label value (laptop, black, Apple, bedroom)
  final String value;

  /// Confidence score from AI detection (0.0–1.0)
  final double confidence;

  /// Timestamp when label was added
  final DateTime createdAt;
  const Label({
    required this.id,
    required this.itemId,
    required this.key,
    required this.value,
    required this.confidence,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['item_id'] = Variable<String>(itemId);
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    map['confidence'] = Variable<double>(confidence);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  LabelsCompanion toCompanion(bool nullToAbsent) {
    return LabelsCompanion(
      id: Value(id),
      itemId: Value(itemId),
      key: Value(key),
      value: Value(value),
      confidence: Value(confidence),
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
      itemId: serializer.fromJson<String>(json['itemId']),
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
      confidence: serializer.fromJson<double>(json['confidence']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'itemId': serializer.toJson<String>(itemId),
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
      'confidence': serializer.toJson<double>(confidence),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  Label copyWith({
    int? id,
    String? itemId,
    String? key,
    String? value,
    double? confidence,
    DateTime? createdAt,
  }) => Label(
    id: id ?? this.id,
    itemId: itemId ?? this.itemId,
    key: key ?? this.key,
    value: value ?? this.value,
    confidence: confidence ?? this.confidence,
    createdAt: createdAt ?? this.createdAt,
  );
  Label copyWithCompanion(LabelsCompanion data) {
    return Label(
      id: data.id.present ? data.id.value : this.id,
      itemId: data.itemId.present ? data.itemId.value : this.itemId,
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
      confidence: data.confidence.present
          ? data.confidence.value
          : this.confidence,
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
          ..write('confidence: $confidence, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, itemId, key, value, confidence, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Label &&
          other.id == this.id &&
          other.itemId == this.itemId &&
          other.key == this.key &&
          other.value == this.value &&
          other.confidence == this.confidence &&
          other.createdAt == this.createdAt);
}

class LabelsCompanion extends UpdateCompanion<Label> {
  final Value<int> id;
  final Value<String> itemId;
  final Value<String> key;
  final Value<String> value;
  final Value<double> confidence;
  final Value<DateTime> createdAt;
  const LabelsCompanion({
    this.id = const Value.absent(),
    this.itemId = const Value.absent(),
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.confidence = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  LabelsCompanion.insert({
    this.id = const Value.absent(),
    required String itemId,
    required String key,
    required String value,
    this.confidence = const Value.absent(),
    required DateTime createdAt,
  }) : itemId = Value(itemId),
       key = Value(key),
       value = Value(value),
       createdAt = Value(createdAt);
  static Insertable<Label> custom({
    Expression<int>? id,
    Expression<String>? itemId,
    Expression<String>? key,
    Expression<String>? value,
    Expression<double>? confidence,
    Expression<DateTime>? createdAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (itemId != null) 'item_id': itemId,
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (confidence != null) 'confidence': confidence,
      if (createdAt != null) 'created_at': createdAt,
    });
  }

  LabelsCompanion copyWith({
    Value<int>? id,
    Value<String>? itemId,
    Value<String>? key,
    Value<String>? value,
    Value<double>? confidence,
    Value<DateTime>? createdAt,
  }) {
    return LabelsCompanion(
      id: id ?? this.id,
      itemId: itemId ?? this.itemId,
      key: key ?? this.key,
      value: value ?? this.value,
      confidence: confidence ?? this.confidence,
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
      map['item_id'] = Variable<String>(itemId.value);
    }
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (confidence.present) {
      map['confidence'] = Variable<double>(confidence.value);
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
          ..write('confidence: $confidence, ')
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
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
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
  List<GeneratedColumn> get $columns => [labelId, key, value];
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
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
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
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
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

  /// Label key (e.g., 'type', 'color')
  final String key;

  /// Label value indexed for full-text search
  final String value;
  const LabelSearchEntry({
    required this.labelId,
    required this.key,
    required this.value,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['label_id'] = Variable<int>(labelId);
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  LabelSearchFtsCompanion toCompanion(bool nullToAbsent) {
    return LabelSearchFtsCompanion(
      labelId: Value(labelId),
      key: Value(key),
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
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'labelId': serializer.toJson<int>(labelId),
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  LabelSearchEntry copyWith({int? labelId, String? key, String? value}) =>
      LabelSearchEntry(
        labelId: labelId ?? this.labelId,
        key: key ?? this.key,
        value: value ?? this.value,
      );
  LabelSearchEntry copyWithCompanion(LabelSearchFtsCompanion data) {
    return LabelSearchEntry(
      labelId: data.labelId.present ? data.labelId.value : this.labelId,
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LabelSearchEntry(')
          ..write('labelId: $labelId, ')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(labelId, key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LabelSearchEntry &&
          other.labelId == this.labelId &&
          other.key == this.key &&
          other.value == this.value);
}

class LabelSearchFtsCompanion extends UpdateCompanion<LabelSearchEntry> {
  final Value<int> labelId;
  final Value<String> key;
  final Value<String> value;
  const LabelSearchFtsCompanion({
    this.labelId = const Value.absent(),
    this.key = const Value.absent(),
    this.value = const Value.absent(),
  });
  LabelSearchFtsCompanion.insert({
    required int labelId,
    required String key,
    required String value,
  }) : labelId = Value(labelId),
       key = Value(key),
       value = Value(value);
  static Insertable<LabelSearchEntry> custom({
    Expression<int>? labelId,
    Expression<String>? key,
    Expression<String>? value,
  }) {
    return RawValuesInsertable({
      if (labelId != null) 'label_id': labelId,
      if (key != null) 'key': key,
      if (value != null) 'value': value,
    });
  }

  LabelSearchFtsCompanion copyWith({
    Value<int>? labelId,
    Value<String>? key,
    Value<String>? value,
  }) {
    return LabelSearchFtsCompanion(
      labelId: labelId ?? this.labelId,
      key: key ?? this.key,
      value: value ?? this.value,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (labelId.present) {
      map['label_id'] = Variable<int>(labelId.value);
    }
    if (key.present) {
      map['key'] = Variable<String>(key.value);
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
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }
}

class $ScenesTable extends Scenes with TableInfo<$ScenesTable, Scene> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ScenesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _captureSessionIdMeta = const VerificationMeta(
    'captureSessionId',
  );
  @override
  late final GeneratedColumn<String> captureSessionId = GeneratedColumn<String>(
    'capture_session_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _agreementCoverageMeta = const VerificationMeta(
    'agreementCoverage',
  );
  @override
  late final GeneratedColumn<double> agreementCoverage =
      GeneratedColumn<double>(
        'agreement_coverage',
        aliasedName,
        false,
        type: DriftSqlType.double,
        requiredDuringInsert: false,
        defaultValue: const Constant(0.0),
      );
  static const VerificationMeta _agreementPrecisionMeta =
      const VerificationMeta('agreementPrecision');
  @override
  late final GeneratedColumn<double> agreementPrecision =
      GeneratedColumn<double>(
        'agreement_precision',
        aliasedName,
        false,
        type: DriftSqlType.double,
        requiredDuringInsert: false,
        defaultValue: const Constant(0.0),
      );
  static const VerificationMeta _selfDiagnosisTriggeredMeta =
      const VerificationMeta('selfDiagnosisTriggered');
  @override
  late final GeneratedColumn<bool> selfDiagnosisTriggered =
      GeneratedColumn<bool>(
        'self_diagnosis_triggered',
        aliasedName,
        false,
        type: DriftSqlType.bool,
        requiredDuringInsert: false,
        defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("self_diagnosis_triggered" IN (0, 1))',
        ),
        defaultValue: const Constant(false),
      );
  static const VerificationMeta _rerunDepthMeta = const VerificationMeta(
    'rerunDepth',
  );
  @override
  late final GeneratedColumn<int> rerunDepth = GeneratedColumn<int>(
    'rerun_depth',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _flagReasonMeta = const VerificationMeta(
    'flagReason',
  );
  @override
  late final GeneratedColumn<String> flagReason = GeneratedColumn<String>(
    'flag_reason',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
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
    captureSessionId,
    agreementCoverage,
    agreementPrecision,
    selfDiagnosisTriggered,
    rerunDepth,
    flagReason,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'scenes';
  @override
  VerificationContext validateIntegrity(
    Insertable<Scene> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('capture_session_id')) {
      context.handle(
        _captureSessionIdMeta,
        captureSessionId.isAcceptableOrUnknown(
          data['capture_session_id']!,
          _captureSessionIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_captureSessionIdMeta);
    }
    if (data.containsKey('agreement_coverage')) {
      context.handle(
        _agreementCoverageMeta,
        agreementCoverage.isAcceptableOrUnknown(
          data['agreement_coverage']!,
          _agreementCoverageMeta,
        ),
      );
    }
    if (data.containsKey('agreement_precision')) {
      context.handle(
        _agreementPrecisionMeta,
        agreementPrecision.isAcceptableOrUnknown(
          data['agreement_precision']!,
          _agreementPrecisionMeta,
        ),
      );
    }
    if (data.containsKey('self_diagnosis_triggered')) {
      context.handle(
        _selfDiagnosisTriggeredMeta,
        selfDiagnosisTriggered.isAcceptableOrUnknown(
          data['self_diagnosis_triggered']!,
          _selfDiagnosisTriggeredMeta,
        ),
      );
    }
    if (data.containsKey('rerun_depth')) {
      context.handle(
        _rerunDepthMeta,
        rerunDepth.isAcceptableOrUnknown(data['rerun_depth']!, _rerunDepthMeta),
      );
    }
    if (data.containsKey('flag_reason')) {
      context.handle(
        _flagReasonMeta,
        flagReason.isAcceptableOrUnknown(data['flag_reason']!, _flagReasonMeta),
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
  Scene map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Scene(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      captureSessionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}capture_session_id'],
      )!,
      agreementCoverage: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}agreement_coverage'],
      )!,
      agreementPrecision: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}agreement_precision'],
      )!,
      selfDiagnosisTriggered: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}self_diagnosis_triggered'],
      )!,
      rerunDepth: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}rerun_depth'],
      )!,
      flagReason: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}flag_reason'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $ScenesTable createAlias(String alias) {
    return $ScenesTable(attachedDatabase, alias);
  }
}

class Scene extends DataClass implements Insertable<Scene> {
  /// Stable scene ID (from cross_frame_dedup's SceneObservation.sceneId).
  final String id;

  /// Capture-session bucket — multiple bursts in one session share this.
  final String captureSessionId;

  /// Mean(1{score>=2}) over the scene's detections (§6.3).
  final double agreementCoverage;

  /// Mean(1{score>=3}).
  final double agreementPrecision;
  final bool selfDiagnosisTriggered;
  final int rerunDepth;

  /// One of: empty_detection_set / single_source_run /
  /// diagnosis_budget_exhausted / assemble_failed.
  final String? flagReason;
  final DateTime createdAt;
  const Scene({
    required this.id,
    required this.captureSessionId,
    required this.agreementCoverage,
    required this.agreementPrecision,
    required this.selfDiagnosisTriggered,
    required this.rerunDepth,
    this.flagReason,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['capture_session_id'] = Variable<String>(captureSessionId);
    map['agreement_coverage'] = Variable<double>(agreementCoverage);
    map['agreement_precision'] = Variable<double>(agreementPrecision);
    map['self_diagnosis_triggered'] = Variable<bool>(selfDiagnosisTriggered);
    map['rerun_depth'] = Variable<int>(rerunDepth);
    if (!nullToAbsent || flagReason != null) {
      map['flag_reason'] = Variable<String>(flagReason);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  ScenesCompanion toCompanion(bool nullToAbsent) {
    return ScenesCompanion(
      id: Value(id),
      captureSessionId: Value(captureSessionId),
      agreementCoverage: Value(agreementCoverage),
      agreementPrecision: Value(agreementPrecision),
      selfDiagnosisTriggered: Value(selfDiagnosisTriggered),
      rerunDepth: Value(rerunDepth),
      flagReason: flagReason == null && nullToAbsent
          ? const Value.absent()
          : Value(flagReason),
      createdAt: Value(createdAt),
    );
  }

  factory Scene.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Scene(
      id: serializer.fromJson<String>(json['id']),
      captureSessionId: serializer.fromJson<String>(json['captureSessionId']),
      agreementCoverage: serializer.fromJson<double>(json['agreementCoverage']),
      agreementPrecision: serializer.fromJson<double>(
        json['agreementPrecision'],
      ),
      selfDiagnosisTriggered: serializer.fromJson<bool>(
        json['selfDiagnosisTriggered'],
      ),
      rerunDepth: serializer.fromJson<int>(json['rerunDepth']),
      flagReason: serializer.fromJson<String?>(json['flagReason']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'captureSessionId': serializer.toJson<String>(captureSessionId),
      'agreementCoverage': serializer.toJson<double>(agreementCoverage),
      'agreementPrecision': serializer.toJson<double>(agreementPrecision),
      'selfDiagnosisTriggered': serializer.toJson<bool>(selfDiagnosisTriggered),
      'rerunDepth': serializer.toJson<int>(rerunDepth),
      'flagReason': serializer.toJson<String?>(flagReason),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  Scene copyWith({
    String? id,
    String? captureSessionId,
    double? agreementCoverage,
    double? agreementPrecision,
    bool? selfDiagnosisTriggered,
    int? rerunDepth,
    Value<String?> flagReason = const Value.absent(),
    DateTime? createdAt,
  }) => Scene(
    id: id ?? this.id,
    captureSessionId: captureSessionId ?? this.captureSessionId,
    agreementCoverage: agreementCoverage ?? this.agreementCoverage,
    agreementPrecision: agreementPrecision ?? this.agreementPrecision,
    selfDiagnosisTriggered:
        selfDiagnosisTriggered ?? this.selfDiagnosisTriggered,
    rerunDepth: rerunDepth ?? this.rerunDepth,
    flagReason: flagReason.present ? flagReason.value : this.flagReason,
    createdAt: createdAt ?? this.createdAt,
  );
  Scene copyWithCompanion(ScenesCompanion data) {
    return Scene(
      id: data.id.present ? data.id.value : this.id,
      captureSessionId: data.captureSessionId.present
          ? data.captureSessionId.value
          : this.captureSessionId,
      agreementCoverage: data.agreementCoverage.present
          ? data.agreementCoverage.value
          : this.agreementCoverage,
      agreementPrecision: data.agreementPrecision.present
          ? data.agreementPrecision.value
          : this.agreementPrecision,
      selfDiagnosisTriggered: data.selfDiagnosisTriggered.present
          ? data.selfDiagnosisTriggered.value
          : this.selfDiagnosisTriggered,
      rerunDepth: data.rerunDepth.present
          ? data.rerunDepth.value
          : this.rerunDepth,
      flagReason: data.flagReason.present
          ? data.flagReason.value
          : this.flagReason,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Scene(')
          ..write('id: $id, ')
          ..write('captureSessionId: $captureSessionId, ')
          ..write('agreementCoverage: $agreementCoverage, ')
          ..write('agreementPrecision: $agreementPrecision, ')
          ..write('selfDiagnosisTriggered: $selfDiagnosisTriggered, ')
          ..write('rerunDepth: $rerunDepth, ')
          ..write('flagReason: $flagReason, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    captureSessionId,
    agreementCoverage,
    agreementPrecision,
    selfDiagnosisTriggered,
    rerunDepth,
    flagReason,
    createdAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Scene &&
          other.id == this.id &&
          other.captureSessionId == this.captureSessionId &&
          other.agreementCoverage == this.agreementCoverage &&
          other.agreementPrecision == this.agreementPrecision &&
          other.selfDiagnosisTriggered == this.selfDiagnosisTriggered &&
          other.rerunDepth == this.rerunDepth &&
          other.flagReason == this.flagReason &&
          other.createdAt == this.createdAt);
}

class ScenesCompanion extends UpdateCompanion<Scene> {
  final Value<String> id;
  final Value<String> captureSessionId;
  final Value<double> agreementCoverage;
  final Value<double> agreementPrecision;
  final Value<bool> selfDiagnosisTriggered;
  final Value<int> rerunDepth;
  final Value<String?> flagReason;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const ScenesCompanion({
    this.id = const Value.absent(),
    this.captureSessionId = const Value.absent(),
    this.agreementCoverage = const Value.absent(),
    this.agreementPrecision = const Value.absent(),
    this.selfDiagnosisTriggered = const Value.absent(),
    this.rerunDepth = const Value.absent(),
    this.flagReason = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ScenesCompanion.insert({
    required String id,
    required String captureSessionId,
    this.agreementCoverage = const Value.absent(),
    this.agreementPrecision = const Value.absent(),
    this.selfDiagnosisTriggered = const Value.absent(),
    this.rerunDepth = const Value.absent(),
    this.flagReason = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       captureSessionId = Value(captureSessionId),
       createdAt = Value(createdAt);
  static Insertable<Scene> custom({
    Expression<String>? id,
    Expression<String>? captureSessionId,
    Expression<double>? agreementCoverage,
    Expression<double>? agreementPrecision,
    Expression<bool>? selfDiagnosisTriggered,
    Expression<int>? rerunDepth,
    Expression<String>? flagReason,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (captureSessionId != null) 'capture_session_id': captureSessionId,
      if (agreementCoverage != null) 'agreement_coverage': agreementCoverage,
      if (agreementPrecision != null) 'agreement_precision': agreementPrecision,
      if (selfDiagnosisTriggered != null)
        'self_diagnosis_triggered': selfDiagnosisTriggered,
      if (rerunDepth != null) 'rerun_depth': rerunDepth,
      if (flagReason != null) 'flag_reason': flagReason,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ScenesCompanion copyWith({
    Value<String>? id,
    Value<String>? captureSessionId,
    Value<double>? agreementCoverage,
    Value<double>? agreementPrecision,
    Value<bool>? selfDiagnosisTriggered,
    Value<int>? rerunDepth,
    Value<String?>? flagReason,
    Value<DateTime>? createdAt,
    Value<int>? rowid,
  }) {
    return ScenesCompanion(
      id: id ?? this.id,
      captureSessionId: captureSessionId ?? this.captureSessionId,
      agreementCoverage: agreementCoverage ?? this.agreementCoverage,
      agreementPrecision: agreementPrecision ?? this.agreementPrecision,
      selfDiagnosisTriggered:
          selfDiagnosisTriggered ?? this.selfDiagnosisTriggered,
      rerunDepth: rerunDepth ?? this.rerunDepth,
      flagReason: flagReason ?? this.flagReason,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (captureSessionId.present) {
      map['capture_session_id'] = Variable<String>(captureSessionId.value);
    }
    if (agreementCoverage.present) {
      map['agreement_coverage'] = Variable<double>(agreementCoverage.value);
    }
    if (agreementPrecision.present) {
      map['agreement_precision'] = Variable<double>(agreementPrecision.value);
    }
    if (selfDiagnosisTriggered.present) {
      map['self_diagnosis_triggered'] = Variable<bool>(
        selfDiagnosisTriggered.value,
      );
    }
    if (rerunDepth.present) {
      map['rerun_depth'] = Variable<int>(rerunDepth.value);
    }
    if (flagReason.present) {
      map['flag_reason'] = Variable<String>(flagReason.value);
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
    return (StringBuffer('ScenesCompanion(')
          ..write('id: $id, ')
          ..write('captureSessionId: $captureSessionId, ')
          ..write('agreementCoverage: $agreementCoverage, ')
          ..write('agreementPrecision: $agreementPrecision, ')
          ..write('selfDiagnosisTriggered: $selfDiagnosisTriggered, ')
          ..write('rerunDepth: $rerunDepth, ')
          ..write('flagReason: $flagReason, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $DetectionsTable extends Detections
    with TableInfo<$DetectionsTable, Detection> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $DetectionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _sceneIdMeta = const VerificationMeta(
    'sceneId',
  );
  @override
  late final GeneratedColumn<String> sceneId = GeneratedColumn<String>(
    'scene_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES scenes (id)',
    ),
  );
  static const VerificationMeta _bboxMeta = const VerificationMeta('bbox');
  @override
  late final GeneratedColumn<String> bbox = GeneratedColumn<String>(
    'bbox',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _maskRleMeta = const VerificationMeta(
    'maskRle',
  );
  @override
  late final GeneratedColumn<Uint8List> maskRle = GeneratedColumn<Uint8List>(
    'mask_rle',
    aliasedName,
    true,
    type: DriftSqlType.blob,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _cropEmbeddingI8Meta = const VerificationMeta(
    'cropEmbeddingI8',
  );
  @override
  late final GeneratedColumn<Uint8List> cropEmbeddingI8 =
      GeneratedColumn<Uint8List>(
        'crop_embedding_i8',
        aliasedName,
        true,
        type: DriftSqlType.blob,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _agreementScoreMeta = const VerificationMeta(
    'agreementScore',
  );
  @override
  late final GeneratedColumn<double> agreementScore = GeneratedColumn<double>(
    'agreement_score',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(0.0),
  );
  static const VerificationMeta _contributingSignalsMeta =
      const VerificationMeta('contributingSignals');
  @override
  late final GeneratedColumn<String> contributingSignals =
      GeneratedColumn<String>(
        'contributing_signals',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
        defaultValue: const Constant('[]'),
      );
  static const VerificationMeta _vlmStructuredAttributesMeta =
      const VerificationMeta('vlmStructuredAttributes');
  @override
  late final GeneratedColumn<String> vlmStructuredAttributes =
      GeneratedColumn<String>(
        'vlm_structured_attributes',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
        defaultValue: const Constant('{}'),
      );
  static const VerificationMeta _primaryLabelMeta = const VerificationMeta(
    'primaryLabel',
  );
  @override
  late final GeneratedColumn<String> primaryLabel = GeneratedColumn<String>(
    'primary_label',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _confidenceMeta = const VerificationMeta(
    'confidence',
  );
  @override
  late final GeneratedColumn<double> confidence = GeneratedColumn<double>(
    'confidence',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(0.0),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    sceneId,
    bbox,
    maskRle,
    cropEmbeddingI8,
    agreementScore,
    contributingSignals,
    vlmStructuredAttributes,
    primaryLabel,
    confidence,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'detections';
  @override
  VerificationContext validateIntegrity(
    Insertable<Detection> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('scene_id')) {
      context.handle(
        _sceneIdMeta,
        sceneId.isAcceptableOrUnknown(data['scene_id']!, _sceneIdMeta),
      );
    } else if (isInserting) {
      context.missing(_sceneIdMeta);
    }
    if (data.containsKey('bbox')) {
      context.handle(
        _bboxMeta,
        bbox.isAcceptableOrUnknown(data['bbox']!, _bboxMeta),
      );
    } else if (isInserting) {
      context.missing(_bboxMeta);
    }
    if (data.containsKey('mask_rle')) {
      context.handle(
        _maskRleMeta,
        maskRle.isAcceptableOrUnknown(data['mask_rle']!, _maskRleMeta),
      );
    }
    if (data.containsKey('crop_embedding_i8')) {
      context.handle(
        _cropEmbeddingI8Meta,
        cropEmbeddingI8.isAcceptableOrUnknown(
          data['crop_embedding_i8']!,
          _cropEmbeddingI8Meta,
        ),
      );
    }
    if (data.containsKey('agreement_score')) {
      context.handle(
        _agreementScoreMeta,
        agreementScore.isAcceptableOrUnknown(
          data['agreement_score']!,
          _agreementScoreMeta,
        ),
      );
    }
    if (data.containsKey('contributing_signals')) {
      context.handle(
        _contributingSignalsMeta,
        contributingSignals.isAcceptableOrUnknown(
          data['contributing_signals']!,
          _contributingSignalsMeta,
        ),
      );
    }
    if (data.containsKey('vlm_structured_attributes')) {
      context.handle(
        _vlmStructuredAttributesMeta,
        vlmStructuredAttributes.isAcceptableOrUnknown(
          data['vlm_structured_attributes']!,
          _vlmStructuredAttributesMeta,
        ),
      );
    }
    if (data.containsKey('primary_label')) {
      context.handle(
        _primaryLabelMeta,
        primaryLabel.isAcceptableOrUnknown(
          data['primary_label']!,
          _primaryLabelMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_primaryLabelMeta);
    }
    if (data.containsKey('confidence')) {
      context.handle(
        _confidenceMeta,
        confidence.isAcceptableOrUnknown(data['confidence']!, _confidenceMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  Detection map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Detection(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      sceneId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}scene_id'],
      )!,
      bbox: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}bbox'],
      )!,
      maskRle: attachedDatabase.typeMapping.read(
        DriftSqlType.blob,
        data['${effectivePrefix}mask_rle'],
      ),
      cropEmbeddingI8: attachedDatabase.typeMapping.read(
        DriftSqlType.blob,
        data['${effectivePrefix}crop_embedding_i8'],
      ),
      agreementScore: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}agreement_score'],
      )!,
      contributingSignals: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}contributing_signals'],
      )!,
      vlmStructuredAttributes: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}vlm_structured_attributes'],
      )!,
      primaryLabel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}primary_label'],
      )!,
      confidence: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}confidence'],
      )!,
    );
  }

  @override
  $DetectionsTable createAlias(String alias) {
    return $DetectionsTable(attachedDatabase, alias);
  }
}

class Detection extends DataClass implements Insertable<Detection> {
  /// Stable detection ID (from cross_frame_dedup's PipelineDetection.id).
  final String id;

  /// FK → scenes.id.
  final String sceneId;

  /// JSON: {x, y, width, height} in source-frame pixels.
  final String bbox;

  /// Optional EfficientSAM mask (RLE-encoded bytes).
  final Uint8List? maskRle;

  /// 768-byte int8-quantised crop embedding (DINOv2 ViT-B/14, dequant via /127).
  final Uint8List? cropEmbeddingI8;

  /// agreement_score ∈ {0..5} — how many independent signal classes corroborate.
  final double agreementScore;

  /// JSON: list of {detector, frameId, rawConfidence}.
  final String contributingSignals;

  /// JSON: VLM-derived structured attributes (may be {}).
  final String vlmStructuredAttributes;

  /// Chosen by agreement (not from a class list).
  final String primaryLabel;

  /// Sigmoid-calibrated confidence ∈ [0, 1].
  final double confidence;
  const Detection({
    required this.id,
    required this.sceneId,
    required this.bbox,
    this.maskRle,
    this.cropEmbeddingI8,
    required this.agreementScore,
    required this.contributingSignals,
    required this.vlmStructuredAttributes,
    required this.primaryLabel,
    required this.confidence,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['scene_id'] = Variable<String>(sceneId);
    map['bbox'] = Variable<String>(bbox);
    if (!nullToAbsent || maskRle != null) {
      map['mask_rle'] = Variable<Uint8List>(maskRle);
    }
    if (!nullToAbsent || cropEmbeddingI8 != null) {
      map['crop_embedding_i8'] = Variable<Uint8List>(cropEmbeddingI8);
    }
    map['agreement_score'] = Variable<double>(agreementScore);
    map['contributing_signals'] = Variable<String>(contributingSignals);
    map['vlm_structured_attributes'] = Variable<String>(
      vlmStructuredAttributes,
    );
    map['primary_label'] = Variable<String>(primaryLabel);
    map['confidence'] = Variable<double>(confidence);
    return map;
  }

  DetectionsCompanion toCompanion(bool nullToAbsent) {
    return DetectionsCompanion(
      id: Value(id),
      sceneId: Value(sceneId),
      bbox: Value(bbox),
      maskRle: maskRle == null && nullToAbsent
          ? const Value.absent()
          : Value(maskRle),
      cropEmbeddingI8: cropEmbeddingI8 == null && nullToAbsent
          ? const Value.absent()
          : Value(cropEmbeddingI8),
      agreementScore: Value(agreementScore),
      contributingSignals: Value(contributingSignals),
      vlmStructuredAttributes: Value(vlmStructuredAttributes),
      primaryLabel: Value(primaryLabel),
      confidence: Value(confidence),
    );
  }

  factory Detection.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Detection(
      id: serializer.fromJson<String>(json['id']),
      sceneId: serializer.fromJson<String>(json['sceneId']),
      bbox: serializer.fromJson<String>(json['bbox']),
      maskRle: serializer.fromJson<Uint8List?>(json['maskRle']),
      cropEmbeddingI8: serializer.fromJson<Uint8List?>(json['cropEmbeddingI8']),
      agreementScore: serializer.fromJson<double>(json['agreementScore']),
      contributingSignals: serializer.fromJson<String>(
        json['contributingSignals'],
      ),
      vlmStructuredAttributes: serializer.fromJson<String>(
        json['vlmStructuredAttributes'],
      ),
      primaryLabel: serializer.fromJson<String>(json['primaryLabel']),
      confidence: serializer.fromJson<double>(json['confidence']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'sceneId': serializer.toJson<String>(sceneId),
      'bbox': serializer.toJson<String>(bbox),
      'maskRle': serializer.toJson<Uint8List?>(maskRle),
      'cropEmbeddingI8': serializer.toJson<Uint8List?>(cropEmbeddingI8),
      'agreementScore': serializer.toJson<double>(agreementScore),
      'contributingSignals': serializer.toJson<String>(contributingSignals),
      'vlmStructuredAttributes': serializer.toJson<String>(
        vlmStructuredAttributes,
      ),
      'primaryLabel': serializer.toJson<String>(primaryLabel),
      'confidence': serializer.toJson<double>(confidence),
    };
  }

  Detection copyWith({
    String? id,
    String? sceneId,
    String? bbox,
    Value<Uint8List?> maskRle = const Value.absent(),
    Value<Uint8List?> cropEmbeddingI8 = const Value.absent(),
    double? agreementScore,
    String? contributingSignals,
    String? vlmStructuredAttributes,
    String? primaryLabel,
    double? confidence,
  }) => Detection(
    id: id ?? this.id,
    sceneId: sceneId ?? this.sceneId,
    bbox: bbox ?? this.bbox,
    maskRle: maskRle.present ? maskRle.value : this.maskRle,
    cropEmbeddingI8: cropEmbeddingI8.present
        ? cropEmbeddingI8.value
        : this.cropEmbeddingI8,
    agreementScore: agreementScore ?? this.agreementScore,
    contributingSignals: contributingSignals ?? this.contributingSignals,
    vlmStructuredAttributes:
        vlmStructuredAttributes ?? this.vlmStructuredAttributes,
    primaryLabel: primaryLabel ?? this.primaryLabel,
    confidence: confidence ?? this.confidence,
  );
  Detection copyWithCompanion(DetectionsCompanion data) {
    return Detection(
      id: data.id.present ? data.id.value : this.id,
      sceneId: data.sceneId.present ? data.sceneId.value : this.sceneId,
      bbox: data.bbox.present ? data.bbox.value : this.bbox,
      maskRle: data.maskRle.present ? data.maskRle.value : this.maskRle,
      cropEmbeddingI8: data.cropEmbeddingI8.present
          ? data.cropEmbeddingI8.value
          : this.cropEmbeddingI8,
      agreementScore: data.agreementScore.present
          ? data.agreementScore.value
          : this.agreementScore,
      contributingSignals: data.contributingSignals.present
          ? data.contributingSignals.value
          : this.contributingSignals,
      vlmStructuredAttributes: data.vlmStructuredAttributes.present
          ? data.vlmStructuredAttributes.value
          : this.vlmStructuredAttributes,
      primaryLabel: data.primaryLabel.present
          ? data.primaryLabel.value
          : this.primaryLabel,
      confidence: data.confidence.present
          ? data.confidence.value
          : this.confidence,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Detection(')
          ..write('id: $id, ')
          ..write('sceneId: $sceneId, ')
          ..write('bbox: $bbox, ')
          ..write('maskRle: $maskRle, ')
          ..write('cropEmbeddingI8: $cropEmbeddingI8, ')
          ..write('agreementScore: $agreementScore, ')
          ..write('contributingSignals: $contributingSignals, ')
          ..write('vlmStructuredAttributes: $vlmStructuredAttributes, ')
          ..write('primaryLabel: $primaryLabel, ')
          ..write('confidence: $confidence')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    sceneId,
    bbox,
    $driftBlobEquality.hash(maskRle),
    $driftBlobEquality.hash(cropEmbeddingI8),
    agreementScore,
    contributingSignals,
    vlmStructuredAttributes,
    primaryLabel,
    confidence,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Detection &&
          other.id == this.id &&
          other.sceneId == this.sceneId &&
          other.bbox == this.bbox &&
          $driftBlobEquality.equals(other.maskRle, this.maskRle) &&
          $driftBlobEquality.equals(
            other.cropEmbeddingI8,
            this.cropEmbeddingI8,
          ) &&
          other.agreementScore == this.agreementScore &&
          other.contributingSignals == this.contributingSignals &&
          other.vlmStructuredAttributes == this.vlmStructuredAttributes &&
          other.primaryLabel == this.primaryLabel &&
          other.confidence == this.confidence);
}

class DetectionsCompanion extends UpdateCompanion<Detection> {
  final Value<String> id;
  final Value<String> sceneId;
  final Value<String> bbox;
  final Value<Uint8List?> maskRle;
  final Value<Uint8List?> cropEmbeddingI8;
  final Value<double> agreementScore;
  final Value<String> contributingSignals;
  final Value<String> vlmStructuredAttributes;
  final Value<String> primaryLabel;
  final Value<double> confidence;
  final Value<int> rowid;
  const DetectionsCompanion({
    this.id = const Value.absent(),
    this.sceneId = const Value.absent(),
    this.bbox = const Value.absent(),
    this.maskRle = const Value.absent(),
    this.cropEmbeddingI8 = const Value.absent(),
    this.agreementScore = const Value.absent(),
    this.contributingSignals = const Value.absent(),
    this.vlmStructuredAttributes = const Value.absent(),
    this.primaryLabel = const Value.absent(),
    this.confidence = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  DetectionsCompanion.insert({
    required String id,
    required String sceneId,
    required String bbox,
    this.maskRle = const Value.absent(),
    this.cropEmbeddingI8 = const Value.absent(),
    this.agreementScore = const Value.absent(),
    this.contributingSignals = const Value.absent(),
    this.vlmStructuredAttributes = const Value.absent(),
    required String primaryLabel,
    this.confidence = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       sceneId = Value(sceneId),
       bbox = Value(bbox),
       primaryLabel = Value(primaryLabel);
  static Insertable<Detection> custom({
    Expression<String>? id,
    Expression<String>? sceneId,
    Expression<String>? bbox,
    Expression<Uint8List>? maskRle,
    Expression<Uint8List>? cropEmbeddingI8,
    Expression<double>? agreementScore,
    Expression<String>? contributingSignals,
    Expression<String>? vlmStructuredAttributes,
    Expression<String>? primaryLabel,
    Expression<double>? confidence,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (sceneId != null) 'scene_id': sceneId,
      if (bbox != null) 'bbox': bbox,
      if (maskRle != null) 'mask_rle': maskRle,
      if (cropEmbeddingI8 != null) 'crop_embedding_i8': cropEmbeddingI8,
      if (agreementScore != null) 'agreement_score': agreementScore,
      if (contributingSignals != null)
        'contributing_signals': contributingSignals,
      if (vlmStructuredAttributes != null)
        'vlm_structured_attributes': vlmStructuredAttributes,
      if (primaryLabel != null) 'primary_label': primaryLabel,
      if (confidence != null) 'confidence': confidence,
      if (rowid != null) 'rowid': rowid,
    });
  }

  DetectionsCompanion copyWith({
    Value<String>? id,
    Value<String>? sceneId,
    Value<String>? bbox,
    Value<Uint8List?>? maskRle,
    Value<Uint8List?>? cropEmbeddingI8,
    Value<double>? agreementScore,
    Value<String>? contributingSignals,
    Value<String>? vlmStructuredAttributes,
    Value<String>? primaryLabel,
    Value<double>? confidence,
    Value<int>? rowid,
  }) {
    return DetectionsCompanion(
      id: id ?? this.id,
      sceneId: sceneId ?? this.sceneId,
      bbox: bbox ?? this.bbox,
      maskRle: maskRle ?? this.maskRle,
      cropEmbeddingI8: cropEmbeddingI8 ?? this.cropEmbeddingI8,
      agreementScore: agreementScore ?? this.agreementScore,
      contributingSignals: contributingSignals ?? this.contributingSignals,
      vlmStructuredAttributes:
          vlmStructuredAttributes ?? this.vlmStructuredAttributes,
      primaryLabel: primaryLabel ?? this.primaryLabel,
      confidence: confidence ?? this.confidence,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (sceneId.present) {
      map['scene_id'] = Variable<String>(sceneId.value);
    }
    if (bbox.present) {
      map['bbox'] = Variable<String>(bbox.value);
    }
    if (maskRle.present) {
      map['mask_rle'] = Variable<Uint8List>(maskRle.value);
    }
    if (cropEmbeddingI8.present) {
      map['crop_embedding_i8'] = Variable<Uint8List>(cropEmbeddingI8.value);
    }
    if (agreementScore.present) {
      map['agreement_score'] = Variable<double>(agreementScore.value);
    }
    if (contributingSignals.present) {
      map['contributing_signals'] = Variable<String>(contributingSignals.value);
    }
    if (vlmStructuredAttributes.present) {
      map['vlm_structured_attributes'] = Variable<String>(
        vlmStructuredAttributes.value,
      );
    }
    if (primaryLabel.present) {
      map['primary_label'] = Variable<String>(primaryLabel.value);
    }
    if (confidence.present) {
      map['confidence'] = Variable<double>(confidence.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('DetectionsCompanion(')
          ..write('id: $id, ')
          ..write('sceneId: $sceneId, ')
          ..write('bbox: $bbox, ')
          ..write('maskRle: $maskRle, ')
          ..write('cropEmbeddingI8: $cropEmbeddingI8, ')
          ..write('agreementScore: $agreementScore, ')
          ..write('contributingSignals: $contributingSignals, ')
          ..write('vlmStructuredAttributes: $vlmStructuredAttributes, ')
          ..write('primaryLabel: $primaryLabel, ')
          ..write('confidence: $confidence, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $DetectionLabelsTable extends DetectionLabels
    with TableInfo<$DetectionLabelsTable, DetectionLabel> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $DetectionLabelsTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _detectionIdMeta = const VerificationMeta(
    'detectionId',
  );
  @override
  late final GeneratedColumn<String> detectionId = GeneratedColumn<String>(
    'detection_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES detections (id)',
    ),
  );
  static const VerificationMeta _labelMeta = const VerificationMeta('label');
  @override
  late final GeneratedColumn<String> label = GeneratedColumn<String>(
    'label',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _confidenceMeta = const VerificationMeta(
    'confidence',
  );
  @override
  late final GeneratedColumn<double> confidence = GeneratedColumn<double>(
    'confidence',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(0.0),
  );
  static const VerificationMeta _isPrimaryMeta = const VerificationMeta(
    'isPrimary',
  );
  @override
  late final GeneratedColumn<bool> isPrimary = GeneratedColumn<bool>(
    'is_primary',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_primary" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    detectionId,
    label,
    confidence,
    isPrimary,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'detection_labels';
  @override
  VerificationContext validateIntegrity(
    Insertable<DetectionLabel> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('detection_id')) {
      context.handle(
        _detectionIdMeta,
        detectionId.isAcceptableOrUnknown(
          data['detection_id']!,
          _detectionIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_detectionIdMeta);
    }
    if (data.containsKey('label')) {
      context.handle(
        _labelMeta,
        label.isAcceptableOrUnknown(data['label']!, _labelMeta),
      );
    } else if (isInserting) {
      context.missing(_labelMeta);
    }
    if (data.containsKey('confidence')) {
      context.handle(
        _confidenceMeta,
        confidence.isAcceptableOrUnknown(data['confidence']!, _confidenceMeta),
      );
    }
    if (data.containsKey('is_primary')) {
      context.handle(
        _isPrimaryMeta,
        isPrimary.isAcceptableOrUnknown(data['is_primary']!, _isPrimaryMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  DetectionLabel map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return DetectionLabel(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      detectionId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}detection_id'],
      )!,
      label: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}label'],
      )!,
      confidence: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}confidence'],
      )!,
      isPrimary: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_primary'],
      )!,
    );
  }

  @override
  $DetectionLabelsTable createAlias(String alias) {
    return $DetectionLabelsTable(attachedDatabase, alias);
  }
}

class DetectionLabel extends DataClass implements Insertable<DetectionLabel> {
  final int id;
  final String detectionId;
  final String label;
  final double confidence;

  /// True for the cluster's primary label, false for alternates.
  final bool isPrimary;
  const DetectionLabel({
    required this.id,
    required this.detectionId,
    required this.label,
    required this.confidence,
    required this.isPrimary,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['detection_id'] = Variable<String>(detectionId);
    map['label'] = Variable<String>(label);
    map['confidence'] = Variable<double>(confidence);
    map['is_primary'] = Variable<bool>(isPrimary);
    return map;
  }

  DetectionLabelsCompanion toCompanion(bool nullToAbsent) {
    return DetectionLabelsCompanion(
      id: Value(id),
      detectionId: Value(detectionId),
      label: Value(label),
      confidence: Value(confidence),
      isPrimary: Value(isPrimary),
    );
  }

  factory DetectionLabel.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return DetectionLabel(
      id: serializer.fromJson<int>(json['id']),
      detectionId: serializer.fromJson<String>(json['detectionId']),
      label: serializer.fromJson<String>(json['label']),
      confidence: serializer.fromJson<double>(json['confidence']),
      isPrimary: serializer.fromJson<bool>(json['isPrimary']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'detectionId': serializer.toJson<String>(detectionId),
      'label': serializer.toJson<String>(label),
      'confidence': serializer.toJson<double>(confidence),
      'isPrimary': serializer.toJson<bool>(isPrimary),
    };
  }

  DetectionLabel copyWith({
    int? id,
    String? detectionId,
    String? label,
    double? confidence,
    bool? isPrimary,
  }) => DetectionLabel(
    id: id ?? this.id,
    detectionId: detectionId ?? this.detectionId,
    label: label ?? this.label,
    confidence: confidence ?? this.confidence,
    isPrimary: isPrimary ?? this.isPrimary,
  );
  DetectionLabel copyWithCompanion(DetectionLabelsCompanion data) {
    return DetectionLabel(
      id: data.id.present ? data.id.value : this.id,
      detectionId: data.detectionId.present
          ? data.detectionId.value
          : this.detectionId,
      label: data.label.present ? data.label.value : this.label,
      confidence: data.confidence.present
          ? data.confidence.value
          : this.confidence,
      isPrimary: data.isPrimary.present ? data.isPrimary.value : this.isPrimary,
    );
  }

  @override
  String toString() {
    return (StringBuffer('DetectionLabel(')
          ..write('id: $id, ')
          ..write('detectionId: $detectionId, ')
          ..write('label: $label, ')
          ..write('confidence: $confidence, ')
          ..write('isPrimary: $isPrimary')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, detectionId, label, confidence, isPrimary);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is DetectionLabel &&
          other.id == this.id &&
          other.detectionId == this.detectionId &&
          other.label == this.label &&
          other.confidence == this.confidence &&
          other.isPrimary == this.isPrimary);
}

class DetectionLabelsCompanion extends UpdateCompanion<DetectionLabel> {
  final Value<int> id;
  final Value<String> detectionId;
  final Value<String> label;
  final Value<double> confidence;
  final Value<bool> isPrimary;
  const DetectionLabelsCompanion({
    this.id = const Value.absent(),
    this.detectionId = const Value.absent(),
    this.label = const Value.absent(),
    this.confidence = const Value.absent(),
    this.isPrimary = const Value.absent(),
  });
  DetectionLabelsCompanion.insert({
    this.id = const Value.absent(),
    required String detectionId,
    required String label,
    this.confidence = const Value.absent(),
    this.isPrimary = const Value.absent(),
  }) : detectionId = Value(detectionId),
       label = Value(label);
  static Insertable<DetectionLabel> custom({
    Expression<int>? id,
    Expression<String>? detectionId,
    Expression<String>? label,
    Expression<double>? confidence,
    Expression<bool>? isPrimary,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (detectionId != null) 'detection_id': detectionId,
      if (label != null) 'label': label,
      if (confidence != null) 'confidence': confidence,
      if (isPrimary != null) 'is_primary': isPrimary,
    });
  }

  DetectionLabelsCompanion copyWith({
    Value<int>? id,
    Value<String>? detectionId,
    Value<String>? label,
    Value<double>? confidence,
    Value<bool>? isPrimary,
  }) {
    return DetectionLabelsCompanion(
      id: id ?? this.id,
      detectionId: detectionId ?? this.detectionId,
      label: label ?? this.label,
      confidence: confidence ?? this.confidence,
      isPrimary: isPrimary ?? this.isPrimary,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (detectionId.present) {
      map['detection_id'] = Variable<String>(detectionId.value);
    }
    if (label.present) {
      map['label'] = Variable<String>(label.value);
    }
    if (confidence.present) {
      map['confidence'] = Variable<double>(confidence.value);
    }
    if (isPrimary.present) {
      map['is_primary'] = Variable<bool>(isPrimary.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('DetectionLabelsCompanion(')
          ..write('id: $id, ')
          ..write('detectionId: $detectionId, ')
          ..write('label: $label, ')
          ..write('confidence: $confidence, ')
          ..write('isPrimary: $isPrimary')
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
  late final $ScenesTable scenes = $ScenesTable(this);
  late final $DetectionsTable detections = $DetectionsTable(this);
  late final $DetectionLabelsTable detectionLabels = $DetectionLabelsTable(
    this,
  );
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    inventoryItems,
    labels,
    labelSearchFts,
    scenes,
    detections,
    detectionLabels,
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
  ]);
}

typedef $$InventoryItemsTableCreateCompanionBuilder =
    InventoryItemsCompanion Function({
      required String id,
      required String photoPath,
      required String thumbnailPath,
      Value<String?> serverPhotoUrl,
      required String detectionData,
      Value<String> status,
      Value<bool> isFlagged,
      required DateTime createdAt,
      required DateTime updatedAt,
      Value<int> rowid,
    });
typedef $$InventoryItemsTableUpdateCompanionBuilder =
    InventoryItemsCompanion Function({
      Value<String> id,
      Value<String> photoPath,
      Value<String> thumbnailPath,
      Value<String?> serverPhotoUrl,
      Value<String> detectionData,
      Value<String> status,
      Value<bool> isFlagged,
      Value<DateTime> createdAt,
      Value<DateTime> updatedAt,
      Value<int> rowid,
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
    ).filter((f) => f.itemId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_labelsRefsTable($_db));
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
  ColumnFilters<String> get id => $composableBuilder(
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

  ColumnFilters<String> get serverPhotoUrl => $composableBuilder(
    column: $table.serverPhotoUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get detectionData => $composableBuilder(
    column: $table.detectionData,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isFlagged => $composableBuilder(
    column: $table.isFlagged,
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
  ColumnOrderings<String> get id => $composableBuilder(
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

  ColumnOrderings<String> get serverPhotoUrl => $composableBuilder(
    column: $table.serverPhotoUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get detectionData => $composableBuilder(
    column: $table.detectionData,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isFlagged => $composableBuilder(
    column: $table.isFlagged,
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
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get photoPath =>
      $composableBuilder(column: $table.photoPath, builder: (column) => column);

  GeneratedColumn<String> get thumbnailPath => $composableBuilder(
    column: $table.thumbnailPath,
    builder: (column) => column,
  );

  GeneratedColumn<String> get serverPhotoUrl => $composableBuilder(
    column: $table.serverPhotoUrl,
    builder: (column) => column,
  );

  GeneratedColumn<String> get detectionData => $composableBuilder(
    column: $table.detectionData,
    builder: (column) => column,
  );

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<bool> get isFlagged =>
      $composableBuilder(column: $table.isFlagged, builder: (column) => column);

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
          PrefetchHooks Function({bool labelsRefs})
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
                Value<String> id = const Value.absent(),
                Value<String> photoPath = const Value.absent(),
                Value<String> thumbnailPath = const Value.absent(),
                Value<String?> serverPhotoUrl = const Value.absent(),
                Value<String> detectionData = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<bool> isFlagged = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => InventoryItemsCompanion(
                id: id,
                photoPath: photoPath,
                thumbnailPath: thumbnailPath,
                serverPhotoUrl: serverPhotoUrl,
                detectionData: detectionData,
                status: status,
                isFlagged: isFlagged,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String photoPath,
                required String thumbnailPath,
                Value<String?> serverPhotoUrl = const Value.absent(),
                required String detectionData,
                Value<String> status = const Value.absent(),
                Value<bool> isFlagged = const Value.absent(),
                required DateTime createdAt,
                required DateTime updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => InventoryItemsCompanion.insert(
                id: id,
                photoPath: photoPath,
                thumbnailPath: thumbnailPath,
                serverPhotoUrl: serverPhotoUrl,
                detectionData: detectionData,
                status: status,
                isFlagged: isFlagged,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$InventoryItemsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({labelsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [if (labelsRefs) db.labels],
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
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where((e) => e.itemId == item.id),
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
      PrefetchHooks Function({bool labelsRefs})
    >;
typedef $$LabelsTableCreateCompanionBuilder =
    LabelsCompanion Function({
      Value<int> id,
      required String itemId,
      required String key,
      required String value,
      Value<double> confidence,
      required DateTime createdAt,
    });
typedef $$LabelsTableUpdateCompanionBuilder =
    LabelsCompanion Function({
      Value<int> id,
      Value<String> itemId,
      Value<String> key,
      Value<String> value,
      Value<double> confidence,
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
    final $_column = $_itemColumn<String>('item_id')!;

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

  ColumnFilters<double> get confidence => $composableBuilder(
    column: $table.confidence,
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

  ColumnOrderings<double> get confidence => $composableBuilder(
    column: $table.confidence,
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

  GeneratedColumn<double> get confidence => $composableBuilder(
    column: $table.confidence,
    builder: (column) => column,
  );

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
                Value<String> itemId = const Value.absent(),
                Value<String> key = const Value.absent(),
                Value<String> value = const Value.absent(),
                Value<double> confidence = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
              }) => LabelsCompanion(
                id: id,
                itemId: itemId,
                key: key,
                value: value,
                confidence: confidence,
                createdAt: createdAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String itemId,
                required String key,
                required String value,
                Value<double> confidence = const Value.absent(),
                required DateTime createdAt,
              }) => LabelsCompanion.insert(
                id: id,
                itemId: itemId,
                key: key,
                value: value,
                confidence: confidence,
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
      required String key,
      required String value,
    });
typedef $$LabelSearchFtsTableUpdateCompanionBuilder =
    LabelSearchFtsCompanion Function({
      Value<int> labelId,
      Value<String> key,
      Value<String> value,
    });

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

  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
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

  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
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

  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

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
                Value<String> key = const Value.absent(),
                Value<String> value = const Value.absent(),
              }) => LabelSearchFtsCompanion(
                labelId: labelId,
                key: key,
                value: value,
              ),
          createCompanionCallback:
              ({
                required int labelId,
                required String key,
                required String value,
              }) => LabelSearchFtsCompanion.insert(
                labelId: labelId,
                key: key,
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
typedef $$ScenesTableCreateCompanionBuilder =
    ScenesCompanion Function({
      required String id,
      required String captureSessionId,
      Value<double> agreementCoverage,
      Value<double> agreementPrecision,
      Value<bool> selfDiagnosisTriggered,
      Value<int> rerunDepth,
      Value<String?> flagReason,
      required DateTime createdAt,
      Value<int> rowid,
    });
typedef $$ScenesTableUpdateCompanionBuilder =
    ScenesCompanion Function({
      Value<String> id,
      Value<String> captureSessionId,
      Value<double> agreementCoverage,
      Value<double> agreementPrecision,
      Value<bool> selfDiagnosisTriggered,
      Value<int> rerunDepth,
      Value<String?> flagReason,
      Value<DateTime> createdAt,
      Value<int> rowid,
    });

final class $$ScenesTableReferences
    extends BaseReferences<_$AppDatabase, $ScenesTable, Scene> {
  $$ScenesTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$DetectionsTable, List<Detection>>
  _detectionsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.detections,
    aliasName: $_aliasNameGenerator(db.scenes.id, db.detections.sceneId),
  );

  $$DetectionsTableProcessedTableManager get detectionsRefs {
    final manager = $$DetectionsTableTableManager(
      $_db,
      $_db.detections,
    ).filter((f) => f.sceneId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_detectionsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$ScenesTableFilterComposer
    extends Composer<_$AppDatabase, $ScenesTable> {
  $$ScenesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get captureSessionId => $composableBuilder(
    column: $table.captureSessionId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get agreementCoverage => $composableBuilder(
    column: $table.agreementCoverage,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get agreementPrecision => $composableBuilder(
    column: $table.agreementPrecision,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get selfDiagnosisTriggered => $composableBuilder(
    column: $table.selfDiagnosisTriggered,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get rerunDepth => $composableBuilder(
    column: $table.rerunDepth,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get flagReason => $composableBuilder(
    column: $table.flagReason,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> detectionsRefs(
    Expression<bool> Function($$DetectionsTableFilterComposer f) f,
  ) {
    final $$DetectionsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.detections,
      getReferencedColumn: (t) => t.sceneId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$DetectionsTableFilterComposer(
            $db: $db,
            $table: $db.detections,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ScenesTableOrderingComposer
    extends Composer<_$AppDatabase, $ScenesTable> {
  $$ScenesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get captureSessionId => $composableBuilder(
    column: $table.captureSessionId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get agreementCoverage => $composableBuilder(
    column: $table.agreementCoverage,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get agreementPrecision => $composableBuilder(
    column: $table.agreementPrecision,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get selfDiagnosisTriggered => $composableBuilder(
    column: $table.selfDiagnosisTriggered,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get rerunDepth => $composableBuilder(
    column: $table.rerunDepth,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get flagReason => $composableBuilder(
    column: $table.flagReason,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ScenesTableAnnotationComposer
    extends Composer<_$AppDatabase, $ScenesTable> {
  $$ScenesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get captureSessionId => $composableBuilder(
    column: $table.captureSessionId,
    builder: (column) => column,
  );

  GeneratedColumn<double> get agreementCoverage => $composableBuilder(
    column: $table.agreementCoverage,
    builder: (column) => column,
  );

  GeneratedColumn<double> get agreementPrecision => $composableBuilder(
    column: $table.agreementPrecision,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get selfDiagnosisTriggered => $composableBuilder(
    column: $table.selfDiagnosisTriggered,
    builder: (column) => column,
  );

  GeneratedColumn<int> get rerunDepth => $composableBuilder(
    column: $table.rerunDepth,
    builder: (column) => column,
  );

  GeneratedColumn<String> get flagReason => $composableBuilder(
    column: $table.flagReason,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  Expression<T> detectionsRefs<T extends Object>(
    Expression<T> Function($$DetectionsTableAnnotationComposer a) f,
  ) {
    final $$DetectionsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.detections,
      getReferencedColumn: (t) => t.sceneId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$DetectionsTableAnnotationComposer(
            $db: $db,
            $table: $db.detections,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ScenesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ScenesTable,
          Scene,
          $$ScenesTableFilterComposer,
          $$ScenesTableOrderingComposer,
          $$ScenesTableAnnotationComposer,
          $$ScenesTableCreateCompanionBuilder,
          $$ScenesTableUpdateCompanionBuilder,
          (Scene, $$ScenesTableReferences),
          Scene,
          PrefetchHooks Function({bool detectionsRefs})
        > {
  $$ScenesTableTableManager(_$AppDatabase db, $ScenesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ScenesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ScenesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ScenesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> captureSessionId = const Value.absent(),
                Value<double> agreementCoverage = const Value.absent(),
                Value<double> agreementPrecision = const Value.absent(),
                Value<bool> selfDiagnosisTriggered = const Value.absent(),
                Value<int> rerunDepth = const Value.absent(),
                Value<String?> flagReason = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ScenesCompanion(
                id: id,
                captureSessionId: captureSessionId,
                agreementCoverage: agreementCoverage,
                agreementPrecision: agreementPrecision,
                selfDiagnosisTriggered: selfDiagnosisTriggered,
                rerunDepth: rerunDepth,
                flagReason: flagReason,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String captureSessionId,
                Value<double> agreementCoverage = const Value.absent(),
                Value<double> agreementPrecision = const Value.absent(),
                Value<bool> selfDiagnosisTriggered = const Value.absent(),
                Value<int> rerunDepth = const Value.absent(),
                Value<String?> flagReason = const Value.absent(),
                required DateTime createdAt,
                Value<int> rowid = const Value.absent(),
              }) => ScenesCompanion.insert(
                id: id,
                captureSessionId: captureSessionId,
                agreementCoverage: agreementCoverage,
                agreementPrecision: agreementPrecision,
                selfDiagnosisTriggered: selfDiagnosisTriggered,
                rerunDepth: rerunDepth,
                flagReason: flagReason,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) =>
                    (e.readTable(table), $$ScenesTableReferences(db, table, e)),
              )
              .toList(),
          prefetchHooksCallback: ({detectionsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [if (detectionsRefs) db.detections],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (detectionsRefs)
                    await $_getPrefetchedData<Scene, $ScenesTable, Detection>(
                      currentTable: table,
                      referencedTable: $$ScenesTableReferences
                          ._detectionsRefsTable(db),
                      managerFromTypedResult: (p0) =>
                          $$ScenesTableReferences(db, table, p0).detectionsRefs,
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where((e) => e.sceneId == item.id),
                      typedResults: items,
                    ),
                ];
              },
            );
          },
        ),
      );
}

typedef $$ScenesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ScenesTable,
      Scene,
      $$ScenesTableFilterComposer,
      $$ScenesTableOrderingComposer,
      $$ScenesTableAnnotationComposer,
      $$ScenesTableCreateCompanionBuilder,
      $$ScenesTableUpdateCompanionBuilder,
      (Scene, $$ScenesTableReferences),
      Scene,
      PrefetchHooks Function({bool detectionsRefs})
    >;
typedef $$DetectionsTableCreateCompanionBuilder =
    DetectionsCompanion Function({
      required String id,
      required String sceneId,
      required String bbox,
      Value<Uint8List?> maskRle,
      Value<Uint8List?> cropEmbeddingI8,
      Value<double> agreementScore,
      Value<String> contributingSignals,
      Value<String> vlmStructuredAttributes,
      required String primaryLabel,
      Value<double> confidence,
      Value<int> rowid,
    });
typedef $$DetectionsTableUpdateCompanionBuilder =
    DetectionsCompanion Function({
      Value<String> id,
      Value<String> sceneId,
      Value<String> bbox,
      Value<Uint8List?> maskRle,
      Value<Uint8List?> cropEmbeddingI8,
      Value<double> agreementScore,
      Value<String> contributingSignals,
      Value<String> vlmStructuredAttributes,
      Value<String> primaryLabel,
      Value<double> confidence,
      Value<int> rowid,
    });

final class $$DetectionsTableReferences
    extends BaseReferences<_$AppDatabase, $DetectionsTable, Detection> {
  $$DetectionsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $ScenesTable _sceneIdTable(_$AppDatabase db) => db.scenes.createAlias(
    $_aliasNameGenerator(db.detections.sceneId, db.scenes.id),
  );

  $$ScenesTableProcessedTableManager get sceneId {
    final $_column = $_itemColumn<String>('scene_id')!;

    final manager = $$ScenesTableTableManager(
      $_db,
      $_db.scenes,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_sceneIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }

  static MultiTypedResultKey<$DetectionLabelsTable, List<DetectionLabel>>
  _detectionLabelsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
    db.detectionLabels,
    aliasName: $_aliasNameGenerator(
      db.detections.id,
      db.detectionLabels.detectionId,
    ),
  );

  $$DetectionLabelsTableProcessedTableManager get detectionLabelsRefs {
    final manager = $$DetectionLabelsTableTableManager(
      $_db,
      $_db.detectionLabels,
    ).filter((f) => f.detectionId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(
      _detectionLabelsRefsTable($_db),
    );
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$DetectionsTableFilterComposer
    extends Composer<_$AppDatabase, $DetectionsTable> {
  $$DetectionsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get bbox => $composableBuilder(
    column: $table.bbox,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<Uint8List> get maskRle => $composableBuilder(
    column: $table.maskRle,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<Uint8List> get cropEmbeddingI8 => $composableBuilder(
    column: $table.cropEmbeddingI8,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get agreementScore => $composableBuilder(
    column: $table.agreementScore,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get contributingSignals => $composableBuilder(
    column: $table.contributingSignals,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get vlmStructuredAttributes => $composableBuilder(
    column: $table.vlmStructuredAttributes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get primaryLabel => $composableBuilder(
    column: $table.primaryLabel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get confidence => $composableBuilder(
    column: $table.confidence,
    builder: (column) => ColumnFilters(column),
  );

  $$ScenesTableFilterComposer get sceneId {
    final $$ScenesTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sceneId,
      referencedTable: $db.scenes,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ScenesTableFilterComposer(
            $db: $db,
            $table: $db.scenes,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  Expression<bool> detectionLabelsRefs(
    Expression<bool> Function($$DetectionLabelsTableFilterComposer f) f,
  ) {
    final $$DetectionLabelsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.detectionLabels,
      getReferencedColumn: (t) => t.detectionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$DetectionLabelsTableFilterComposer(
            $db: $db,
            $table: $db.detectionLabels,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$DetectionsTableOrderingComposer
    extends Composer<_$AppDatabase, $DetectionsTable> {
  $$DetectionsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get bbox => $composableBuilder(
    column: $table.bbox,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<Uint8List> get maskRle => $composableBuilder(
    column: $table.maskRle,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<Uint8List> get cropEmbeddingI8 => $composableBuilder(
    column: $table.cropEmbeddingI8,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get agreementScore => $composableBuilder(
    column: $table.agreementScore,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get contributingSignals => $composableBuilder(
    column: $table.contributingSignals,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get vlmStructuredAttributes => $composableBuilder(
    column: $table.vlmStructuredAttributes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get primaryLabel => $composableBuilder(
    column: $table.primaryLabel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get confidence => $composableBuilder(
    column: $table.confidence,
    builder: (column) => ColumnOrderings(column),
  );

  $$ScenesTableOrderingComposer get sceneId {
    final $$ScenesTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sceneId,
      referencedTable: $db.scenes,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ScenesTableOrderingComposer(
            $db: $db,
            $table: $db.scenes,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$DetectionsTableAnnotationComposer
    extends Composer<_$AppDatabase, $DetectionsTable> {
  $$DetectionsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get bbox =>
      $composableBuilder(column: $table.bbox, builder: (column) => column);

  GeneratedColumn<Uint8List> get maskRle =>
      $composableBuilder(column: $table.maskRle, builder: (column) => column);

  GeneratedColumn<Uint8List> get cropEmbeddingI8 => $composableBuilder(
    column: $table.cropEmbeddingI8,
    builder: (column) => column,
  );

  GeneratedColumn<double> get agreementScore => $composableBuilder(
    column: $table.agreementScore,
    builder: (column) => column,
  );

  GeneratedColumn<String> get contributingSignals => $composableBuilder(
    column: $table.contributingSignals,
    builder: (column) => column,
  );

  GeneratedColumn<String> get vlmStructuredAttributes => $composableBuilder(
    column: $table.vlmStructuredAttributes,
    builder: (column) => column,
  );

  GeneratedColumn<String> get primaryLabel => $composableBuilder(
    column: $table.primaryLabel,
    builder: (column) => column,
  );

  GeneratedColumn<double> get confidence => $composableBuilder(
    column: $table.confidence,
    builder: (column) => column,
  );

  $$ScenesTableAnnotationComposer get sceneId {
    final $$ScenesTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.sceneId,
      referencedTable: $db.scenes,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ScenesTableAnnotationComposer(
            $db: $db,
            $table: $db.scenes,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }

  Expression<T> detectionLabelsRefs<T extends Object>(
    Expression<T> Function($$DetectionLabelsTableAnnotationComposer a) f,
  ) {
    final $$DetectionLabelsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.detectionLabels,
      getReferencedColumn: (t) => t.detectionId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$DetectionLabelsTableAnnotationComposer(
            $db: $db,
            $table: $db.detectionLabels,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$DetectionsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $DetectionsTable,
          Detection,
          $$DetectionsTableFilterComposer,
          $$DetectionsTableOrderingComposer,
          $$DetectionsTableAnnotationComposer,
          $$DetectionsTableCreateCompanionBuilder,
          $$DetectionsTableUpdateCompanionBuilder,
          (Detection, $$DetectionsTableReferences),
          Detection,
          PrefetchHooks Function({bool sceneId, bool detectionLabelsRefs})
        > {
  $$DetectionsTableTableManager(_$AppDatabase db, $DetectionsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$DetectionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$DetectionsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$DetectionsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> sceneId = const Value.absent(),
                Value<String> bbox = const Value.absent(),
                Value<Uint8List?> maskRle = const Value.absent(),
                Value<Uint8List?> cropEmbeddingI8 = const Value.absent(),
                Value<double> agreementScore = const Value.absent(),
                Value<String> contributingSignals = const Value.absent(),
                Value<String> vlmStructuredAttributes = const Value.absent(),
                Value<String> primaryLabel = const Value.absent(),
                Value<double> confidence = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => DetectionsCompanion(
                id: id,
                sceneId: sceneId,
                bbox: bbox,
                maskRle: maskRle,
                cropEmbeddingI8: cropEmbeddingI8,
                agreementScore: agreementScore,
                contributingSignals: contributingSignals,
                vlmStructuredAttributes: vlmStructuredAttributes,
                primaryLabel: primaryLabel,
                confidence: confidence,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String sceneId,
                required String bbox,
                Value<Uint8List?> maskRle = const Value.absent(),
                Value<Uint8List?> cropEmbeddingI8 = const Value.absent(),
                Value<double> agreementScore = const Value.absent(),
                Value<String> contributingSignals = const Value.absent(),
                Value<String> vlmStructuredAttributes = const Value.absent(),
                required String primaryLabel,
                Value<double> confidence = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => DetectionsCompanion.insert(
                id: id,
                sceneId: sceneId,
                bbox: bbox,
                maskRle: maskRle,
                cropEmbeddingI8: cropEmbeddingI8,
                agreementScore: agreementScore,
                contributingSignals: contributingSignals,
                vlmStructuredAttributes: vlmStructuredAttributes,
                primaryLabel: primaryLabel,
                confidence: confidence,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$DetectionsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({sceneId = false, detectionLabelsRefs = false}) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (detectionLabelsRefs) db.detectionLabels,
                  ],
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
                        if (sceneId) {
                          state =
                              state.withJoin(
                                    currentTable: table,
                                    currentColumn: table.sceneId,
                                    referencedTable: $$DetectionsTableReferences
                                        ._sceneIdTable(db),
                                    referencedColumn:
                                        $$DetectionsTableReferences
                                            ._sceneIdTable(db)
                                            .id,
                                  )
                                  as T;
                        }

                        return state;
                      },
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (detectionLabelsRefs)
                        await $_getPrefetchedData<
                          Detection,
                          $DetectionsTable,
                          DetectionLabel
                        >(
                          currentTable: table,
                          referencedTable: $$DetectionsTableReferences
                              ._detectionLabelsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$DetectionsTableReferences(
                                db,
                                table,
                                p0,
                              ).detectionLabelsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.detectionId == item.id,
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

typedef $$DetectionsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $DetectionsTable,
      Detection,
      $$DetectionsTableFilterComposer,
      $$DetectionsTableOrderingComposer,
      $$DetectionsTableAnnotationComposer,
      $$DetectionsTableCreateCompanionBuilder,
      $$DetectionsTableUpdateCompanionBuilder,
      (Detection, $$DetectionsTableReferences),
      Detection,
      PrefetchHooks Function({bool sceneId, bool detectionLabelsRefs})
    >;
typedef $$DetectionLabelsTableCreateCompanionBuilder =
    DetectionLabelsCompanion Function({
      Value<int> id,
      required String detectionId,
      required String label,
      Value<double> confidence,
      Value<bool> isPrimary,
    });
typedef $$DetectionLabelsTableUpdateCompanionBuilder =
    DetectionLabelsCompanion Function({
      Value<int> id,
      Value<String> detectionId,
      Value<String> label,
      Value<double> confidence,
      Value<bool> isPrimary,
    });

final class $$DetectionLabelsTableReferences
    extends
        BaseReferences<_$AppDatabase, $DetectionLabelsTable, DetectionLabel> {
  $$DetectionLabelsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $DetectionsTable _detectionIdTable(_$AppDatabase db) =>
      db.detections.createAlias(
        $_aliasNameGenerator(db.detectionLabels.detectionId, db.detections.id),
      );

  $$DetectionsTableProcessedTableManager get detectionId {
    final $_column = $_itemColumn<String>('detection_id')!;

    final manager = $$DetectionsTableTableManager(
      $_db,
      $_db.detections,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_detectionIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$DetectionLabelsTableFilterComposer
    extends Composer<_$AppDatabase, $DetectionLabelsTable> {
  $$DetectionLabelsTableFilterComposer({
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

  ColumnFilters<String> get label => $composableBuilder(
    column: $table.label,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get confidence => $composableBuilder(
    column: $table.confidence,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isPrimary => $composableBuilder(
    column: $table.isPrimary,
    builder: (column) => ColumnFilters(column),
  );

  $$DetectionsTableFilterComposer get detectionId {
    final $$DetectionsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.detectionId,
      referencedTable: $db.detections,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$DetectionsTableFilterComposer(
            $db: $db,
            $table: $db.detections,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$DetectionLabelsTableOrderingComposer
    extends Composer<_$AppDatabase, $DetectionLabelsTable> {
  $$DetectionLabelsTableOrderingComposer({
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

  ColumnOrderings<String> get label => $composableBuilder(
    column: $table.label,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get confidence => $composableBuilder(
    column: $table.confidence,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isPrimary => $composableBuilder(
    column: $table.isPrimary,
    builder: (column) => ColumnOrderings(column),
  );

  $$DetectionsTableOrderingComposer get detectionId {
    final $$DetectionsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.detectionId,
      referencedTable: $db.detections,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$DetectionsTableOrderingComposer(
            $db: $db,
            $table: $db.detections,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$DetectionLabelsTableAnnotationComposer
    extends Composer<_$AppDatabase, $DetectionLabelsTable> {
  $$DetectionLabelsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get label =>
      $composableBuilder(column: $table.label, builder: (column) => column);

  GeneratedColumn<double> get confidence => $composableBuilder(
    column: $table.confidence,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get isPrimary =>
      $composableBuilder(column: $table.isPrimary, builder: (column) => column);

  $$DetectionsTableAnnotationComposer get detectionId {
    final $$DetectionsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.detectionId,
      referencedTable: $db.detections,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$DetectionsTableAnnotationComposer(
            $db: $db,
            $table: $db.detections,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$DetectionLabelsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $DetectionLabelsTable,
          DetectionLabel,
          $$DetectionLabelsTableFilterComposer,
          $$DetectionLabelsTableOrderingComposer,
          $$DetectionLabelsTableAnnotationComposer,
          $$DetectionLabelsTableCreateCompanionBuilder,
          $$DetectionLabelsTableUpdateCompanionBuilder,
          (DetectionLabel, $$DetectionLabelsTableReferences),
          DetectionLabel,
          PrefetchHooks Function({bool detectionId})
        > {
  $$DetectionLabelsTableTableManager(
    _$AppDatabase db,
    $DetectionLabelsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$DetectionLabelsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$DetectionLabelsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$DetectionLabelsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> detectionId = const Value.absent(),
                Value<String> label = const Value.absent(),
                Value<double> confidence = const Value.absent(),
                Value<bool> isPrimary = const Value.absent(),
              }) => DetectionLabelsCompanion(
                id: id,
                detectionId: detectionId,
                label: label,
                confidence: confidence,
                isPrimary: isPrimary,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String detectionId,
                required String label,
                Value<double> confidence = const Value.absent(),
                Value<bool> isPrimary = const Value.absent(),
              }) => DetectionLabelsCompanion.insert(
                id: id,
                detectionId: detectionId,
                label: label,
                confidence: confidence,
                isPrimary: isPrimary,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$DetectionLabelsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({detectionId = false}) {
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
                    if (detectionId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.detectionId,
                                referencedTable:
                                    $$DetectionLabelsTableReferences
                                        ._detectionIdTable(db),
                                referencedColumn:
                                    $$DetectionLabelsTableReferences
                                        ._detectionIdTable(db)
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

typedef $$DetectionLabelsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $DetectionLabelsTable,
      DetectionLabel,
      $$DetectionLabelsTableFilterComposer,
      $$DetectionLabelsTableOrderingComposer,
      $$DetectionLabelsTableAnnotationComposer,
      $$DetectionLabelsTableCreateCompanionBuilder,
      $$DetectionLabelsTableUpdateCompanionBuilder,
      (DetectionLabel, $$DetectionLabelsTableReferences),
      DetectionLabel,
      PrefetchHooks Function({bool detectionId})
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
  $$ScenesTableTableManager get scenes =>
      $$ScenesTableTableManager(_db, _db.scenes);
  $$DetectionsTableTableManager get detections =>
      $$DetectionsTableTableManager(_db, _db.detections);
  $$DetectionLabelsTableTableManager get detectionLabels =>
      $$DetectionLabelsTableTableManager(_db, _db.detectionLabels);
}
