// Section-08 phase-6 lint: no surviving CoreML / on-device-detector
// code. Section-10 (Temporal cleanup) reads this test as a precondition;
// when it fails, no client speaks the legacy on-device-detection contract
// anymore so the legacy schemas can be deleted.
//
// We scan Dart, Swift, Kotlin, Java, and Objective-C source under
// mobile-app/ for forbidden patterns. Comment lines are ignored — the
// existing "CoreML is gone (section-08)" docstrings are tombstones, not
// active code.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

const _forbiddenPatterns = <RegExp>[
  // Identifier references — would only appear in active code.
  // Word-bounded so "CoreMLDetector" matches but the literal text
  // "CoreML is gone" inside a // comment would, and is filtered below.
  // (Filter handles the comment case; this regex catches active refs.)
  // Note: case-insensitive to catch CoreML / CoreMl / coreML.
  // ignore: prefer_interpolation_to_compose_strings
];

const _hardForbidden = <String>[
  'CoreMLDetector',
  'OnDeviceDetector',
  'fastBoxes',
];

const _channelForbidden = <String>[
  'MethodChannel("coreml',
  "MethodChannel('coreml",
  'MethodChannel(@"coreml',
];

bool _isCommentLine(String line, String ext) {
  final t = line.trimLeft();
  if (t.isEmpty) return true;
  switch (ext) {
    case '.dart':
    case '.swift':
    case '.kt':
    case '.java':
    case '.m':
    case '.h':
      // // line comments and /// doc comments → comment.
      return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
    default:
      return false;
  }
}

Iterable<File> _walk(Directory root, Set<String> exts) sync* {
  final stack = <Directory>[root];
  while (stack.isNotEmpty) {
    final dir = stack.removeLast();
    for (final entry in dir.listSync(followLinks: false)) {
      final base = p.basename(entry.path);
      // Skip build / generated / cache dirs that often have third-party
      // sources we don't own.
      if (entry is Directory) {
        if (base == 'build' ||
            base == '.dart_tool' ||
            base == 'Pods' ||
            base == '.gradle' ||
            base == 'ephemeral' ||
            base == 'Generated' ||
            base == 'DerivedData') {
          continue;
        }
        stack.add(entry);
      } else if (entry is File) {
        final ext = p.extension(base).toLowerCase();
        if (exts.contains(ext)) {
          // Skip generated freezed/json/drift artifacts — they reflect
          // wire types only, never CoreML.
          if (base.endsWith('.freezed.dart') ||
              base.endsWith('.g.dart') ||
              base.endsWith('.drift.dart') ||
              base.endsWith('.mocks.dart')) {
            continue;
          }
          yield entry;
        }
      }
    }
  }
}

void main() {
  test('no surviving CoreML / on-device-detector references in mobile sources',
      () {
    final root = Directory.current;
    // We expect the working directory to be mobile-app/ when invoked
    // via `flutter test`.
    final targets = <String>['lib', 'ios', 'android'];
    final exts = <String>{'.dart', '.swift', '.kt', '.java', '.m', '.h'};

    final hits = <String>[];

    for (final target in targets) {
      final d = Directory(p.join(root.path, target));
      if (!d.existsSync()) continue;
      for (final file in _walk(d, exts)) {
        // Skip the phase-gate test itself (this file references the
        // forbidden patterns by literal so we can detect them).
        if (p.equals(file.path, Platform.script.toFilePath()) ||
            file.path.endsWith('phase_gate_test.dart')) {
          continue;
        }
        final ext = p.extension(file.path).toLowerCase();
        final lines = file.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          final line = lines[i];
          if (_isCommentLine(line, ext)) continue;

          for (final pat in _hardForbidden) {
            if (line.contains(pat)) {
              hits.add('${file.path}:${i + 1}: $pat → $line');
            }
          }
          for (final pat in _channelForbidden) {
            if (line.contains(pat)) {
              hits.add(
                '${file.path}:${i + 1}: $pat → $line',
              );
            }
          }
        }
      }
    }

    expect(
      hits,
      isEmpty,
      reason:
          'Forbidden CoreML / on-device-detector references survived '
          'the section-08 deletion:\n${hits.join('\n')}',
    );
  });
}
