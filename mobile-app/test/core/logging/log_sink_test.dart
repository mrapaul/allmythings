import 'dart:convert';
import 'dart:io';

import 'package:all_my_things/core/logging/log_sink.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';
import 'package:path/path.dart' as p;

void main() {
  late Directory tmp;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('log_sink_test_');
  });

  tearDown(() async {
    if (await tmp.exists()) await tmp.delete(recursive: true);
  });

  test('write appends one JSONL line per event', () async {
    final sink = await FileLogSink.openIn(tmp);
    await sink.write(LogEvent(
      timestamp: DateTime.utc(2026, 5, 1, 12),
      level: 'INFO',
      logger: 'test',
      message: 'hello',
    ));
    await sink.write(LogEvent(
      timestamp: DateTime.utc(2026, 5, 1, 12, 0, 1),
      level: 'WARNING',
      logger: 'test',
      message: 'careful',
      fields: const <String, Object?>{'requestId': 'abc'},
    ));
    await sink.close();

    final file = File(p.join(tmp.path, '2026-05-01.jsonl'));
    expect(await file.exists(), isTrue);
    final lines =
        (await file.readAsString()).trim().split('\n').where((l) => l.isNotEmpty).toList();
    expect(lines, hasLength(2));
    final first = jsonDecode(lines[0]) as Map<String, Object?>;
    expect(first['level'], 'INFO');
    expect(first['logger'], 'test');
    expect(first['message'], 'hello');
    final second = jsonDecode(lines[1]) as Map<String, Object?>;
    expect(second['requestId'], 'abc');
  });

  test('rotates files older than retentionDays at open()', () async {
    // Pre-populate two stale files. setLastModified() is the canonical way
    // to age a file in Dart; sub-second precision differs across platforms
    // but day-granular comparisons are fine here.
    final stale = File(p.join(tmp.path, '2025-01-01.jsonl'));
    await stale.writeAsString('{"old":true}\n');
    await stale.setLastModified(DateTime.now().subtract(const Duration(days: 30)));

    final fresh = File(p.join(tmp.path, '2026-04-30.jsonl'));
    await fresh.writeAsString('{"recent":true}\n');
    await fresh.setLastModified(DateTime.now().subtract(const Duration(days: 1)));

    final sink = await FileLogSink.openIn(tmp, retentionDays: 7);
    await sink.close();

    expect(await stale.exists(), isFalse, reason: 'stale file should be rotated');
    expect(await fresh.exists(), isTrue, reason: 'fresh file should be kept');
  });

  test('recordAdapter writes Logger records', () async {
    final sink = await FileLogSink.openIn(tmp);
    final logger = Logger('logger.test');
    final sub = logger.onRecord.listen(sink.recordAdapter);
    logger.info('event1');
    // Allow the unawaited write microtask to flush.
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await sub.cancel();
    await sink.close();

    final today = DateTime.now().toUtc();
    final mm = today.month.toString().padLeft(2, '0');
    final dd = today.day.toString().padLeft(2, '0');
    final file = File(p.join(tmp.path, '${today.year}-$mm-$dd.jsonl'));
    expect(await file.exists(), isTrue);
    final body = (await file.readAsString()).trim();
    expect(body, contains('event1'));
    final json = jsonDecode(body.split('\n').first) as Map<String, Object?>;
    expect(json['logger'], 'logger.test');
    expect(json['level'], 'INFO');
  });

  test('rolls over when timestamp crosses to a new UTC day', () async {
    final sink = await FileLogSink.openIn(tmp);
    await sink.write(LogEvent(
      timestamp: DateTime.utc(2026, 5, 1, 23, 59),
      level: 'INFO',
      logger: 'rollover',
      message: 'before',
    ));
    await sink.write(LogEvent(
      timestamp: DateTime.utc(2026, 5, 2, 0, 0, 5),
      level: 'INFO',
      logger: 'rollover',
      message: 'after',
    ));
    await sink.close();

    final day1 = File(p.join(tmp.path, '2026-05-01.jsonl'));
    final day2 = File(p.join(tmp.path, '2026-05-02.jsonl'));
    expect(await day1.exists(), isTrue);
    expect(await day2.exists(), isTrue);
    expect((await day1.readAsString()).contains('before'), isTrue);
    expect((await day2.readAsString()).contains('after'), isTrue);
  });
}
