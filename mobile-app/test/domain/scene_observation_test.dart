// SceneObservation Freezed model — wire contract that mirrors §5.1 of
// claude-plan.md (the Python types in pipeline_service/types.py are the
// canonical reference).
//
// Tests focus on JSON parse-roundtrip + the empty-attributes case that
// item_detail must render without crashing.
import 'dart:convert';

import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SceneObservation.fromJson', () {
    test('parses canonical wire shape from pipeline-service', () {
      final json = jsonDecode('''
{
  "sceneId": "scene-abc",
  "runId": "run-1",
  "frameIds": ["f0", "f1", "f2"],
  "detections": [
    {
      "id": "det-1",
      "bbox": {"x": 10, "y": 20, "width": 100, "height": 80},
      "primaryLabel": "chair",
      "alternateLabels": [{"label": "armchair", "confidence": 0.7}],
      "vlmStructuredAttributes": {"color": "blue"},
      "agreementScore": 3.0,
      "contributingSignals": [
        {"detector": "florence", "frameId": "f0", "rawConfidence": 0.85}
      ],
      "confidence": 0.91
    }
  ],
  "agreementCoverage": 0.8,
  "agreementPrecision": 0.5,
  "selfDiagnosisTriggered": false,
  "rerunDepth": 0,
  "flagged": false,
  "processingMs": 1200,
  "errors": [],
  "tileErrors": []
}
''') as Map<String, dynamic>;

      final obs = SceneObservation.fromJson(json);

      expect(obs.sceneId, 'scene-abc');
      expect(obs.runId, 'run-1');
      expect(obs.frameIds, ['f0', 'f1', 'f2']);
      expect(obs.detections, hasLength(1));
      expect(obs.detections.first.primaryLabel, 'chair');
      expect(obs.detections.first.bbox.width, 100);
      expect(obs.detections.first.alternateLabels.first.label, 'armchair');
      expect(
        obs.detections.first.vlmStructuredAttributes['color'],
        'blue',
      );
      expect(obs.detections.first.contributingSignals.first.detector,
          'florence');
      expect(obs.agreementCoverage, 0.8);
      expect(obs.processingMs, 1200);
      expect(obs.flagged, false);
      expect(obs.flagReason, isNull);
    });

    test('handles empty vlmStructuredAttributes (the §3.12 fall-through case)',
        () {
      // The new pipeline allows {} when classification_refine cascades
      // through all VLM tiers without producing structured attributes.
      // The mobile MUST render this without crashing.
      final json = jsonDecode('''
{
  "sceneId": "s",
  "runId": "r",
  "frameIds": [],
  "detections": [
    {
      "id": "d",
      "bbox": {"x": 0, "y": 0, "width": 1, "height": 1},
      "primaryLabel": "thing",
      "alternateLabels": [],
      "vlmStructuredAttributes": {},
      "agreementScore": 0,
      "contributingSignals": [],
      "confidence": 0
    }
  ],
  "agreementCoverage": 0,
  "agreementPrecision": 0,
  "selfDiagnosisTriggered": false,
  "rerunDepth": 0,
  "flagged": false,
  "processingMs": 0,
  "errors": [],
  "tileErrors": []
}
''') as Map<String, dynamic>;

      final obs = SceneObservation.fromJson(json);
      expect(obs.detections.first.vlmStructuredAttributes, isEmpty);
    });

    test('preserves flag info when self_diagnosis fires', () {
      final json = jsonDecode('''
{
  "sceneId": "s",
  "runId": "r",
  "frameIds": [],
  "detections": [],
  "agreementCoverage": 0,
  "agreementPrecision": 0,
  "selfDiagnosisTriggered": true,
  "rerunDepth": 1,
  "flagged": true,
  "flagReason": "empty_detection_set",
  "processingMs": 100,
  "errors": [{"op": "x", "code": "y", "message": "z"}],
  "tileErrors": []
}
''') as Map<String, dynamic>;

      final obs = SceneObservation.fromJson(json);
      expect(obs.flagged, true);
      expect(obs.flagReason, 'empty_detection_set');
      expect(obs.selfDiagnosisTriggered, true);
      expect(obs.rerunDepth, 1);
      expect(obs.errors, hasLength(1));
      expect(obs.errors.first.op, 'x');
    });

    test('roundtrip: toJson(fromJson(x)) == x', () {
      final original = <String, dynamic>{
        'sceneId': 'rt',
        'runId': 'rt-run',
        'frameIds': ['a', 'b', 'c'],
        'detections': [],
        'agreementCoverage': 0.42,
        'agreementPrecision': 0.21,
        'selfDiagnosisTriggered': false,
        'rerunDepth': 0,
        'flagged': false,
        'processingMs': 999,
        'errors': [],
        'tileErrors': [],
      };
      final obs = SceneObservation.fromJson(original);
      final back = obs.toJson();
      expect(back['sceneId'], original['sceneId']);
      expect(back['agreementCoverage'], original['agreementCoverage']);
      expect(back['frameIds'], original['frameIds']);
    });
  });

  group('PipelineDetection optional fields', () {
    test('handles missing maskRleB64 / cropEmbeddingB64', () {
      final json = jsonDecode('''
{
  "id": "d",
  "bbox": {"x": 0, "y": 0, "width": 10, "height": 10},
  "primaryLabel": "x",
  "alternateLabels": [],
  "vlmStructuredAttributes": {},
  "agreementScore": 0,
  "contributingSignals": [],
  "confidence": 0
}
''') as Map<String, dynamic>;
      final det = PipelineDetection.fromJson(json);
      expect(det.maskRleB64, isNull);
      expect(det.cropEmbeddingB64, isNull);
    });
  });
}
