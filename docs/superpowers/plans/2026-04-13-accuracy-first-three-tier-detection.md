# Accuracy-First Three-Tier Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix total iPhone detection failure and achieve comprehensive, attribute-rich detection via Ollama+MLX on Mac as primary VLM, with CoreML on-device as instant offline fast pass.

**Architecture:** Three tiers: (1) CoreML on-device YOLO11n gives instant bounding boxes on the iPhone Neural Engine; (2) Mac deep pass via Bonjour auto-discovery runs YOLOE+SAHI 3×3 tiling then Qwen2.5-VL:7b via Ollama for rich attributes; (3) Gemini cloud fires only if Mac is unreachable. Root cause of current failure: `AppConfig.apiBaseUrl` returns `http://localhost:14000` on physical iPhone, which resolves to the phone not the Mac.

**Tech Stack:** Flutter/Dart, Swift (CoreML, NetServiceBrowser), Python/FastAPI, Node.js/Fastify/TypeScript, `bonjour-service` npm package, Ollama + `qwen2.5-vl:7b`, CoreML/Vision framework

---

## File Map

**New files to create:**
- `mobile-app/ios/Runner/CoreMLDetector.swift` — YOLO11n inference via VNCoreMLRequest
- `mobile-app/ios/Runner/MacServerDiscovery.swift` — mDNS Bonjour resolution via NetServiceBrowser
- `mobile-app/lib/native/coreml_detector.dart` — Dart MethodChannel wrapper for CoreMLDetector
- `mobile-app/lib/native/mac_server_discovery.dart` — Dart MethodChannel wrapper for MacServerDiscovery
- `scripts/convert_yolo_to_coreml.py` — one-time conversion of yolo11n.pt → yolo11n.mlpackage

**Files to modify:**
- `mobile-app/ios/Runner/AppDelegate.swift` — register both native channels
- `mobile-app/ios/Runner/Info.plist` — add NSLocalNetworkUsageDescription + NSBonjourServices
- `mobile-app/lib/core/config/app_config.dart` — replace hardcoded localhost with mDNS resolution
- `mobile-app/lib/main.dart` — await AppConfig.initialize() before runApp
- `mobile-app/lib/application/state/detection_state.dart` — add isEnriching field to DetectionSuccess
- `mobile-app/lib/application/providers/detection_providers.dart` — three-tier flow in DetectionNotifier
- `api-service/src/config/env.config.ts` — enable Ollama by default, update model
- `api-service/src/app.ts` — add Bonjour advertisement on startup
- `api-service/src/services/multi-pass-vlm.classifier.ts` — Ollama primary, Gemini fallback
- `api-service/src/providers/ollama.classifier.ts` — rich attribute prompts
- `detection-service/src/detection_service/config.py` — SAHI 3×3, overlap 0.3

---

## Phase 1: Fix iPhone Connectivity (Critical Path — Do This First)

---

### Task 1: Add Bonjour Advertisement to API Service

The Mac must advertise itself by name so the iPhone can find it without a hardcoded IP. After this task, running `make dev-api` advertises `allmythings-server` on the local network.

**Files:**
- Modify: `api-service/package.json`
- Modify: `api-service/src/app.ts`

- [ ] **Step 1: Install bonjour-service**

```bash
cd api-service
npm install bonjour-service
npm install --save-dev @types/bonjour
```

Expected: `package.json` updated with `"bonjour-service"` in dependencies.

- [ ] **Step 2: Write a test verifying Bonjour starts without throwing**

Create `api-service/__tests__/unit/bonjour.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Bonjour advertisement', () => {
  it('calls bonjour.publish with correct service config', async () => {
    const publishMock = vi.fn();
    const destroyMock = vi.fn();

    vi.mock('bonjour-service', () => ({
      default: vi.fn().mockImplementation(() => ({
        publish: publishMock,
        destroy: destroyMock,
      })),
    }));

    const { advertiseService } = await import('../../src/utils/bonjour-advertiser');
    const stop = advertiseService(14000);

    expect(publishMock).toHaveBeenCalledWith({
      name: 'allmythings-server',
      type: 'http',
      port: 14000,
    });

    stop();
    expect(destroyMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd api-service
npm test -- bonjour.test.ts
```

Expected: FAIL — `Cannot find module '../../src/utils/bonjour-advertiser'`

- [ ] **Step 4: Create the advertiser utility**

Create `api-service/src/utils/bonjour-advertiser.ts`:

```typescript
import Bonjour from 'bonjour-service';

export function advertiseService(port: number): () => void {
  const bonjour = new Bonjour();
  bonjour.publish({ name: 'allmythings-server', type: 'http', port });
  return () => bonjour.destroy();
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd api-service
npm test -- bonjour.test.ts
```

Expected: PASS

- [ ] **Step 6: Wire advertisement into app.ts start()**

In `api-service/src/app.ts`, update the `start()` function:

```typescript
import { advertiseService } from './utils/bonjour-advertiser';

async function start(): Promise<void> {
  try {
    const app = await buildApp();
    const address = await app.listen({ port: envConfig.port, host: '0.0.0.0' });
    logger.info({ address, port: envConfig.port, nodeEnv: envConfig.nodeEnv }, 'Server started');

    const stopBonjour = advertiseService(envConfig.port);
    logger.info({ name: 'allmythings-server', port: envConfig.port }, 'Bonjour advertisement started');

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down');
      stopBonjour();
      await app.close();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}
```

- [ ] **Step 7: Verify manually**

Start the API server, then run this on a different terminal:

```bash
dns-sd -B _http._tcp local
```

Expected: line containing `allmythings-server` appears within 2 seconds.

- [ ] **Step 8: Commit**

```bash
cd api-service
git add package.json package-lock.json src/utils/bonjour-advertiser.ts src/app.ts __tests__/unit/bonjour.test.ts
git commit -m "feat(api-service): advertise service via Bonjour mDNS for iPhone auto-discovery"
```

---

### Task 2: Create MacServerDiscovery.swift

The iPhone needs a native Swift class that resolves `allmythings-server` via mDNS within 2 seconds, exposed to Flutter via a MethodChannel.

