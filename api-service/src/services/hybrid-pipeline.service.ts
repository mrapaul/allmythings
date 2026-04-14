import { Owlv2Detector } from '../providers/owlv2.detector';
import { ObjectClassifier, ClassifiedObject } from '../providers/classifier.interface';
import { logger } from '../utils/logger';

/**
 * Hybrid pipeline: OWLv2 finds boxes using a fixed household class list,
 * then the VLM classifier enriches each detected box with structured attributes.
 *
 * Trade-off vs MultiPassVlmClassifier: boxes come from a model trained to find them,
 * not from prompting a VLM. Higher recall at the cost of one extra HTTP hop.
 */
export class HybridPipelineService {
  constructor(
    private readonly detector: Owlv2Detector,
    private readonly classifier: ObjectClassifier,
  ) {}

  async detect(image: Buffer): Promise<ClassifiedObject[]> {
    const boxes = await this.detector.detect(image);
    logger.info({ count: boxes.length }, 'HybridPipeline: OWLv2 boxes');
    if (boxes.length === 0) return [];

    const classified = await this.classifier.classify(image, boxes);
    logger.info({ count: classified.length }, 'HybridPipeline: VLM classifications');
    return classified;
  }
}
