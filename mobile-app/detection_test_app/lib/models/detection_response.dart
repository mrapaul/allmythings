import 'detection.dart';

class DetectionResponse {
  final List<Detection> detections;

  DetectionResponse({
    required this.detections,
  });

  factory DetectionResponse.fromJson(Map<String, dynamic> json) {
    return DetectionResponse(
      detections: (json['detections'] as List<dynamic>)
          .map((e) => Detection.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'detections': detections.map((e) => e.toJson()).toList(),
    };
  }
}