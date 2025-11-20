import 'package:all_my_things/domain/models/detection.dart';
import 'package:json_annotation/json_annotation.dart';

class DetectionConverter
    implements JsonConverter<Detection, Map<String, dynamic>> {
  const DetectionConverter();

  @override
  Detection fromJson(Map<String, dynamic> json) => Detection.fromJson(json);

  @override
  Map<String, dynamic> toJson(Detection object) => object.toJson();
}
