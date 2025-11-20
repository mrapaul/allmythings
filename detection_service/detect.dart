import 'dart:convert';
import 'dart:io';
import 'package:google_generative_ai/google_generative_ai.dart';
import 'package:http/http.dart' as http;

void main(List<String> arguments) async {
  if (arguments.isEmpty) {
    print('Please provide an image URL.');
    return;
  }

  final imageUrl = arguments[0];
  final apiKey = Platform.environment['GEMINI_API_KEY'];

  if (apiKey == null) {
    print('GEMINI_API_KEY environment variable not set.');
    return;
  }

  final model = GenerativeModel(model: 'gemini-pro-vision', apiKey: apiKey);

  try {
    final imageResponse = await http.get(Uri.parse(imageUrl));
    if (imageResponse.statusCode == 200) {
      final imageBytes = imageResponse.bodyBytes;
      final prompt = TextPart(
          "Detect all prominent objects in this image. For each object, provide its name and bounding box coordinates in the format [ymin, xmin, ymax, xmax]. The coordinates should be normalized (0 to 1). Return the output as a single JSON array of objects, where each object has 'name' and 'box' keys. Example: [{\"name\": \"cat\", \"box\": [0.1, 0.2, 0.3, 0.4]}, {\"name\": \"dog\", \"box\": [0.5, 0.6, 0.7, 0.8]}]");
      final imagePart = DataPart('image/jpeg', imageBytes);

      final response = await model.generateContent([
        Content.multi([prompt, imagePart])
      ]);

      print('Detection results:');
      print(response.text);
    } else {
      print('Failed to download image');
    }
  } catch (e) {
    print('Error processing image: $e');
  }
}
