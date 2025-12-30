import CoreML
import Vision
import UIKit

/// Detection result from YOLO model
struct DetectionResult {
    let label: String
    let confidence: Float
    let boundingBox: CGRect  // Normalized coordinates (0-1)
}

/// Local object detector using CoreML with YOLO11n
class LocalDetector {

    private var model: VNCoreMLModel?
    private var labels: [String] = []
    private let confidenceThreshold: Float = 0.25
    private let iouThreshold: Float = 0.45

    // COCO class labels (80 classes)
    private static let cocoLabels = [
        "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
        "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
        "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
        "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
        "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
        "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
        "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
        "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
        "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
        "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
        "toothbrush"
    ]

    init() {
        loadModel()
        labels = LocalDetector.cocoLabels
    }

    /// Load the CoreML model
    private func loadModel() {
        // Try compiled model first (.mlmodelc), then package (.mlpackage)
        var modelURL: URL? = Bundle.main.url(forResource: "yolo11n", withExtension: "mlmodelc")

        if modelURL == nil {
            modelURL = Bundle.main.url(forResource: "yolo11n", withExtension: "mlpackage")
        }

        guard let url = modelURL else {
            print("LocalDetector: Model file not found (checked .mlmodelc and .mlpackage)")
            return
        }

        print("LocalDetector: Found model at \(url.path)")

        do {
            let config = MLModelConfiguration()
            config.computeUnits = .all  // Use Neural Engine when available

            let mlModel = try MLModel(contentsOf: url, configuration: config)
            model = try VNCoreMLModel(for: mlModel)
            print("LocalDetector: Model loaded successfully")
        } catch {
            print("LocalDetector: Failed to load model - \(error)")
        }
    }

    /// Check if the detector is ready
    var isReady: Bool {
        return model != nil
    }

    /// Detect objects in an image file
    func detect(imagePath: String, completion: @escaping (Result<[DetectionResult], Error>) -> Void) {
        guard let model = model else {
            completion(.failure(DetectorError.modelNotLoaded))
            return
        }

        guard let image = UIImage(contentsOfFile: imagePath),
              let cgImage = image.cgImage else {
            completion(.failure(DetectorError.invalidImage))
            return
        }

        detectInCGImage(cgImage, completion: completion)
    }

    /// Detect objects in a UIImage
    func detect(image: UIImage, completion: @escaping (Result<[DetectionResult], Error>) -> Void) {
        guard let model = model else {
            completion(.failure(DetectorError.modelNotLoaded))
            return
        }

        guard let cgImage = image.cgImage else {
            completion(.failure(DetectorError.invalidImage))
            return
        }

        detectInCGImage(cgImage, completion: completion)
    }

    /// Detect objects in raw image data
    func detect(imageData: Data, completion: @escaping (Result<[DetectionResult], Error>) -> Void) {
        guard let model = model else {
            completion(.failure(DetectorError.modelNotLoaded))
            return
        }

        guard let image = UIImage(data: imageData),
              let cgImage = image.cgImage else {
            completion(.failure(DetectorError.invalidImage))
            return
        }

        detectInCGImage(cgImage, completion: completion)
    }

    /// Core detection method using Vision framework
    private func detectInCGImage(_ cgImage: CGImage, completion: @escaping (Result<[DetectionResult], Error>) -> Void) {
        guard let model = model else {
            completion(.failure(DetectorError.modelNotLoaded))
            return
        }

        let startTime = CFAbsoluteTimeGetCurrent()

        let request = VNCoreMLRequest(model: model) { [weak self] request, error in
            guard let self = self else { return }

            if let error = error {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
                return
            }

            let results = self.processResults(request.results)
            let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
            print("LocalDetector: Detection completed in \(String(format: "%.1f", elapsed))ms, found \(results.count) objects")

            DispatchQueue.main.async {
                completion(.success(results))
            }
        }

        // Use center crop for consistent results
        request.imageCropAndScaleOption = .scaleFill

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try handler.perform([request])
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }
    }

    /// Process Vision results into DetectionResult array
    private func processResults(_ results: [Any]?) -> [DetectionResult] {
        guard let observations = results as? [VNRecognizedObjectObservation] else {
            return []
        }

        var detections: [DetectionResult] = []

        for observation in observations {
            guard observation.confidence >= confidenceThreshold else { continue }

            // Get the top label
            guard let topLabel = observation.labels.first else { continue }

            let detection = DetectionResult(
                label: topLabel.identifier,
                confidence: topLabel.confidence,
                boundingBox: observation.boundingBox
            )

            detections.append(detection)
        }

        // Apply NMS if the model doesn't include it
        return applyNMS(detections)
    }

    /// Non-Maximum Suppression to remove overlapping boxes
    private func applyNMS(_ detections: [DetectionResult]) -> [DetectionResult] {
        guard !detections.isEmpty else { return [] }

        // Sort by confidence descending
        var sorted = detections.sorted { $0.confidence > $1.confidence }
        var kept: [DetectionResult] = []

        while !sorted.isEmpty {
            let current = sorted.removeFirst()
            kept.append(current)

            // Remove overlapping detections of the same class
            sorted = sorted.filter { detection in
                if detection.label != current.label {
                    return true
                }
                return calculateIoU(current.boundingBox, detection.boundingBox) < iouThreshold
            }
        }

        return kept
    }

    /// Calculate Intersection over Union between two bounding boxes
    private func calculateIoU(_ box1: CGRect, _ box2: CGRect) -> Float {
        let intersection = box1.intersection(box2)

        guard !intersection.isNull else { return 0 }

        let intersectionArea = intersection.width * intersection.height
        let unionArea = (box1.width * box1.height) + (box2.width * box2.height) - intersectionArea

        guard unionArea > 0 else { return 0 }

        return Float(intersectionArea / unionArea)
    }
}

/// Detector errors
enum DetectorError: Error, LocalizedError {
    case modelNotLoaded
    case invalidImage
    case detectionFailed(String)

    var errorDescription: String? {
        switch self {
        case .modelNotLoaded:
            return "Object detection model not loaded"
        case .invalidImage:
            return "Invalid or corrupted image"
        case .detectionFailed(let reason):
            return "Detection failed: \(reason)"
        }
    }
}

/// Extension to convert DetectionResult to Dictionary for Flutter
extension DetectionResult {
    func toDictionary(imageWidth: Int, imageHeight: Int) -> [String: Any] {
        // Convert normalized coordinates to pixel coordinates
        // Note: Vision uses bottom-left origin, Flutter uses top-left
        let x = Float(boundingBox.origin.x) * Float(imageWidth)
        let y = Float(1 - boundingBox.origin.y - boundingBox.height) * Float(imageHeight)
        let width = Float(boundingBox.width) * Float(imageWidth)
        let height = Float(boundingBox.height) * Float(imageHeight)

        return [
            "label": label,
            "confidence": confidence,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "normalizedBox": [
                "x": Float(boundingBox.origin.x),
                "y": Float(1 - boundingBox.origin.y - boundingBox.height),
                "width": Float(boundingBox.width),
                "height": Float(boundingBox.height)
            ]
        ]
    }
}
