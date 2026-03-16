import 'dart:io';
import 'package:dio/dio.dart';

void main() async {
  print('--- NATIVE DART VERIFICATION: ai_interior.png ---');
  
  final dio = Dio(BaseOptions(
    baseUrl: 'http://127.0.0.1:14000',
    connectTimeout: const Duration(seconds: 10),
  ));

  final imageFile = File('/Users/mrarindampaul/Downloads/Images/ai_interior.png');
  if (!imageFile.existsSync()) {
    print('Error: Image not found at ${imageFile.absolute.path}');
    return;
  }

  print('Step 1: Sending high-res multipart request...');
  print('Target: http://localhost:14000/v1/detect');

  try {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(imageFile.path),
    });

    final stopwatch = Stopwatch()..start();
    final response = await dio.post<Map<String, dynamic>>('/v1/detect', data: formData);
    stopwatch.stop();

    print('--- VERIFICATION SUCCESSFUL ---');
    print('Latency: ${stopwatch.elapsedMilliseconds}ms');
    print('Status: ${response.statusCode}');
    
    final data = response.data;
    if (data != null) {
      final detections = data['detections'] as List;
      print('Items Identified: ${detections.length}');
      
      print('\nAll Detection Results:');
      for (var i = 0; i < detections.length; i++) {
        final d = detections[i] as Map<String, dynamic>;
        print('- ${d['label']} (${d['category']}) [Conf: ${d['confidence']}]');
      }
    }

  } catch (e) {
    print('--- VERIFICATION FAILED ---');
    if (e is DioException) {
      print('Dio Error: ${e.message}');
      print('Response: ${e.response?.data}');
    } else {
      print('General Error: $e');
    }
  }
}