**Files:**
- Create: `mobile-app/ios/Runner/MacServerDiscovery.swift`

- [ ] **Step 1: Create the Swift class**

Create `mobile-app/ios/Runner/MacServerDiscovery.swift`:

```swift
import Foundation
import Flutter

class MacServerDiscovery: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private var browser: NetServiceBrowser?
    private var service: NetService?
    private var completion: ((String?) -> Void)?
    private var timer: Timer?
    private var channel: FlutterMethodChannel?

    static func register(messenger: FlutterBinaryMessenger) {
        let instance = MacServerDiscovery()
        let channel = FlutterMethodChannel(
            name: "com.allmythings/server_discovery",
            binaryMessenger: messenger
        )
        instance.channel = channel
        channel.setMethodCallHandler(instance.handle)
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "discover":
            let args = call.arguments as? [String: Any]
            let timeout = TimeInterval(args?["timeoutSeconds"] as? Int ?? 2)
            discover(timeout: timeout) { url in
                result(url)
            }
        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func discover(timeout: TimeInterval, completion: @escaping (String?) -> Void) {
        self.completion = completion

        timer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            self?.finish(url: nil)
        }

        browser = NetServiceBrowser()
        browser?.delegate = self
        browser?.searchForServices(ofType: "_http._tcp.", inDomain: "local.")
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        if service.name == "allmythings-server" {
            self.service = service
            service.delegate = self
            service.resolve(withTimeout: 5.0)
        }
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        guard let host = sender.hostName else {
            finish(url: nil)
            return
        }
        let url = "http://\(host):\(sender.port)"
        finish(url: url)
    }

    func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        finish(url: nil)
    }

    private func finish(url: String?) {
        timer?.invalidate()
        timer = nil
        browser?.stop()
        browser = nil
        let c = completion
        completion = nil
        DispatchQueue.main.async { c?(url) }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile-app/ios/Runner/MacServerDiscovery.swift
git commit -m "feat(ios): MacServerDiscovery Swift class for Bonjour mDNS resolution"
```

---

### Task 3: Create CoreMLDetector.swift

Runs YOLO11n.mlpackage on the iPhone Neural Engine, exposed to Flutter via MethodChannel. Confidence threshold 0.3 (wide net — VLM prunes false positives).

**Files:**
- Create: `mobile-app/ios/Runner/CoreMLDetector.swift`

- [ ] **Step 1: Create the Swift class**

Create `mobile-app/ios/Runner/CoreMLDetector.swift`:

```swift
import Foundation
import Flutter
import Vision
import CoreML
import UIKit

class CoreMLDetector: NSObject {

    static func register(messenger: FlutterBinaryMessenger) {
        let instance = CoreMLDetector()
        let channel = FlutterMethodChannel(
            name: "com.allmythings/coreml_detector",
            binaryMessenger: messenger
        )
        channel.setMethodCallHandler(instance.handle)
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "detect":
            guard let args = call.arguments as? [String: Any],
                  let imageData = (args["imageBytes"] as? FlutterStandardTypedData)?.data else {
                result(FlutterError(code: "INVALID_ARGS", message: "imageBytes required", details: nil))
                return
            }
            detect(imageData: imageData, result: result)
        case "isAvailable":
            result(modelURL() != nil)
        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func modelURL() -> URL? {
        Bundle.main.url(forResource: "yolo11n", withExtension: "mlpackage")
    }

    private func detect(imageData: Data, result: @escaping FlutterResult) {
        guard let image = UIImage(data: imageData),
              let cgImage = image.cgImage else {
            result(FlutterError(code: "INVALID_IMAGE", message: "Could not decode image", details: nil))
            return
        }

        guard let modelURL = modelURL() else {
            result(FlutterError(code: "MODEL_NOT_FOUND", message: "yolo11n.mlpackage not in bundle", details: nil))
            return
        }

        guard let mlModel = try? MLModel(contentsOf: modelURL, configuration: MLModelConfiguration()),
              let vnModel = try? VNCoreMLModel(for: mlModel) else {
            result(FlutterError(code: "MODEL_LOAD_ERROR", message: "Could not load CoreML model", details: nil))
            return
        }

        let request = VNCoreMLRequest(model: vnModel) { [weak self] request, error in
            if let error = error {
                result(FlutterError(code: "INFERENCE_ERROR", message: error.localizedDescription, details: nil))
                return
            }
            let detections = self?.mapObservations(request.results) ?? []
            result(detections)
        }
        request.imageCropAndScaleOption = .scaleFit

        DispatchQueue.global(qos: .userInitiated).async {
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                result(FlutterError(code: "HANDLER_ERROR", message: error.localizedDescription, details: nil))
            }
        }
    }

    private func mapObservations(_ results: [Any]?) -> [[String: Any]] {
        guard let observations = results as? [VNRecognizedObjectObservation] else { return [] }
        return observations
            .filter { $0.confidence >= 0.3 }
            .enumerated()
            .map { index, obs in
                let box = obs.boundingBox // normalized, origin bottom-left
                let label = obs.labels.first?.identifier ?? "object"
                return [
                    "label": label,
                    "confidence": Double(obs.confidence),
                    "box": [
                        Double(box.origin.x),
                        Double(1.0 - box.origin.y - box.size.height), // flip y: CoreML bottom-left → top-left
                        Double(box.size.width),
                        Double(box.size.height),
                    ],
                    "boxIndex": index,
                ] as [String: Any]
            }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile-app/ios/Runner/CoreMLDetector.swift
git commit -m "feat(ios): CoreMLDetector Swift class for on-device YOLO inference"
```

---

### Task 4: Register Both Channels in AppDelegate + Update Info.plist

**Files:**
- Modify: `mobile-app/ios/Runner/AppDelegate.swift`
- Modify: `mobile-app/ios/Runner/Info.plist`

- [ ] **Step 1: Update AppDelegate.swift**

Replace the entire contents of `mobile-app/ios/Runner/AppDelegate.swift`:

```swift
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {

    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)

        if let controller = window?.rootViewController as? FlutterViewController {
            let messenger = controller.binaryMessenger
            CoreMLDetector.register(messenger: messenger)
            MacServerDiscovery.register(messenger: messenger)
        }

        return result
    }

    func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
        GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    }
}
```

