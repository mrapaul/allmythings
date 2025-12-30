package com.homeinventory.home_inventory

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.RectF
import android.util.Log
import java.nio.FloatBuffer

/**
 * Detection result from YOLO model
 */
data class DetectionResult(
    val label: String,
    val confidence: Float,
    val boundingBox: RectF  // Normalized coordinates (0-1)
)

/**
 * Local object detector using ONNX Runtime with YOLO11n
 */
class LocalDetector(private val context: Context) {

    companion object {
        private const val TAG = "LocalDetector"
        private const val MODEL_FILE = "yolo11n.onnx"
        private const val INPUT_SIZE = 640
        private const val NUM_CLASSES = 80
        private const val CONFIDENCE_THRESHOLD = 0.25f
        private const val IOU_THRESHOLD = 0.45f

        // COCO class labels (80 classes)
        private val COCO_LABELS = arrayOf(
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
        )
    }

    private var ortEnvironment: OrtEnvironment? = null
    private var ortSession: OrtSession? = null
    private var isReady = false

    init {
        loadModel()
    }

    /**
     * Load the ONNX model
     */
    private fun loadModel() {
        try {
            ortEnvironment = OrtEnvironment.getEnvironment()

            // Load model from assets
            val modelBytes = context.assets.open(MODEL_FILE).use { it.readBytes() }

            // Create session options for optimization
            val sessionOptions = OrtSession.SessionOptions().apply {
                // Enable optimization
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                // Use all available threads
                setIntraOpNumThreads(4)
            }

            ortSession = ortEnvironment?.createSession(modelBytes, sessionOptions)
            isReady = true
            Log.d(TAG, "Model loaded successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load model: ${e.message}")
        }
    }

    /**
     * Check if the detector is ready
     */
    fun isReady(): Boolean = isReady && ortSession != null

    /**
     * Detect objects in an image file
     */
    fun detect(imagePath: String, imageWidth: Int = INPUT_SIZE, imageHeight: Int = INPUT_SIZE): List<DetectionResult> {
        if (!isReady()) {
            Log.e(TAG, "Detector not ready")
            return emptyList()
        }

        return try {
            val startTime = System.currentTimeMillis()
            val bitmap = BitmapFactory.decodeFile(imagePath) ?: return emptyList()
            val results = detectInBitmap(bitmap)
            val elapsed = System.currentTimeMillis() - startTime
            Log.d(TAG, "Detection completed in ${elapsed}ms, found ${results.size} objects")
            results
        } catch (e: Exception) {
            Log.e(TAG, "Detection failed: ${e.message}")
            emptyList()
        }
    }

    /**
     * Detect objects from raw image data
     */
    fun detect(imageData: ByteArray, imageWidth: Int = INPUT_SIZE, imageHeight: Int = INPUT_SIZE): List<DetectionResult> {
        if (!isReady()) {
            Log.e(TAG, "Detector not ready")
            return emptyList()
        }

        return try {
            val startTime = System.currentTimeMillis()
            val bitmap = BitmapFactory.decodeByteArray(imageData, 0, imageData.size) ?: return emptyList()
            val results = detectInBitmap(bitmap)
            val elapsed = System.currentTimeMillis() - startTime
            Log.d(TAG, "Detection completed in ${elapsed}ms, found ${results.size} objects")
            results
        } catch (e: Exception) {
            Log.e(TAG, "Detection failed: ${e.message}")
            emptyList()
        }
    }

    /**
     * Core detection method using ONNX Runtime
     */
    private fun detectInBitmap(bitmap: Bitmap): List<DetectionResult> {
        val session = ortSession ?: return emptyList()
        val env = ortEnvironment ?: return emptyList()

        // Resize bitmap to input size - use nearest neighbor (filter=false) for speed
        val resizedBitmap = Bitmap.createScaledBitmap(bitmap, INPUT_SIZE, INPUT_SIZE, false)

        // Prepare input tensor (NCHW format: batch, channels, height, width)
        val inputBuffer = FloatBuffer.allocate(1 * 3 * INPUT_SIZE * INPUT_SIZE)

        // Get pixels
        val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
        resizedBitmap.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)

        // Convert to CHW format and normalize (0-1 range)
        // Channel R
        for (y in 0 until INPUT_SIZE) {
            for (x in 0 until INPUT_SIZE) {
                val pixel = pixels[y * INPUT_SIZE + x]
                inputBuffer.put(((pixel shr 16) and 0xFF) / 255.0f)
            }
        }
        // Channel G
        for (y in 0 until INPUT_SIZE) {
            for (x in 0 until INPUT_SIZE) {
                val pixel = pixels[y * INPUT_SIZE + x]
                inputBuffer.put(((pixel shr 8) and 0xFF) / 255.0f)
            }
        }
        // Channel B
        for (y in 0 until INPUT_SIZE) {
            for (x in 0 until INPUT_SIZE) {
                val pixel = pixels[y * INPUT_SIZE + x]
                inputBuffer.put((pixel and 0xFF) / 255.0f)
            }
        }
        inputBuffer.rewind()

