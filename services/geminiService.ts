import { GoogleGenAI, Type } from "@google/genai";
import { ImageMetadata } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        resolve('');
      }
    };
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

export const analyzeImageAndSuggestMetadata = async (file: File): Promise<ImageMetadata> => {
  try {
    const imagePart = await fileToGenerativePart(file);
    const prompt = `Analyze this image, which is concept art for a video game. The goal is to generate metadata that makes this image easily searchable for game production reference.

- **Filename:** Suggest a concise, descriptive filename in kebab-case (e.g., 'female-elf-archer-scouting-forest'). Do not include the file extension.
- **Title:** Write a short, descriptive title for the artwork (e.g., 'Elven Archer Scouting the Whispering Woods').
- **Description:** Write a detailed description focusing on key visual elements useful for production. Describe the character's appearance (clothing, armor, weapons), the environment (time of day, weather, key features), and any important objects or props.
- **Tags:** Provide a comprehensive list of tags. Include tags for:
  - Main Subject (e.g., character, creature, vehicle)
  - Character Specifics (e.g., elf, female, archer, warrior, facial expression)
  - Environment (e.g., forest, woods, daytime, ancient-ruins, city)
  - Objects/Props (e.g., bow, arrow, quiver, leather-armor, cloak, sword)
  - Art Style (e.g., fantasy, sci-fi, realistic, stylized, painterly)
  - Composition (e.g., full-body, portrait, wide-shot)
  - Colors (e.g., green, brown, earth-tones, vibrant, muted)

Return the result in a JSON format.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            filename: {
              type: Type.STRING,
              description: "The descriptive, kebab-case filename for the asset."
            },
            title: {
              type: Type.STRING,
              description: "A short, descriptive title for the concept art."
            },
            description: {
              type: Type.STRING,
              description: "A detailed description of the image for production reference."
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "A comprehensive list of searchable tags related to the image content."
            }
          },
          required: ["filename", "title", "description", "tags"]
        },
        temperature: 0.4,
      }
    });

    const text = response.text.trim();
    const metadata: ImageMetadata = JSON.parse(text);

    if (!metadata.filename || !metadata.title || !metadata.description || !Array.isArray(metadata.tags)) {
        throw new Error("AI returned an invalid data structure.");
    }
    
    // Clean up filename just in case
    metadata.filename = metadata.filename
      .toLowerCase()
      .replace(/`/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/--+/g, '-');

    return metadata;
    
  } catch (error) {
    console.error("Error generating metadata with Gemini:", error);
    if (error instanceof SyntaxError) {
      throw new Error("Could not parse the AI's response. Please try again.");
    }
    throw new Error("Could not analyze the image. Please try again or use a different image.");
  }
};