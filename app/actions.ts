"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { searchGoogle } from "@/lib/search";

const apiKey = process.env.GOOGLE_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

// 👁️ ANÁLISIS DE CARRETERA
export async function analyzeRoadImage(imageBase64: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const result = await model.generateContent([
      "Eres un copiloto de seguridad. Si la imagen es segura, responde SOLO 'SAFE'. Si hay peligro (choque, peatón), describe el peligro en 3 palabras.",
      { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text();
    return text.includes("SAFE") ? null : text;
  } catch (error) {
    return null;
  }
}

// CHAT PRINCIPAL
export async function askGemini(prompt: string, userLocation?: string, contextInfo?: string) {
  try {
    let googleData = "";
    if (prompt.match(/clima|precio|hora|fecha|noticia/i)) {
       try {
         const results = await searchGoogle(prompt);
         if (results?.length) googleData = results.slice(0, 1).map((r: any) => r.snippet).join(" | ");
       } catch (e) {}
    }

    const now = new Date();
    const horaStr = now.toLocaleTimeString('es-MX');

    const systemPrompt = `
    Eres Korsika (v2.5), Copiloto de Viaje Inteligente (Estilo Cyberpunk).
    
    [DATOS]
    - Hora: ${horaStr}
    - GPS: ${userLocation || "Desconocida"}
    - Info: ${googleData}
    - Notif: ${contextInfo || "Ninguna"}

    [COMANDOS - ÚSALOS AL FINAL DE TU RESPUESTA]
    1. RUTA: "Trazando ruta a [Destino]" -> [NAV: Destino]
    2. UBICACIÓN: "Mapa de [Lugar]" -> [LOC: Lugar]
    3. MÚSICA: "Poniendo [Canción] en Spotify" -> [MUSIC: Canción]
    4. WHATSAPP: "Mensaje enviado a [Nombre]" -> [WHATSAPP: Nombre]
    5. INTERFAZ:
       - Si piden cerrar/quitar mapa: "Cerrando mapa." -> [UI: CLOSE_MAP]
       - Si piden abrir/mostrar mapa: "Abriendo mapa." -> [UI: OPEN_MAP]
    
    Sé breve, útil y con personalidad.

    Usuario: ${prompt}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(systemPrompt);
    return result.response.text();

  } catch (error: any) {
    console.error(error);
    return "Sistemas reiniciando..."; 
  }
}