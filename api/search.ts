import type { VercelRequest, VercelResponse } from "@vercel/node";

const SERPER_URL = "https://google.serper.dev/search";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = process.env.SERPER_API_KEY;
  if (!key) {
    return res.status(401).json({ error: "SERPER_API_KEY not configured", organic: [] });
  }

  let body: { q?: string };
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid JSON body", organic: [] });
  }

  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (!q) {
    return res.status(400).json({ error: "Missing or empty query 'q'", organic: [] });
  }

  try {
    const response = await fetch(SERPER_URL, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 8 }),
    });
    const data = await response.json();
    const organic = Array.isArray(data.organic) ? data.organic : [];
    return res.status(200).json({ organic, ...data });
  } catch (err) {
    console.error("Serper proxy error:", err);
    return res.status(502).json({ error: "Search service unavailable", organic: [] });
  }
}
