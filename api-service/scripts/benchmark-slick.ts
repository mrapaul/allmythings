import * as fs from 'fs';
import * as path from 'path';
import { GeminiClassifier } from '../src/providers/gemini.classifier';
import { OllamaClassifier } from '../src/providers/ollama.classifier';
import { EnsembleFusionService } from '../src/services/ensemble-fusion.service';
import { ClassifiedObject } from '../src/providers/classifier.interface';

const config = {
  geminiApiKey: 'AIzaSyCjKf3HAdhBa9sfkXYpVTG222KVnH6ViZc',
  geminiModel: 'gemini-2.5-flash',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llava:latest',
  classificationTimeoutMs: 60000,
} as any;

async function benchmark() {
  const imgPath = path.resolve(__dirname, '../../test_images/ai_interior.jpg');
  const imgBuf = fs.readFileSync(imgPath);

  console.log("=== PERFORMANCE BENCHMARK: ai_interior.jpg ===");
  console.log("Optimized One-Pass + Parallel Corroboration\n");

  const fusionService = new EnsembleFusionService();
  const resultsMap = new Map<string, ClassifiedObject[]>();

  // 1. Gemini 2.5 Flash
  const startG = Date.now();
  console.log("Layer 1: Querying Gemini 2.5 Flash...");
  try {
    const gemini = new GeminiClassifier(config);
    const gResults = await gemini.classify(imgBuf, []);
    const timeG = Date.now() - startG;
    resultsMap.set('gemini', gResults);
    console.log(`✅ Gemini: ${gResults.length} items identified in ${timeG}ms`);
  } catch (e: any) {
    console.log(`❌ Gemini Layer Failed: ${e.message}`);
  }

  // 2. Ollama Llava
  const startO = Date.now();
  console.log("Layer 2: Querying Local Ollama (Llava)...");
  try {
    const ollama = new OllamaClassifier(config);
    const oResults = await ollama.classify(imgBuf, []);
    const timeO = Date.now() - startO;
    resultsMap.set('ollama', oResults);
    console.log(`✅ Ollama: ${oResults.length} items identified in ${timeO}ms`);
  } catch (e: any) {
    console.log(`❌ Ollama Layer Failed: ${e.message}`);
  }

  // 3. Fusion & Corroboration
  console.log("\nLayer 3: Executing Ensemble Fusion...");
  const fusion = await fusionService.fuse(resultsMap);
  console.log(`✅ Fusion complete: ${fusion.detections.length} unique items (${fusion.corroborationCount} corroborated)`);

  console.log("\n--- Top Corroborated Results ---");
  const sorted = [...fusion.detections].sort((a, b) => b.confidence - a.confidence);
  sorted.slice(0, 15).forEach((d: ClassifiedObject) => {
    const corroboration = d.confidence > 0.95 ? "[CORROBORATED]" : "              ";
    console.log(`${corroboration} ${d.label.padEnd(25)} (${(d.confidence * 100).toFixed(0)}%) -> ${d.category}`);
  });
}

benchmark();
