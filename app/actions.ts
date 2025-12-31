"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { searchGoogle } from "@/lib/search";

const apiKey = process.env.GOOGLE_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

// 👁️ ROAD ANALYSIS
export async function analyzeRoadImage(imageBase64: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const result = await model.generateContent([
      "You are a safety co-pilot. If the image is safe, respond ONLY 'SAFE'. If there is danger (crash, pedestrian, red light), describe the danger in 3 words.",
      { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text();
    return text.includes("SAFE") ? null : text;
  } catch (error) {
    return null;
  }
}

// MAIN CHAT
export async function askGemini(prompt: string, userLocation?: string, contextInfo?: string) {
  try {
    let googleData = "";
    // Translated keywords to trigger Google Search
    if (prompt.match(/weather|price|time|date|news|traffic|score/i)) {
       try {
         const results = await searchGoogle(prompt);
         if (results?.length) googleData = results.slice(0, 1).map((r: any) => r.snippet).join(" | ");
       } catch (e) {}
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US');

    const systemPrompt = `
    You are Korsika (v2.5), Smart Travel Co-pilot (Cyberpunk Style).
    
    [DATA]
    - Time: ${timeStr}
    - GPS: ${userLocation || "Unknown"}
    - Info: ${googleData}
    - Notif: ${contextInfo || "None"}

    [COMMANDS - USE THESE AT THE END OF YOUR RESPONSE]
    1. ROUTE: "Plotting route to [Dest]" -> [NAV: Dest]
    2. LOCATION: "Map of [Place]" -> [LOC: Place]
    3. MUSIC: "Playing [Song] on Spotify" -> [MUSIC: Song]
    4. WHATSAPP: "Message sent to [Name]" -> [WHATSAPP: Name]
    5. INTERFACE:
       - If asked to close/hide map: "Closing map." -> [UI: CLOSE_MAP]
       - If asked to open/show map: "Opening map." -> [UI: OPEN_MAP]
    
    Be brief, helpful, and have a cool personality. Respond in English.

    User: ${prompt}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(systemPrompt);
    return result.response.text();

  } catch (error: any) {
    console.error(error);
    return "Systems rebooting..."; 
  }
}