- [ ] **Step 2: Add local network permissions to Info.plist**

Open `mobile-app/ios/Runner/Info.plist` and add inside the top-level `<dict>`:

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Used to find the detection server on your local network for object detection.</string>
<key>NSBonjourServices</key>
<array>
    <string>_http._tcp</string>
</array>
```

- [ ] **Step 3: Verify the app still builds**

```bash
cd mobile-app
flutter build ios --simulator --no-codesign 2>&1 | tail -5
```

Expected: `Build complete.` (no Swift compilation errors)

- [ ] **Step 4: Commit**

```bash
git add mobile-app/ios/Runner/AppDelegate.swift mobile-app/ios/Runner/Info.plist
git commit -m "feat(ios): register CoreML and mDNS channels in AppDelegate, add local network entitlements"
```

---

### Task 5: Create Dart Native Channel Wrappers

**Files:**
- Create: `mobile-app/lib/native/mac_server_discovery.dart`
- Create: `mobile-app/lib/native/coreml_detector.dart`

- [ ] **Step 1: Create mac_server_discovery.dart**

Create `mobile-app/lib/native/mac_server_discovery.dart`:

```dart
import 'package:flutter/services.dart';

class MacServerDiscovery {
  static const _channel = MethodChannel('com.allmythings/server_discovery');

  /// Resolves the Mac API server on the local network via mDNS (Bonjour).
  /// Returns the base URL (e.g. "http://192.168.1.10:14000") or null if not found.
  static Future<String?> resolve({Duration timeout = const Duration(seconds: 2)}) async {
    try {
      final url = await _channel.invokeMethod<String>(
        'discover',
        {'timeoutSeconds': timeout.inSeconds},
      );
      return url;
    } on PlatformException {
      return null;
    }
  }
}
```

- [ ] **Step 2: Create coreml_detector.dart**

Create `mobile-app/lib/native/coreml_detector.dart`:

```dart
import 'dart:io';
import 'package:flutter/services.dart';

