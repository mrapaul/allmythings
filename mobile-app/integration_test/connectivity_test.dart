import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Automated Workflow Guarantee: ai_interior.png', () {
    testWidgets('Verify API Connectivity and High-Res Inference', (tester) async {
      debugPrint('--- STARTING AUTOMATED VERIFICATION ---');
      
      // Use loopback for verification
      const testUrl = 'http://localhost:14000';
      debugPrint('Targeting Test URL: $testUrl');

      // 1. Prepare the high-res asset in the sandbox
      debugPrint('Step 1: Preparing ai_interior.png asset...');
      final byteData = await rootBundle.load('assets/test_images/ai_interior.png');
      final directory = await getApplicationDocumentsDirectory();
      final file = File('${directory.path}/test_inference.png');
      await file.parent.create(recursive: true);
      await file.writeAsBytes(
        byteData.buffer.asUint8List(byteData.offsetInBytes, byteData.lengthInBytes),
        flush: true,
      );
      debugPrint('Asset ready at: ${file.path}');

      // 2. Initialize DIO directly to see exactly where it goes
      final dio = Dio(BaseOptions(
        baseUrl: testUrl,
        connectTimeout: const Duration(seconds: 10),
      ));
      
      dio.interceptors.add(LogInterceptor(
        responseBody: true,
        logPrint: (obj) => debugPrint('DIO_LOG: $obj'),
      ));

      // 3. Execute Detection manually to guarantee parameters
      debugPrint('Step 2: Executing Multi-VLM Inference...');
      
      try {
        final formData = FormData.fromMap({
          'file': await MultipartFile.fromFile(file.path),
        });

        final response = await dio.post<Map<String, dynamic>>('/v1/detect', data: formData);

        debugPrint('--- VERIFICATION SUCCESSFUL ---');
        debugPrint('Status: ${response.statusCode}');
        final data = response.data;
        if (data != null) {
          debugPrint('Items: ${(data['detections'] as List).length}');
        }
        
        expect(response.statusCode, 200);
      } catch (e) {
        debugPrint('--- VERIFICATION FAILED ---');
        debugPrint('Error Detail: $e');
        fail('Detection failed: $e');
      }
    });
   group('Cleanup', () {
      testWidgets('Reset App Router to standard state', (tester) async {
        // Just a placeholder to ensure we can run a cleanup pass if needed
      });
    });
  });
}
