/// Enum for vision AI providers in the ensemble
enum VisionProvider {
  /// Meta Detectron2 / SAM
  meta,

  /// Google Cloud Vision API
  google,

  /// AWS Rekognition
  aws,

  /// TensorFlow Serving (custom model)
  tensorflow,
}
