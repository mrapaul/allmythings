import 'package:detection_test_app/models/vision_provider.dart';
import 'package:json_annotation/json_annotation.dart';

class VisionProviderConverter implements JsonConverter<VisionProvider, String> {
  const VisionProviderConverter();

  @override
  VisionProvider fromJson(String json) {
    return VisionProvider.values.firstWhere(
      (e) => e.toString().split('.').last == json,
    );
  }

  @override
  String toJson(VisionProvider object) {
    return object.toString().split('.').last;
  }
}
