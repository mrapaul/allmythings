import { OllamaVisionAdapter } from '../src/adapters/ollama-vision.adapter';
import * as fs from 'fs';
import * as path from 'path';
import { envConfig } from '../src/config/env.config';

// Force override for testing if not set in env
if (!process.env.OLLAMA_MODEL) {
    // We assume 'llava' was pulled as per instructions
    process.env.OLLAMA_MODEL = 'llava';
}

async function main() {
  console.log('Validating Ollama Vision Adapter...');
  console.log(`Model: ${envConfig.ollamaModel || 'llava'}`);
  console.log(`URL: ${envConfig.ollamaBaseUrl}`);

  const adapter = new OllamaVisionAdapter();
  const imagePath = path.resolve(__dirname, '../../test_images/ai_interior.jpg');

  if (!fs.existsSync(imagePath)) {
    console.error(`Error: Test image not found at ${imagePath}`);
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(imagePath);

  try {
    const detections = await adapter.detectObjects(imageBuffer);
    console.log('Success! Detections:', JSON.stringify(detections, null, 2));
  } catch (error) {
    console.error('Error detecting objects:', error);
    process.exit(1);
  }
}

main();
