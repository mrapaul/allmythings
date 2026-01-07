import { GeminiVisionAdapter } from '../src/adapters/gemini-vision.adapter';
import * as fs from 'fs';
import * as path from 'path';
import { envConfig } from '../src/config/env.config';

async function main() {
  console.log('Validating Gemini Vision Adapter...');
  
  if (!envConfig.geminiApiKey) {
    console.error('Error: GOOGLE_AI_API_KEY is not set in environment variables.');
    process.exit(1);
  }

  const adapter = new GeminiVisionAdapter();
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
