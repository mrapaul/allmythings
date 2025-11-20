import 'package:all_my_things/core/converters/vision_provider_converter.dart';
import 'package:all_my_things/domain/models/vision_provider.dart';
import 'package:json_annotation/json_annotation.dart';

class VisionProviderMapConverter
    implements
        JsonConverter<Map<VisionProvider, double>, Map<String, dynamic>> {
  const VisionProviderMapConverter();

  @override
  Map<VisionProvider, double> fromJson(Map<String, dynamic> json) {
    final map = <VisionProvider, double>{};
    json.forEach((key, value) {
      map[const VisionProviderConverter().fromJson(key)] = value as double;
    });
    return map;
  }

  @override
  Map<String, dynamic> toJson(Map<VisionProvider, double> object) {
    final map = <String, dynamic>{};
    object.forEach((key, value) {
      map[const VisionProviderConverter().toJson(key)] = value;
    });
    return map;
  }
}
