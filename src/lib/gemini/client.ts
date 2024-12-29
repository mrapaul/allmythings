import { GoogleGenerativeAI } from '@google/generative-ai';
import { SPATIAL_ANALYSIS_PROMPT } from './prompts';
import type { SpatialAnalysisResult } from './types';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

export async function analyzeSpatialImage(imageBase64: string): Promise<SpatialAnalysisResult> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    
    // Remove data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    
    const result = await model.generateContent([
      SPATIAL_ANALYSIS_PROMPT,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data
        }
      }
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    try {
      return JSON.parse(text);
    } catch (e) {
      // If parsing fails, try to extract JSON from the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Failed to parse Gemini response');
    }
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw error;
  }
}