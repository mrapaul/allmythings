import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const tDetection = Detection(
    id: '1',
    label: 'test',
    confidence: 0.9,
    boundingBox: BoundingBox(x: 0, y: 0, width: 0, height: 0),
    ensembleDetails: EnsembleDetails(
      providerAgreement: [],
      labelConsensus: false,
      confidenceByProvider: {},
    ),
    alternativeLabels: [],
  );

  test('should convert to and from json', () {
    final detectionJson = <String, dynamic>{
      'id': '1',
      'label': 'test',
      'confidence': 0.9,
      'boundingBox': {
        'x': 0.0,
        'y': 0.0,
        'width': 0.0,
        'height': 0.0,
      },
      'ensembleDetails': {
        'providerAgreement': [],
        'labelConsensus': false,
        'confidenceByProvider': <String, dynamic>{},
      },
      'alternativeLabels': [],
      'createdAt': null,
      'updatedAt': null,
    };

    final fromJson = Detection.fromJson(detectionJson);
    expect(fromJson.toJson(), detectionJson);
  });
}
