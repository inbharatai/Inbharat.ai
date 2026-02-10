import type { VercelRequest, VercelResponse } from "@vercel/node";

const SERPER_NEWS_URL = "https://google.serper.dev/news";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", articles: [] });
  }

  const key = process.env.SERPER_API_KEY;
  if (!key) {
    return res.status(200).json({ articles: [], message: "SERPER_API_KEY not configured" });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "trending news India";
  try {
    const response = await fetch(SERPER_NEWS_URL, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 6 }),
    });
    const data = await response.json();
    const news = Array.isArray(data.news) ? data.news : [];
    const articles = news.slice(0, 6).map((n: any) => ({
      title: n.title || "",
      summary: n.snippet || n.description || "",
      url: n.link || "#",
      category: n.source || "General",
    }));
    return res.status(200).json({ articles });
  } catch (err) {
    console.error("Serper news proxy error:", err);
    return res.status(200).json({ articles: [], message: "News temporarily unavailable" });
  }
}