class CoreMLBox {
  const CoreMLBox({
    required this.label,
    required this.confidence,
    required this.boxIndex,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  final String label;
  final double confidence;
  final int boxIndex;
  final double x;
  final double y;
  final double width;
  final double height;
}

class CoreMLDetector {
  static const _channel = MethodChannel('com.allmythings/coreml_detector');

  /// Returns true if the CoreML model is bundled and available.
  static Future<bool> isAvailable() async {
    try {
      return await _channel.invokeMethod<bool>('isAvailable') ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// Run YOLO inference on [imageFile]. Returns detected boxes with coarse labels.
  /// Confidence threshold 0.3 — cast wide net, VLM prunes false positives.
  static Future<List<CoreMLBox>> detect(File imageFile) async {
    final bytes = await imageFile.readAsBytes();
    try {
      final raw = await _channel.invokeMethod<List<dynamic>>(
        'detect',
        {'imageBytes': bytes},
      );
      if (raw == null) return [];
      return raw.map((item) {
        final m = Map<String, dynamic>.from(item as Map);
        final box = (m['box'] as List<dynamic>).cast<double>();
        return CoreMLBox(
          label: m['label'] as String,
          confidence: (m['confidence'] as num).toDouble(),
          boxIndex: (m['boxIndex'] as num).toInt(),
          x: box[0],
          y: box[1],
          width: box[2],
          height: box[3],
        );
      }).toList();
    } on PlatformException {
      return [];
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile-app/lib/native/
git commit -m "feat(mobile): Dart platform channel wrappers for CoreML detector and mDNS discovery"
```

---

### Task 6: Update AppConfig to Use mDNS Resolution

**Files:**
- Modify: `mobile-app/lib/core/config/app_config.dart`
- Modify: `mobile-app/lib/main.dart`

- [ ] **Step 1: Replace AppConfig**

Replace the entire contents of `mobile-app/lib/core/config/app_config.dart`:

```dart
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:all_my_things/native/mac_server_discovery.dart';

/// Application configuration
class AppConfig {
  static String? _resolvedApiBaseUrl;

  /// Call once at app startup to resolve the Mac server URL via mDNS.
  /// Falls back to Gemini cloud endpoint if Mac is not found within 2 seconds.
  static Future<void> initialize() async {
    if (kIsWeb) {
      _resolvedApiBaseUrl = 'http://localhost:14000';
      return;
    }
    if (!kIsWeb) {
      try {
        if (Platform.isAndroid) {
          _resolvedApiBaseUrl = 'http://10.0.2.2:14000';
          return;
        }
        if (Platform.isIOS) {
          final discovered = await MacServerDiscovery.resolve(
            timeout: const Duration(seconds: 2),
          );
          _resolvedApiBaseUrl = discovered ?? 'http://localhost:14000';
          return;
        }
      } catch (_) {}
    }
    _resolvedApiBaseUrl = 'http://localhost:14000';
  }

  /// Resolved API base URL. Returns localhost fallback if initialize() hasn't run.
  static String get apiBaseUrl => _resolvedApiBaseUrl ?? 'http://localhost:14000';

  static const int apiTimeout = 30000; // 30 seconds (was 5 minutes — tiered timeouts used instead)

  static const String apiKey = String.fromEnvironment('API_KEY');

  static const String appName = 'Home Inventory';
  static const String apiPort = '14000';

  static const double minConfidence = 0.3; // Wide net: was 0.7
  static const int maxRetries = 3;

  static const int thumbnailSize = 300;
  static const int imageQuality = 85;
}
```

- [ ] **Step 2: Update main.dart to await AppConfig.initialize()**

Replace the entire contents of `mobile-app/lib/main.dart`:

```dart
import 'package:all_my_things/core/config/app_config.dart';
import 'package:all_my_things/presentation/routing/app_router.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.initialize();
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends ConsumerWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final goRouter = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'All My Things',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: goRouter,
    );
  }
}
```

- [ ] **Step 3: Verify the app builds on simulator**

```bash
cd mobile-app
flutter build ios --simulator --no-codesign 2>&1 | tail -5
```

Expected: `Build complete.`

- [ ] **Step 4: Test on physical iPhone — confirm it reaches the Mac**

With `make dev-api` running on the Mac, run the app on iPhone. Check the Mac API logs — you should see an incoming connection within 3 seconds of app start.

```bash
cd api-service
npm run dev 2>&1 | grep -i "incoming\|request\|connection"
```

- [ ] **Step 5: Commit**

```bash
git add mobile-app/lib/core/config/app_config.dart mobile-app/lib/main.dart
git commit -m "fix(mobile): replace hardcoded localhost with mDNS-based Mac server discovery"
```

---

## Phase 2: Promote Ollama to Primary VLM (Accuracy)

---

### Task 7: Enhance OllamaClassifier Prompts for Rich Attributes

Current prompts return only `label` and `category`. This task updates them to return brand, model, color, material, condition, and estimated value — the fields the mobile app already supports.

**Files:**
- Modify: `api-service/src/providers/ollama.classifier.ts`

- [ ] **Step 1: Write a failing test for the new prompt format**

Create `api-service/__tests__/unit/ollama-rich-prompts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaClassifier } from '../../src/providers/ollama.classifier';
import { envConfig } from '../../src/config/env.config';

describe('OllamaClassifier rich attribute prompts', () => {
  let classifier: OllamaClassifier;

  beforeEach(() => {
    classifier = new OllamaClassifier(envConfig);
  });

  it('maps VLM response with brand and condition to ClassifiedObject', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify([{
          box_index: 0,
          label: 'Eames Lounge Chair',
          category: 'furniture',
          brand: 'Herman Miller',
          model: '670',
          primary_color: 'black',
          material: 'leather',
          condition: 'good',
          estimated_value_low: 3000,
          estimated_value_high: 5000,
        }]),
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const detections = [{ box: { x: 0.1, y: 0.1, width: 0.3, height: 0.4 }, coarseLabel: 'chair', confidence: 0.9 }];
    const results = await classifier.classify(Buffer.from('fake'), detections);

    expect(results).toHaveLength(1);
    expect(results[0].brand).toBe('Herman Miller');
    expect(results[0].condition).toBe('good');
    expect(results[0].estimatedValue).toEqual({ low: 3000, high: 5000 });
    expect(results[0].colors).toContain('black');
    expect(results[0].materials).toContain('leather');
  });

  it('builds detection prompt requesting all attribute fields', () => {
    const detections = [{ box: { x: 0, y: 0, width: 0.5, height: 0.5 }, coarseLabel: 'lamp', confidence: 0.8 }];
    // Access via type cast to test private method behavior via classify
    const prompt = (classifier as any).buildDetectionPrompt(detections);
    expect(prompt).toContain('brand');
    expect(prompt).toContain('condition');
    expect(prompt).toContain('estimated_value_low');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd api-service
npm test -- ollama-rich-prompts.test.ts
```

Expected: FAIL — brand/condition assertions fail because prompts return minimal fields.

- [ ] **Step 3: Update OllamaClassifier**

Replace the `buildDetectionPrompt`, `buildFullImagePrompt`, and `mapToClassifiedObject` methods in `api-service/src/providers/ollama.classifier.ts`:

```typescript
  private buildDetectionPrompt(detections: BoundingBoxResult[]): string {
    const boxes = detections.map((d, i) => ({
      index: i,
      coarse_label: d.coarseLabel,
    }));
    return `You are analyzing a photo for a home inventory application. 
Objects detected at the following positions:
${JSON.stringify(boxes, null, 2)}

For each object, return a JSON array. Each element must have:
- "box_index": number (from the list above)
- "label": string (specific name, e.g. "Eames Lounge Chair" not "chair")
- "category": string (e.g. "furniture", "electronics", "kitchenware")
- "brand": string or null (brand name if visible or strongly inferrable)
- "model": string or null (model name or number if visible)
- "primary_color": string (dominant color)
- "material": string (primary material, e.g. "leather", "oak wood", "stainless steel")
- "condition": string — one of: "excellent", "good", "fair", "poor"
- "estimated_value_low": number or null (USD resale value low estimate)
- "estimated_value_high": number or null (USD resale value high estimate)

Be specific. "Eames Chair" is better than "chair". "iPhone 14 Pro" is better than "phone".
Return valid JSON array only. No markdown, no explanation.`;
  }

  private buildFullImagePrompt(): string {
    return `You are analyzing a photo for a home inventory application.
List every distinct object you can see, including small or background items.

Return a JSON array. Each element must have:
- "box_index": 0 (use 0 for all items in full-image mode)
- "label": string (specific name)
- "category": string
- "brand": string or null
- "model": string or null
- "primary_color": string
- "material": string
- "condition": string — one of: "excellent", "good", "fair", "poor"
- "estimated_value_low": number or null
- "estimated_value_high": number or null
- "bounding_box": {"x": 0, "y": 0, "width": 0, "height": 0} (normalized 0–1)

Be exhaustive and specific. Return valid JSON array only. No markdown.`;
  }

  private mapToClassifiedObject(item: any, detections: BoundingBoxResult[]): ClassifiedObject {
    const boxIndex = item.box_index ?? 0;
    const detection = detections[boxIndex];
    const label = item.label || detection?.coarseLabel || 'unknown';

    let boundingBox = detection?.box ?? { x: 0, y: 0, width: 0, height: 0 };
    if (item.bounding_box) {
      if (Array.isArray(item.bounding_box) && item.bounding_box.length === 4) {
        const [y1, x1, y2, x2] = item.bounding_box;
        boundingBox = {
          x: x1,
          y: y1,
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        };
      } else if (typeof item.bounding_box === 'object') {
        boundingBox = {
          x: item.bounding_box.x ?? 0,
          y: item.bounding_box.y ?? 0,
          width: item.bounding_box.width ?? item.bounding_box.w ?? 0,
          height: item.bounding_box.height ?? item.bounding_box.h ?? 0,
        };
      }
    }

    const estimatedValue =
      item.estimated_value_low != null && item.estimated_value_high != null
        ? { low: Number(item.estimated_value_low), high: Number(item.estimated_value_high) }
        : null;

    return {
      boxIndex,
      label: this.capitalize(label),
      category: item.category || 'household item',
      brand: item.brand || null,
      model: item.model || null,
      colors: item.primary_color ? [item.primary_color] : [],
      materials: item.material ? [item.material] : [],
      condition: item.condition || null,
      estimatedValue,
      description: null,
      confidence: item.confidence ?? (detection?.confidence || 0.8),
      boundingBox,
    };
  }
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd api-service
npm test -- ollama-rich-prompts.test.ts
```

Expected: PASS

- [ ] **Step 5: Add temperature: 0 to the classify() fetch call**

In `api-service/src/providers/ollama.classifier.ts`, find the `classify()` method's `fetch` call and add `options: { temperature: 0 }` to the JSON body:

```typescript
      body: JSON.stringify({
        model: this.ollamaModel,
        prompt,
        images: [image.toString('base64')],
        stream: false,
        options: { temperature: 0 }, // deterministic — no hallucinated creativity
      }),
```

- [ ] **Step 6: Run full API test suite to confirm no regressions**

```bash
cd api-service
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add api-service/src/providers/ollama.classifier.ts api-service/__tests__/unit/ollama-rich-prompts.test.ts
git commit -m "feat(api-service): Ollama rich attribute prompts — brand, model, color, material, condition, value"
```

---

### Task 8: Promote Ollama to Primary VLM, Gemini as Fallback

Currently `multi-pass-vlm.classifier.ts` tries Gemini first. This swaps the cascade: Ollama (local, free, accurate) runs first; Gemini fires only if Ollama is unreachable or below threshold.

**Files:**
- Modify: `api-service/src/services/multi-pass-vlm.classifier.ts`

- [ ] **Step 1: Write failing test**

Create `api-service/__tests__/unit/multi-pass-ollama-primary.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiPassVlmClassifier } from '../../src/services/multi-pass-vlm.classifier';
import { ObjectClassifier, ClassifiedObject } from '../../src/providers/classifier.interface';
import { envConfig } from '../../src/config/env.config';

const mockResult: ClassifiedObject[] = [
  { boxIndex: 0, label: 'Chair', category: 'furniture', brand: null, model: null,
    colors: [], materials: [], condition: 'good', estimatedValue: null, description: null,
    confidence: 0.9, boundingBox: { x: 0, y: 0, width: 0.5, height: 0.5 } },
];

function makeClassifier(name: string, results: ClassifiedObject[] = mockResult): ObjectClassifier {
  return {
    name,
    classify: vi.fn().mockResolvedValue(results),
    generateDetectionPrompt: vi.fn().mockResolvedValue('prompt'),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe('MultiPassVlmClassifier cascade order', () => {
  it('calls Ollama first when available', async () => {
    const ollama = makeClassifier('ollama');
    const gemini = makeClassifier('gemini');
    const classifier = new MultiPassVlmClassifier([ollama, gemini], {
      ...envConfig,
      multiPassRetryThreshold: 1,
    });

    const image = Buffer.from('fake-image');
    vi.mock('sharp', () => ({
      default: vi.fn().mockReturnValue({
        metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
        extract: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('crop')),
      }),
    }));

    await classifier.detect(image);

    expect(ollama.classify).toHaveBeenCalled();
    expect(gemini.classify).not.toHaveBeenCalled();
  });

  it('falls back to Gemini if Ollama returns zero results', async () => {
    const ollama = makeClassifier('ollama', []);
    const gemini = makeClassifier('gemini');
    const classifier = new MultiPassVlmClassifier([ollama, gemini], envConfig);

    await classifier.detect(Buffer.from('fake-image'));

    expect(gemini.classify).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd api-service
npm test -- multi-pass-ollama-primary.test.ts
```

Expected: FAIL — Gemini is still called as primary.

- [ ] **Step 3: Update MultiPassVlmClassifier cascade**

In `api-service/src/services/multi-pass-vlm.classifier.ts`, replace the `detect()` method:

```typescript
  async detect(image: Buffer): Promise<ClassifiedObject[]> {
    const metadata = await sharp(image).metadata();
    const imageWidth = metadata.width!;
    const imageHeight = metadata.height!;
    const overlap = this.config.multiPassQuadrantOverlap;

    const quadrants: Quadrant[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const crops = quadrants.map((q) => ({
      quadrant: q,
      ...cropQuadrant(q, imageWidth, imageHeight, overlap),
    }));

    const cropBuffers = await Promise.all(
      crops.map((c) =>
        sharp(image).extract({ left: c.x, top: c.y, width: c.width, height: c.height }).toBuffer(),
      ),
    );

    // Ollama is primary (local, free, runs on Mac via MLX)
    const primary = this.findClassifier('ollama') ?? this.findClassifier('gemini');
    if (primary) {
      try {
        const results = await this.runMultiPass(primary, image, cropBuffers, crops, imageWidth, imageHeight);
        if (results.length >= this.config.multiPassRetryThreshold) {
          return results;
        }
        logger.info(
          { count: results.length, threshold: this.config.multiPassRetryThreshold, primary: primary.name },
          'Below retry threshold, trying secondary classifier',
        );
        // Try the other primary as secondary supplement
        const secondary =
          primary.name === 'ollama'
            ? (this.findClassifier('gemini') ?? this.findClassifier('claude'))
            : this.findClassifier('claude');
        if (secondary) {
          const overviewRetry = await this.callClassifier(secondary, image);
          return deduplicateObjects([...results, ...overviewRetry]);
        }
        return results;
      } catch (error) {
        logger.warn({ error: (error as Error).message, primary: primary?.name }, 'Primary VLM failed, trying fallback');
      }
    }

    // Fallback: try remaining classifiers
    for (const classifier of this.classifiers) {
      if (classifier.name === primary?.name) continue;
      try {
        return await this.runMultiPass(classifier, image, cropBuffers, crops, imageWidth, imageHeight);
      } catch (error) {
        logger.warn({ provider: classifier.name, error: (error as Error).message }, 'Fallback VLM failed');
      }
    }

    return [];
  }
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd api-service
npm test -- multi-pass-ollama-primary.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
cd api-service
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add api-service/src/services/multi-pass-vlm.classifier.ts api-service/__tests__/unit/multi-pass-ollama-primary.test.ts
git commit -m "feat(api-service): promote Ollama to primary VLM, Gemini as fallback"
```

---

### Task 9: Enable Ollama by Default + Verify Ollama Setup

Currently `ollamaEnabled` defaults to `false` (requires `OLLAMA_ENABLED=true` env var). This makes it always-on when available, and ensures the correct model is configured.

**Files:**
- Modify: `api-service/src/config/env.config.ts`

- [ ] **Step 1: Update env.config.ts**

In `api-service/src/config/env.config.ts`, change the `ollamaEnabled` and `ollamaModel` lines:

```typescript
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5-vl:7b',
  ollamaEnabled: process.env.OLLAMA_ENABLED !== 'false', // enabled by default; set OLLAMA_ENABLED=false to disable
```

- [ ] **Step 2: Pull the Ollama model (one-time setup)**

Run this once on the Mac:

```bash
ollama pull qwen2.5-vl:7b
```

Expected: model downloads (~5GB). Verify with:

```bash
ollama list | grep qwen2.5-vl
```

Expected: `qwen2.5-vl:7b` appears in the list.

- [ ] **Step 3: Verify Ollama health endpoint**

```bash
curl http://localhost:11434/api/tags | python3 -m json.tool | grep qwen
```

Expected: JSON response containing `"qwen2.5-vl:7b"`.

- [ ] **Step 4: Run a smoke test against the running API**

With `make dev` running (both API service and detection service), and Ollama running:

```bash
curl -s -X POST http://localhost:14000/v1/health | python3 -m json.tool
```

Expected: JSON with provider statuses. `ollama` should show `"healthy": true`.

- [ ] **Step 5: Commit**

```bash
git add api-service/src/config/env.config.ts
git commit -m "feat(api-service): enable Ollama by default with qwen2.5-vl:7b"
```

---

## Phase 3: SAHI Accuracy Tuning

---

### Task 10: Upgrade SAHI to 3×3 Grid with Increased Overlap

More tiles → more objects detected, especially small/background items. This is a config-only change.

**Files:**
- Modify: `detection-service/src/detection_service/config.py`

- [ ] **Step 1: Write failing test for 3×3 tile count**

In `detection-service/tests/unit/test_sahi.py`, add:

```python
def test_grid_generates_ten_tiles_for_3x3():
    """3×3 grid + full image = 10 tiles."""
    from detection_service.config import Settings
    settings = Settings(sahi_grid_cols=3, sahi_grid_rows=3)
    # Import generate_tiles from sahi module
    from detection_service.sahi import generate_tiles
    tiles = generate_tiles(width=1024, height=768, settings=settings)
    assert len(tiles) == 10  # 9 grid tiles + 1 full image
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd detection-service
python -m pytest tests/unit/test_sahi.py::test_grid_generates_ten_tiles_for_3x3 -v
```

Expected: FAIL — currently generates 5 tiles (2×2 + full).

- [ ] **Step 3: Update config defaults**

In `detection-service/src/detection_service/config.py`, update the YOLOE section:

```python
    # YOLOE
    yoloe_model: str = "yolo11n.pt"
    yoloe_prompt: str = "object . item . thing"
    yoloe_confidence: float = 0.15
    sahi_grid_cols: int = 3       # was 2 — 3×3 catches more small objects
    sahi_grid_rows: int = 3       # was 2
    sahi_overlap: float = 0.3     # was 0.2 — objects at tile edges never missed
    sahi_nms_threshold: float = 0.5
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd detection-service
python -m pytest tests/unit/test_sahi.py::test_grid_generates_ten_tiles_for_3x3 -v
```

Expected: PASS

- [ ] **Step 5: Run full detection service test suite**

```bash
cd detection-service
python -m pytest tests/ -v
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add detection-service/src/detection_service/config.py detection-service/tests/unit/test_sahi.py
git commit -m "feat(detection-service): SAHI 3x3 grid with 0.3 overlap for higher object coverage"
```

---

## Phase 4: CoreML On-Device Fast Pass

---

### Task 11: Convert YOLO11n to CoreML

One-time conversion of `yolo11n.pt` to `yolo11n.mlpackage` for bundling in the iOS app.

**Files:**
- Create: `scripts/convert_yolo_to_coreml.py`

- [ ] **Step 1: Install conversion dependencies**

```bash
pip install coremltools ultralytics
```

- [ ] **Step 2: Create conversion script**

Create `scripts/convert_yolo_to_coreml.py`:

```python
#!/usr/bin/env python3
"""
Convert yolo11n.pt to yolo11n.mlpackage for iOS bundling.
Run once from the project root: python scripts/convert_yolo_to_coreml.py
Output: mobile-app/ios/Runner/yolo11n.mlpackage
"""
from pathlib import Path
from ultralytics import YOLO

SRC = Path("detection-service/yolo11n.pt")
DST_DIR = Path("mobile-app/ios/Runner")

if not SRC.exists():
    raise FileNotFoundError(f"Source model not found: {SRC}")

DST_DIR.mkdir(parents=True, exist_ok=True)

model = YOLO(str(SRC))
# Export with NMS baked in so VNCoreMLRequest gets bounding box observations directly
export_path = model.export(
    format="coreml",
    nms=True,
    imgsz=640,
)

import shutil
shutil.move(export_path, str(DST_DIR / "yolo11n.mlpackage"))
print(f"Exported to {DST_DIR / 'yolo11n.mlpackage'}")
```

- [ ] **Step 3: Run the conversion**

```bash
cd /path/to/allmythings  # project root
python scripts/convert_yolo_to_coreml.py
```

Expected output: `Exported to mobile-app/ios/Runner/yolo11n.mlpackage`

Verify:
```bash
ls -lh mobile-app/ios/Runner/yolo11n.mlpackage/
```

Expected: directory containing `Manifest.json`, `Data/`, etc.

- [ ] **Step 4: Add the mlpackage to Xcode project**

Open `mobile-app/ios/Runner.xcodeproj` in Xcode. Drag `yolo11n.mlpackage` from Finder into the Runner target's file list. In the dialog: check "Copy items if needed", add to target "Runner". Close Xcode.

- [ ] **Step 5: Commit**

```bash
git add scripts/convert_yolo_to_coreml.py mobile-app/ios/Runner/yolo11n.mlpackage
git commit -m "feat(ios): YOLO11n CoreML model and conversion script"
```

---

### Task 12: Update DetectionState with isEnriching Flag

The UI needs to show a shimmer on attribute chips while the deep pass is running, without re-showing a loading spinner.

**Files:**
- Modify: `mobile-app/lib/application/state/detection_state.dart`

- [ ] **Step 1: Write failing test**

Create `mobile-app/test/application/state/detection_state_test.dart`:

```dart
import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DetectionState.success', () {
    test('isEnriching defaults to false', () {
      final state = DetectionState.success(
        detections: [],
        processingTimeMs: 100,
        detector: 'coreml',
        classifier: 'none',
      );
      expect(state.isEnriching, false);
    });

    test('isEnriching can be set to true for fast-pass display', () {
      final state = DetectionState.success(
        detections: [],
        processingTimeMs: 0,
        detector: 'coreml',
        classifier: 'none',
        isEnriching: true,
      );
      expect(state.isEnriching, true);
    });
  });
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd mobile-app
flutter test test/application/state/detection_state_test.dart
```

Expected: FAIL — `isEnriching` not a named parameter.

- [ ] **Step 3: Update DetectionState**

Replace `mobile-app/lib/application/state/detection_state.dart`:

```dart
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'detection_state.freezed.dart';

/// State for detection process
@freezed
sealed class DetectionState with _$DetectionState {
  const factory DetectionState.initial() = DetectionInitial;
  const factory DetectionState.loading() = DetectionLoading;
  const factory DetectionState.success({
    required List<DetectedObject> detections,
    required int processingTimeMs,
    required String detector,
    required String classifier,
    int? corroborationCount,
    @Default(false) bool isEnriching,
  }) = DetectionSuccess;
  const factory DetectionState.empty() = DetectionEmpty;
  const factory DetectionState.error(String message) = DetectionError;
}
```

- [ ] **Step 4: Regenerate Freezed code**

```bash
cd mobile-app
flutter pub run build_runner build --delete-conflicting-outputs
```

Expected: `detection_state.freezed.dart` regenerated without errors.

- [ ] **Step 5: Run test to confirm it passes**

```bash
flutter test test/application/state/detection_state_test.dart
```

Expected: PASS

- [ ] **Step 6: Run full Flutter test suite**

```bash
flutter test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add mobile-app/lib/application/state/detection_state.dart \
        mobile-app/lib/application/state/detection_state.freezed.dart \
        mobile-app/test/application/state/detection_state_test.dart
git commit -m "feat(mobile): add isEnriching flag to DetectionSuccess state for shimmer UI"
```

---

### Task 13: Three-Tier Flow in DetectionNotifier

Wire the three tiers: CoreML first → state shown immediately → Mac deep pass → state updated. On Mac failure, CoreML results remain visible with an offline indicator.

**Files:**
- Modify: `mobile-app/lib/application/providers/detection_providers.dart`

- [ ] **Step 1: Write failing test**

Create `mobile-app/test/application/providers/detection_notifier_test.dart`:

```dart
import 'dart:async';
import 'dart:io';
import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/native/coreml_detector.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDetectionRepository extends Mock implements DetectionRepository {}

void main() {
  setUpAll(() {
    registerFallbackValue(File(''));
  });

  tearDown(() {
    CoreMLDetector.detectOverride = null;
  });

  group('DetectionNotifier three-tier flow', () {
    test('shows isEnriching=true after CoreML, false after deep pass', () async {
      final repo = MockDetectionRepository();
      final completer = Completer<DetectionResult>();

      when(() => repo.detectObjects(any())).thenAnswer((_) => completer.future);

      // Inject CoreML fake results via static override
      CoreMLDetector.detectOverride = (_) async => [
        CoreMLBox(label: 'chair', confidence: 0.85, boxIndex: 0,
            x: 0.1, y: 0.1, width: 0.3, height: 0.4),
      ];

      final container = ProviderContainer(
        overrides: [
          detectionRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(detectionProvider.notifier);

      final file = File('test_image.jpg');
      final detectFuture = notifier.detectObjects(file);

      // After CoreML runs, state should be success with isEnriching=true
      await Future.delayed(Duration.zero);
      final stateAfterCoreML = container.read(detectionProvider);
      expect(stateAfterCoreML, isA<DetectionSuccess>());
      expect((stateAfterCoreML as DetectionSuccess).isEnriching, true);

      // Complete the deep pass
      completer.complete(DetectionResult(
        detections: [],
        detector: 'yoloe',
        classifier: 'ollama',
        processingTimeMs: 3000,
      ));
      await detectFuture;

      final finalState = container.read(detectionProvider);
      expect(finalState, isA<DetectionSuccess>());
      expect((finalState as DetectionSuccess).isEnriching, false);
      expect(finalState.classifier, 'ollama');
    });
  });
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd mobile-app
flutter test test/application/providers/detection_notifier_test.dart
```

Expected: FAIL — `detectOverride` not defined, isEnriching state not set.

- [ ] **Step 3: Update coreml_detector.dart with detectOverride test hook**

Replace the entire contents of `mobile-app/lib/native/coreml_detector.dart`:

```dart
import 'dart:io';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/services.dart';

class CoreMLBox {
  const CoreMLBox({
    required this.label,
    required this.confidence,
    required this.boxIndex,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  final String label;
  final double confidence;
  final int boxIndex;
  final double x;
  final double y;
  final double width;
  final double height;
}

class CoreMLDetector {
  static const _channel = MethodChannel('com.allmythings/coreml_detector');

  /// Test-only: set to bypass the platform channel in unit tests.
  /// Always reset to null in tearDown.
  @visibleForTesting
  static Future<List<CoreMLBox>> Function(File)? detectOverride;

  /// Returns true if the CoreML model is bundled and available.
  static Future<bool> isAvailable() async {
    try {
      return await _channel.invokeMethod<bool>('isAvailable') ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// Run YOLO inference on [imageFile]. Returns detected boxes with coarse labels.
  /// Confidence threshold 0.3 — cast wide net, VLM prunes false positives.
  static Future<List<CoreMLBox>> detect(File imageFile) async {
    if (detectOverride != null) return detectOverride!(imageFile);
    final bytes = await imageFile.readAsBytes();
    try {
      final raw = await _channel.invokeMethod<List<dynamic>>(
        'detect',
        {'imageBytes': bytes},
      );
      if (raw == null) return [];
      return raw.map((item) {
        final m = Map<String, dynamic>.from(item as Map);
        final box = (m['box'] as List<dynamic>).cast<double>();
        return CoreMLBox(
          label: m['label'] as String,
          confidence: (m['confidence'] as num).toDouble(),
          boxIndex: (m['boxIndex'] as num).toInt(),
          x: box[0],
          y: box[1],
          width: box[2],
          height: box[3],
        );
      }).toList();
    } on PlatformException {
      return [];
    }
  }
}
```

- [ ] **Step 4: Update DetectionNotifier for three-tier flow**

Replace the entire contents of `mobile-app/lib/application/providers/detection_providers.dart`:

```dart
import 'dart:io';

import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/native/coreml_detector.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for detection repository
final detectionRepositoryProvider = Provider<DetectionRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DetectionRepository(apiClient);
});

/// Notifier for managing detection state
class DetectionNotifier extends Notifier<DetectionState> {
  @override
  DetectionState build() => const DetectionState.initial();

  /// Detect objects using three-tier cascade:
  /// 1. CoreML on-device (instant, ~50ms)
  /// 2. Mac deep pass via API (rich attributes, ~5–15s)
  /// 3. Falls back to CoreML-only on Mac failure (offline mode)
  Future<DetectionResult> detectObjects(File imageFile) async {
    state = const DetectionState.loading();

    // Tier 1: CoreML on-device — instant, no network
    final fastBoxes = await CoreMLDetector.detect(imageFile);
    if (fastBoxes.isNotEmpty) {
      state = DetectionState.success(
        detections: fastBoxes.map(_coreMLBoxToDetectedObject).toList(),
        processingTimeMs: 0,
        detector: 'coreml',
        classifier: 'none',
        isEnriching: true, // shimmer while deep pass runs
      );
    }

    // Tier 2: Mac deep pass (enriched attributes)
    try {
      final repository = ref.read(detectionRepositoryProvider);
      final result = await repository.detectObjects(imageFile);

      if (result.detections.isEmpty && fastBoxes.isNotEmpty) {
        // Deep pass returned nothing — keep CoreML results
        state = DetectionState.success(
          detections: fastBoxes.map(_coreMLBoxToDetectedObject).toList(),
          processingTimeMs: 0,
          detector: 'coreml',
          classifier: 'offline',
          isEnriching: false,
        );
        return DetectionResult(
          detections: fastBoxes.map(_coreMLBoxToDetectedObject).toList(),
          detector: 'coreml',
          classifier: 'offline',
          processingTimeMs: 0,
        );
      }

      state = DetectionState.success(
        detections: result.detections,
        processingTimeMs: result.processingTimeMs,
        detector: result.detector,
        classifier: result.classifier,
        corroborationCount: result.corroborationCount,
        isEnriching: false,
      );
      return result;
    } catch (e) {
      if (fastBoxes.isNotEmpty) {
        // Mac unreachable — show CoreML results with offline indicator
        state = DetectionState.success(
          detections: fastBoxes.map(_coreMLBoxToDetectedObject).toList(),
          processingTimeMs: 0,
          detector: 'coreml',
          classifier: 'offline',
          isEnriching: false,
        );
        return DetectionResult(
          detections: fastBoxes.map(_coreMLBoxToDetectedObject).toList(),
          detector: 'coreml',
          classifier: 'offline',
          processingTimeMs: 0,
        );
      }
      state = DetectionState.error(e.toString());
      rethrow;
    }
  }

  /// Reset state
  void reset() {
    state = const DetectionState.initial();
  }

  DetectedObject _coreMLBoxToDetectedObject(CoreMLBox box) {
    return DetectedObject(
      boxIndex: box.boxIndex,
      label: box.label,
      category: 'object',
      confidence: box.confidence,
      boundingBox: BoundingBox(
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      ),
    );
  }
}

/// Provider for detection state notifier
final detectionProvider =
    NotifierProvider<DetectionNotifier, DetectionState>(
  DetectionNotifier.new,
);
```

- [ ] **Step 5: Run tests**

```bash
cd mobile-app
flutter test
```

Expected: All tests pass.

- [ ] **Step 6: Test on physical iPhone with Mac running**

With `make dev` running on the Mac and Ollama running:

1. Open the app on iPhone
2. Take a photo of a room
3. Bounding boxes should appear within 1 second (CoreML)
4. After 5–15 seconds, attributes fill in (Ollama deep pass)
5. No exclamation mark failure

- [ ] **Step 7: Commit**

```bash
git add mobile-app/lib/application/providers/detection_providers.dart \
        mobile-app/lib/native/coreml_detector.dart \
        mobile-app/test/application/providers/detection_notifier_test.dart
git commit -m "feat(mobile): three-tier detection flow — CoreML instant, Mac deep pass, offline fallback"
```

---

## Final Verification

- [ ] **End-to-end test on physical iPhone with Mac on same WiFi**

  1. Start Ollama: `ollama serve`
  2. Start services: `make dev`
  3. Verify Bonjour: `dns-sd -B _http._tcp local` shows `allmythings-server`
  4. Run app on iPhone
  5. Take photo of a room with 10+ objects
  6. Expected: CoreML boxes appear <1s, attributes fill in <15s, ≥10 objects detected with brand/condition/value where visible

- [ ] **Test offline mode (Mac WiFi off)**

  1. Disconnect Mac from WiFi
  2. Take photo on iPhone
  3. Expected: CoreML results appear, no crash, no exclamation mark, "offline" indicator in UI

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat: accuracy-first three-tier detection — CoreML + Ollama/MLX + Gemini fallback"
```
