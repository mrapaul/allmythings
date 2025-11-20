import 'dart:io';
import 'dart:convert';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart';
import 'package:shelf_router/shelf_router.dart';

// Configure routes.
final _router = Router()
  ..get('/', _rootHandler)
  ..post('/detect', _detectHandler);

Response _rootHandler(Request req) {
  return Response.ok('Hello, World!\n');
}

Future<Response> _detectHandler(Request request) async {
  // Return a dummy detection response
  return Response.ok(jsonEncode({
    "label": "dummy_object",
    "confidence": 0.85,
    "box": [0.1, 0.2, 0.3, 0.4]
  }));
}

void main(List<String> args) async {
  // Use any available host or container IP (usually `0.0.0.0`).
  final ip = InternetAddress.anyIPv4;

  // Configure a pipeline that logs requests.
  final handler = Pipeline().addMiddleware(logRequests()).addHandler(_router);

  // For running in containers, we respect the PORT environment variable.
  final port = int.parse(Platform.environment['PORT'] ?? '9100');
  final server = await serve(handler, ip, port);
  print('Server listening on port ${server.port}');
}
