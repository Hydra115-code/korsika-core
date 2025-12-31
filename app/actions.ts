"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { searchGoogle } from "@/lib/search";

const apiKey = process.env.GOOGLE_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

// 👁️ ROAD ANALYSIS
export async function analyzeRoadImage(imageBase64: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
    if (prompt.match(/weather|price|time|date|news|traffic|score/i)) {
       try {
         const results = await searchGoogle(prompt);
         if (results?.length) googleData = results.slice(0, 1).map((r: any) => r.snippet).join(" | ");
       } catch (e) {}
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US');

    const systemPrompt = `
    You are Korsika (v2.5), Smart Travel Co-pilot.
    
    [DATA]
    - Time: ${timeStr}
    - GPS: ${userLocation || "Unknown"}
    - Info: ${googleData}
    - Notif: ${contextInfo || "None"}

    [🔥 ABSOLUTE RULE: FORCED NAVIGATION]
    The user is driving. Static maps are useless.
    ANY mention of a place or location implies intent to travel there.
    
    1. IF user asks "Where is X?", "Map of X", "Find X", "Go to X", "Location of X" -> YOU MUST OUTPUT: [NAV: X]
    2. NEVER output [LOC: ...]. It is forbidden. ALWAYS upgrade to [NAV: ...].
    
    [VOICE UI CONTROL]
    - "Close map", "Stop", "Hide" -> [UI: CLOSE_MAP]
    - "Open map", "Show route", "Back" -> [UI: OPEN_MAP]

    [OTHER COMMANDS]
    - Music: [MUSIC: Song]
    - WhatsApp: [WHATSAPP: Name]
    
    Response format: "Setting route to [Place]... [NAV: Place]"
    Be brief. Respond in English.

    User: ${prompt}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(systemPrompt);
    return result.response.text();

  } catch (error: any) {
    console.error(error);
    return "Systems rebooting..."; 
  }
}