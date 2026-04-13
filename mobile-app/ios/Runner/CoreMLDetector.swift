import Foundation
import Flutter
import Vision
import CoreML
import UIKit

class CoreMLDetector: NSObject {
    private static var shared: CoreMLDetector?

    static func register(messenger: FlutterBinaryMessenger) {
        guard shared == nil else { return }
        let instance = CoreMLDetector()
        CoreMLDetector.shared = instance
        let channel = FlutterMethodChannel(
            name: "com.allmythings/coreml_detector",
            binaryMessenger: messenger
        )
        channel.setMethodCallHandler { [weak instance] call, result in
            instance?.handle(call, result: result) ?? result(FlutterMethodNotImplemented)
        }
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

        // Model loading and inference run off the main thread to avoid UI jank
        DispatchQueue.global(qos: .userInitiated).async {
            guard let mlModel = try? MLModel(contentsOf: modelURL, configuration: MLModelConfiguration()),
                  let vnModel = try? VNCoreMLModel(for: mlModel) else {
                DispatchQueue.main.async {
                    result(FlutterError(code: "MODEL_LOAD_ERROR", message: "Could not load CoreML model", details: nil))
                }
                return
            }

            let request = VNCoreMLRequest(model: vnModel) { request, error in
                // VNCoreMLRequest completion fires on the background thread — marshal to main
                DispatchQueue.main.async {
                    if let error = error {
                        result(FlutterError(code: "INFERENCE_ERROR", message: error.localizedDescription, details: nil))
                        return
                    }
                    let detections = CoreMLDetector.mapObservations(request.results)
                    result(detections)
                }
            }
            request.imageCropAndScaleOption = .scaleFit

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                // perform() is synchronous — completion either already enqueued on main or was never called
                DispatchQueue.main.async {
                    result(FlutterError(code: "HANDLER_ERROR", message: error.localizedDescription, details: nil))
                }
            }
        }
    }

    private static func mapObservations(_ results: [Any]?) -> [[String: Any]] {
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
