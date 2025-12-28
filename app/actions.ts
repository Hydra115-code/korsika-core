"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { searchGoogle } from "@/lib/search";

const apiKey = process.env.GOOGLE_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

// 👁️ NUEVA FUNCIÓN: ANÁLISIS DE CARRETERA (DRIVER MODE)
export async function analyzeRoadImage(imageBase64: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // Limpiamos el formato base64 para que Gemini lo entienda
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const prompt = `
      Eres Korsika en MODO COPILOTO DE SEGURIDAD. Analiza esta vista de la carretera en tiempo real.
      
      TU MISIÓN:
      Detecta riesgos inmediatos para el conductor.
      - Distancia del auto de enfrente.
      - Semáforos (Rojo/Verde).
      - Peatones o ciclistas peligrosos.
      - Señales de tráfico importantes.

      RESPUESTA (SOLO SI HAY ALGO QUE DECIR):
      - Si todo es normal/seguro, responde: "SAFE" (y nada más).
      - Si hay riesgo o algo notable, responde con una frase CORTA y ALERTA para ser leída en voz alta.
      Ejemplo: "Cuidado, el auto rojo frenó." o "Semáforo en rojo adelante."
    `;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text();
    return text.includes("SAFE") ? null : text; // Si es seguro, no decimos nada para no molestar.

  } catch (error) {
    console.error("Error visión:", error);
    return null;
  }
}

// TU FUNCIÓN DE CHAT NORMAL (CON GPS)
export async function askGemini(prompt: string, userLocation?: string) {
  try {
    let googleData = "";
    // Solo buscamos si la pregunta lo amerita
    if (prompt.match(/hora|clima|tiempo|fecha|donde|quien|precio|noticia|cuanto cuesta|buscar|llegar|ruta|camino/i)) {
        try {
            const results = await searchGoogle(prompt);
            if (results?.length) googleData = results.slice(0, 2).map((r: any) => r.snippet).join(" | ");
        } catch (e) { console.log("Salto búsqueda."); }
    }

    const now = new Date();
    const fechaStr = now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const horaStr = now.toLocaleTimeString('es-MX');

    const context = `
    Eres Korsika (v2.5), Copiloto de Viaje Inteligente.
    
    [SISTEMA]
    - Fecha: ${fechaStr} | Hora: ${horaStr}
    - Info Web: ${googleData || "N/A"}
    - Ubicación (GPS): ${userLocation ? userLocation : "Desconocida"}

    [MODOS DE RESPUESTA]
    1. Si piden RUTA/IR: Usa [NAV: Destino, Ciudad].
    2. Si piden UBICACIÓN: Usa [LOC: Lugar].
    3. Si piden IMAGEN: Usa [IMG: descripción].
    
    Sé breve, carismática y útil. Eres una copiloto humana, no un robot.

    Usuario: ${prompt}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(context);
    return result.response.text();

  } catch (error: any) {
    return "Reconectando sistemas..."; 
  }
}