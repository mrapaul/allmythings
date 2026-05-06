/// §11 — production log sink: appends structured JSONL events to a
/// per-day file under getApplicationDocumentsDirectory()/logs/.
///
/// No SaaS dependency. Files older than [retentionDays] are deleted at
/// app start so we don't accumulate logs forever on a phone with no
/// log-rotate cron.
///
/// Designed to be wired as a Logger root listener:
///
///   final sink = await FileLogSink.open();
///   Logger.root.onRecord.listen(sink.recordAdapter);
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:logging/logging.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// One JSONL log line.
class LogEvent {
  const LogEvent({
    required this.timestamp,
    required this.level,
    required this.logger,
    required this.message,
    this.fields = const <String, Object?>{},
  });

  final DateTime timestamp;
  final String level;
  final String logger;
  final String message;
  final Map<String, Object?> fields;

  Map<String, Object?> toJson() => <String, Object?>{
        'ts': timestamp.toUtc().toIso8601String(),
        'level': level,
        'logger': logger,
        'message': message,
        ...fields,
      };
}

/// Thin abstraction so tests can drop in an in-memory fake without
/// hitting the real filesystem.
abstract class LogSink {
  Future<void> write(LogEvent event);
  Future<void> close();
}

class FileLogSink implements LogSink {
  FileLogSink._({
    required this.directory,
    required this.retentionDays,
  });

  /// Directory where per-day log files live. Writeable on the device.
  final Directory directory;

  /// Files older than this many days are removed when [open] runs.
  final int retentionDays;

  IOSink? _currentSink;
  String? _currentDate;

  /// Open the sink for the active app session.
  ///
  /// Side effects:
  /// 1. Creates the logs directory if missing.
  /// 2. Rotates: deletes any *.jsonl older than [retentionDays] days.
  /// 3. Opens an append-mode IOSink for today's file.
  static Future<FileLogSink> open({int retentionDays = 7}) async {
    final docs = await getApplicationDocumentsDirectory();
    final logsDir = Directory(p.join(docs.path, 'logs'));
    if (!await logsDir.exists()) await logsDir.create(recursive: true);
    final sink = FileLogSink._(directory: logsDir, retentionDays: retentionDays);
    await sink._rotate();
    return sink;
  }

  /// Test-only constructor — bypass path_provider.
  static Future<FileLogSink> openIn(
    Directory dir, {
    int retentionDays = 7,
  }) async {
    if (!await dir.exists()) await dir.create(recursive: true);
    final sink = FileLogSink._(directory: dir, retentionDays: retentionDays);
    await sink._rotate();
    return sink;
  }

  @override
  Future<void> write(LogEvent event) async {
    final date = _dateKey(event.timestamp);
    if (date != _currentDate) {
      await _currentSink?.flush();
      await _currentSink?.close();
      final file = File(p.join(directory.path, '$date.jsonl'));
      _currentSink = file.openWrite(mode: FileMode.append);
      _currentDate = date;
    }
    _currentSink!.writeln(jsonEncode(event.toJson()));
  }

  /// Adapter for `Logger.root.onRecord.listen(...)`.
  void recordAdapter(LogRecord r) {
    final ev = LogEvent(
      timestamp: r.time,
      level: r.level.name,
      logger: r.loggerName,
      message: r.message,
      fields: <String, Object?>{
        if (r.error != null) 'error': r.error.toString(),
        if (r.stackTrace != null) 'stack': r.stackTrace.toString(),
      },
    );
    // Fire-and-forget; we never want logging to back-pressure the app.
    unawaited(write(ev));
  }

  @override
  Future<void> close() async {
    await _currentSink?.flush();
    await _currentSink?.close();
    _currentSink = null;
    _currentDate = null;
  }

  Future<void> _rotate() async {
    final cutoff = DateTime.now().subtract(Duration(days: retentionDays));
    await for (final entity in directory.list()) {
      if (entity is! File) continue;
      if (!entity.path.endsWith('.jsonl')) continue;
      final stat = await entity.stat();
      if (stat.modified.isBefore(cutoff)) {
        try {
          await entity.delete();
        } catch (_) {
          // Best-effort rotation; deleting one file failing must not
          // prevent the app from booting.
        }
      }
    }
  }

  static String _dateKey(DateTime t) {
    final u = t.toUtc();
    final mm = u.month.toString().padLeft(2, '0');
    final dd = u.day.toString().padLeft(2, '0');
    return '${u.year}-$mm-$dd';
  }
}
