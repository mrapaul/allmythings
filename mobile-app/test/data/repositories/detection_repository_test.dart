/*
import 'dart:io';

import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/domain/models/detection_response.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:all_my_things/domain/models/ensemble_metrics.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fpdart/fpdart.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

import 'detection_repository_test.mocks.dart';

@GenerateMocks([ApiClient, Dio])
void main() {
  late DetectionRepository repository;
  late MockApiClient mockApiClient;
  late MockDio mockDio;

  setUp(() {
    mockApiClient = MockApiClient();
    mockDio = MockDio();
    repository = DetectionRepository(mockApiClient);
  });

  final tImageFile = File('test/fixtures/image.jpg');
  const tEnsembleMetrics = EnsembleMetrics(
    providersUsed: 1,
    averageConfidence: 0.9,
    consensusRate: 1.0,
  );
  const tDetectionResponse = DetectionResponse(
    success: true,
    ensembleMode: 'full',
    processingTimeMs: 100,
    detections: [
      Detection(
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
      ),
    ],
    providerResults: [],
    ensembleMetrics: tEnsembleMetrics,
  );

  test(
    'should return DetectionResponse when the call to api client is successful',
    () async {
      // arrange
      when(mockApiClient.dio).thenReturn(mockDio);
      when(mockDio.post(any, data: anyNamed('data'))).thenAnswer(
        (_) async => Response(
          requestOptions: RequestOptions(path: ''),
          data: tDetectionResponse.toJson(),
          statusCode: 200,
        ),
      );
      // act
      final result = await repository.detectObjects(tImageFile);
      // assert
      expect(result, isA<Right>());
    },
  );

  test(
    'should return a Failure when the call to api client is unsuccessful',
    () async {
      // arrange
      when(mockApiClient.dio).thenReturn(mockDio);
      when(mockDio.post(any, data: anyNamed('data'))).thenThrow(
        DioException(
          requestOptions: RequestOptions(path: ''),
          response: Response(
            requestOptions: RequestOptions(path: ''),
            data: 'Something went wrong',
            statusCode: 404,
          ),
        ),
      );
      // act
      final result = await repository.detectObjects(tImageFile);
      // assert
      expect(result, isA<Left>());
    },
  );
}
*/
