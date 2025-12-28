export async function searchGoogle(query: string) {
  const apiKey = process.env.SERPAPI_KEY;
  
  if (!apiKey) {
    console.error("Falta SERPAPI_KEY en .env.local");
    return [];
  }

  try {
    // Buscamos en Google Real (México/Español)
    const res = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&engine=google&hl=es&gl=mx&num=5`
    );

    const data = await res.json();

    // 1. Datos de Conocimiento Directo (Knowledge Graph)
    const knowledge = data.knowledge_graph ? [{
        title: data.knowledge_graph.title || "Dato directo",
        snippet: data.knowledge_graph.description || "",
        link: data.knowledge_graph.source?.link || ""
    }] : [];

    // 2. Resultados web
    const organic = data.organic_results ? data.organic_results.map((item: any) => ({
        title: item.title,
        snippet: item.snippet,
        link: item.link,
    })) : [];

    return [...knowledge, ...organic];
  } catch (error) {
    console.error("Error SerpAPI:", error);
    return [];
  }
}