        // Create input tensor
        val inputShape = longArrayOf(1, 3, INPUT_SIZE.toLong(), INPUT_SIZE.toLong())
        val inputTensor = OnnxTensor.createTensor(env, inputBuffer, inputShape)

        // Run inference
        val inputName = session.inputNames.first()
        val output = session.run(mapOf(inputName to inputTensor))

        // Get output tensor (shape: [1, 84, 8400] for YOLOv8/11)
        // 84 = 4 (box) + 80 (classes)
        val outputTensor = output.get(0).value as Array<Array<FloatArray>>
        val results = processOutput(outputTensor[0])

        // Clean up
        inputTensor.close()
        output.close()

        return results
    }

    /**
     * Process YOLO output tensor
     * Output shape: [84, 8400] where 84 = 4 (x, y, w, h) + 80 (class scores)
     */
    private fun processOutput(output: Array<FloatArray>): List<DetectionResult> {
        val detections = mutableListOf<DetectionResult>()
        val numDetections = output[0].size  // 8400 possible detections

        for (i in 0 until numDetections) {
            // Get bounding box (normalized center x, y, width, height)
            val cx = output[0][i]
            val cy = output[1][i]
            val w = output[2][i]
            val h = output[3][i]

            // Find best class
            var maxScore = 0f
            var maxClassIdx = 0
            for (c in 0 until NUM_CLASSES) {
                val score = output[4 + c][i]
                if (score > maxScore) {
                    maxScore = score
                    maxClassIdx = c
                }
            }

            if (maxScore < CONFIDENCE_THRESHOLD) continue

            // Convert center coordinates to corner coordinates
            val x = cx - w / 2
            val y = cy - h / 2

            detections.add(
                DetectionResult(
                    label = COCO_LABELS.getOrElse(maxClassIdx) { "unknown" },
                    confidence = maxScore,
                    boundingBox = RectF(x, y, x + w, y + h)
                )
            )
        }

        // Apply NMS
        return applyNMS(detections)
    }

    /**
     * Non-Maximum Suppression to remove overlapping boxes
     */
    private fun applyNMS(detections: List<DetectionResult>): List<DetectionResult> {
        if (detections.isEmpty()) return emptyList()

        // Sort by confidence descending
        val sorted = detections.sortedByDescending { it.confidence }.toMutableList()
        val kept = mutableListOf<DetectionResult>()

        while (sorted.isNotEmpty()) {
            val current = sorted.removeAt(0)
            kept.add(current)

            // Remove overlapping detections of the same class
            sorted.removeAll { detection ->
                detection.label == current.label &&
                calculateIoU(current.boundingBox, detection.boundingBox) >= IOU_THRESHOLD
            }
        }

        return kept
    }

    /**
     * Calculate Intersection over Union between two bounding boxes
     */
    private fun calculateIoU(box1: RectF, box2: RectF): Float {
        val intersectLeft = maxOf(box1.left, box2.left)
        val intersectTop = maxOf(box1.top, box2.top)
        val intersectRight = minOf(box1.right, box2.right)
        val intersectBottom = minOf(box1.bottom, box2.bottom)

        if (intersectLeft >= intersectRight || intersectTop >= intersectBottom) {
            return 0f
        }

        val intersectionArea = (intersectRight - intersectLeft) * (intersectBottom - intersectTop)
        val box1Area = (box1.right - box1.left) * (box1.bottom - box1.top)
        val box2Area = (box2.right - box2.left) * (box2.bottom - box2.top)
        val unionArea = box1Area + box2Area - intersectionArea

        return if (unionArea > 0) intersectionArea / unionArea else 0f
    }

    /**
     * Convert detection result to Map for Flutter
     */
    fun DetectionResult.toMap(imageWidth: Int, imageHeight: Int): Map<String, Any> {
        // Convert normalized coordinates to pixel coordinates
        val x = boundingBox.left * imageWidth
        val y = boundingBox.top * imageHeight
        val width = boundingBox.width() * imageWidth
        val height = boundingBox.height() * imageHeight

        return mapOf(
            "label" to label,
            "confidence" to confidence,
            "x" to x,
            "y" to y,
            "width" to width,
            "height" to height,
            "normalizedBox" to mapOf(
                "x" to boundingBox.left,
                "y" to boundingBox.top,
                "width" to boundingBox.width(),
                "height" to boundingBox.height()
            )
        )
    }

    /**
     * Release resources
     */
    fun close() {
        ortSession?.close()
        ortEnvironment?.close()
        ortSession = null
        ortEnvironment = null
        isReady = false
    }
}
