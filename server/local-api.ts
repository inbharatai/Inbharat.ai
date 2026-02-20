/**
 * Local API server for development without Vercel.
 * Serves /api/chat and /api/search. Load .env for OPENAI_API_KEY and SERPER_API_KEY.
 * Run: npx tsx server/local-api.ts
 * Then run Vite with proxy to http://localhost:3001 (see vite.config and package.json "dev:local").
 */
import express from "express";
import { createServer } from "http";
import { readFileSync, appendFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEBUG_LOG = resolve(ROOT, ".cursor", "debug.log");

function debugLog(location: string, message: string, data: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "production") return;
  try {
    const line = `${new Date().toISOString()} [${location}] ${message} ${JSON.stringify(data)}\n`;
    mkdirSync(resolve(ROOT, ".cursor"), { recursive: true });
    appendFileSync(DEBUG_LOG, line);
  } catch {
    // ignore
  }
}

// Load .env from project root (same as Vercel)
function loadEnv() {
  const envPath = resolve(ROOT, ".env");
  try {
    const env = readFileSync(envPath, "utf8");
    for (const line of env.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eq = trimmed.indexOf("=");
        if (eq > 0) {
          const key = trimmed.slice(0, eq).trim();
          const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) process.env[key] = value;
        }
      }
    }
  } catch {
    // .env optional
  }
  debugLog("local-api:loadEnv", "after loadEnv", {
    envPath,
    openaiSet: !!process.env.OPENAI_API_KEY,
    serperSet: !!process.env.SERPER_API_KEY,
  });
}
loadEnv();

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.LOCAL_API_PORT) || 3001;

async function runHandler(
  path: string,
  req: express.Request,
  res: express.Response
) {
  const vercelStyleReq = {
    method: req.method,
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: req.body,
  };
  try {
    if (path === "/api/chat") {
      debugLog("local-api:runHandler", "before chat handler", {
        path,
        openaiSet: !!process.env.OPENAI_API_KEY,
      });
      const mod = await import("../api/chat.ts");
      const handler = mod.default;
      await handler(vercelStyleReq, res);
    } else if (path === "/api/search") {
      const mod = await import("../api/search.ts");
      const handler = mod.default;
      await handler(vercelStyleReq, res);
    } else {
      res.status(404).json({ ok: false, code: "SERVER_ERROR" });
    }
  } catch (err) {
    debugLog("local-api:runHandler", "catch", {
      path,
      errMessage: (err as Error)?.message,
    });
    console.error(path, err);
    res.status(500).json({ ok: false, code: "SERVER_ERROR" });
  }
}

app.post("/api/chat", (req, res) => runHandler("/api/chat", req, res));
app.post("/api/search", (req, res) => runHandler("/api/search", req, res));

// 404 for other /api
app.use("/api", (_, res) => res.status(404).json({ ok: false, code: "SERVER_ERROR" }));

createServer(app).listen(PORT, () => {
  console.log(`Local API server: http://localhost:${PORT}`);
  console.log("  POST /api/chat, POST /api/search");
  if (!process.env.OPENAI_API_KEY) console.warn("  OPENAI_API_KEY not set — chat will fail.");
  if (!process.env.SERPER_API_KEY) console.warn("  SERPER_API_KEY not set — search will fail.");
});
