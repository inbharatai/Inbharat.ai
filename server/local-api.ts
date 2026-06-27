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
// Mark the local-dev shim so api/lib/requireAdmin.ts can recognize local dev
// (LOCAL_API_PORT is the shared signal it checks) and allow-through admin
// endpoints without a configured Supabase service role. Never set in prod.
process.env.LOCAL_API_PORT = String(PORT);

async function runHandler(
  path: string,
  req: express.Request,
  res: express.Response
) {
  // Cast to VercelRequest: local-api is a dev-only shim; the actual handlers only
  // access .method, .headers, and .body so this partial shape is safe at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vercelStyleReq = {
    method: req.method,
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: req.body,
    query: req.query,
  } as any;
  try {
    if (path === "/api/chat") {
      debugLog("local-api:runHandler", "before chat handler", {
        path,
        openaiSet: !!process.env.OPENAI_API_KEY,
      });
      const mod = await import("../api/chat.ts");
      const handler = mod.default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await handler(vercelStyleReq, res as any);
    } else if (path === "/api/search") {
      const mod = await import("../api/search.ts");
      const handler = mod.default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await handler(vercelStyleReq, res as any);
    } else if (growthHandlers[path as keyof typeof growthHandlers]) {
      const mod = await growthHandlers[path as keyof typeof growthHandlers]();
      const handler = mod.default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await handler(vercelStyleReq, res as any);
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

// InBharat Growth Agent routes (additive; chat/search untouched).
const growthHandlers = {
  "/api/growth/status": () => import("../api/growth/status.ts"),
  "/api/growth/pages": () => import("../api/growth/pages.ts"),
  "/api/growth/runs": () => import("../api/growth/runs.ts"),
  "/api/growth/audit": () => import("../api/growth/audit.ts"),
  "/api/growth/crawl": () => import("../api/growth/crawl.ts"),
  "/api/growth/performance": () => import("../api/growth/performance.ts"),
  "/api/growth/promote": () => import("../api/growth/promote.ts"),
  "/api/growth/approvals": () => import("../api/growth/approvals.ts"),
  "/api/growth/whoami": () => import("../api/growth/whoami.ts"),
  "/api/growth/usage": () => import("../api/growth/usage.ts"),
  "/api/growth/budget": () => import("../api/growth/budget.ts"),
  "/api/growth/insights": () => import("../api/growth/insights.ts"),
  "/api/growth/registry": () => import("../api/growth/registry.ts"),
  "/api/growth/rules": () => import("../api/growth/rules.ts"),
  "/api/growth/github": () => import("../api/growth/github.ts"),
  "/api/growth/inbox": () => import("../api/growth/inbox.ts"),
  "/api/growth/publish": () => import("../api/growth/publish.ts"),
  "/api/growth/outcomes": () => import("../api/growth/outcomes.ts"),
  "/api/growth/discovery": () => import("../api/growth/discovery.ts"),
  "/api/growth/cron/daily": () => import("../api/growth/cron/daily.ts"),
};
app.get("/api/growth/status", (req, res) => runHandler("/api/growth/status", req, res));
app.get("/api/growth/pages", (req, res) => runHandler("/api/growth/pages", req, res));
app.get("/api/growth/runs", (req, res) => runHandler("/api/growth/runs", req, res));
app.post("/api/growth/audit", (req, res) => runHandler("/api/growth/audit", req, res));
app.post("/api/growth/crawl", (req, res) => runHandler("/api/growth/crawl", req, res));
app.get("/api/growth/performance", (req, res) => runHandler("/api/growth/performance", req, res));
app.post("/api/growth/promote", (req, res) => runHandler("/api/growth/promote", req, res));
app.get("/api/growth/approvals", (req, res) => runHandler("/api/growth/approvals", req, res));
app.post("/api/growth/approvals", (req, res) => runHandler("/api/growth/approvals", req, res));
app.get("/api/growth/whoami", (req, res) => runHandler("/api/growth/whoami", req, res));
app.get("/api/growth/usage", (req, res) => runHandler("/api/growth/usage", req, res));
app.get("/api/growth/budget", (req, res) => runHandler("/api/growth/budget", req, res));
app.patch("/api/growth/budget", (req, res) => runHandler("/api/growth/budget", req, res));
app.get("/api/growth/insights", (req, res) => runHandler("/api/growth/insights", req, res));
app.get("/api/growth/registry", (req, res) => runHandler("/api/growth/registry", req, res));
app.post("/api/growth/registry", (req, res) => runHandler("/api/growth/registry", req, res));
app.patch("/api/growth/registry", (req, res) => runHandler("/api/growth/registry", req, res));
app.delete("/api/growth/registry", (req, res) => runHandler("/api/growth/registry", req, res));
app.get("/api/growth/rules", (req, res) => runHandler("/api/growth/rules", req, res));
app.post("/api/growth/rules", (req, res) => runHandler("/api/growth/rules", req, res));
app.patch("/api/growth/rules", (req, res) => runHandler("/api/growth/rules", req, res));
app.delete("/api/growth/rules", (req, res) => runHandler("/api/growth/rules", req, res));
app.post("/api/growth/github", (req, res) => runHandler("/api/growth/github", req, res));
app.get("/api/growth/inbox", (req, res) => runHandler("/api/growth/inbox", req, res));
app.post("/api/growth/inbox", (req, res) => runHandler("/api/growth/inbox", req, res));
app.delete("/api/growth/inbox", (req, res) => runHandler("/api/growth/inbox", req, res));
app.post("/api/growth/publish", (req, res) => runHandler("/api/growth/publish", req, res));
app.get("/api/growth/outcomes", (req, res) => runHandler("/api/growth/outcomes", req, res));
app.post("/api/growth/outcomes", (req, res) => runHandler("/api/growth/outcomes", req, res));
app.get("/api/growth/discovery", (req, res) => runHandler("/api/growth/discovery", req, res));
app.post("/api/growth/discovery", (req, res) => runHandler("/api/growth/discovery", req, res));
// Cron accepts GET (Vercel scheduled cron) + POST (manual/admin "Run now").
app.get("/api/growth/cron/daily", (req, res) => runHandler("/api/growth/cron/daily", req, res));
app.post("/api/growth/cron/daily", (req, res) => runHandler("/api/growth/cron/daily", req, res));

// 404 for other /api
app.use("/api", (_, res) => res.status(404).json({ ok: false, code: "SERVER_ERROR" }));

createServer(app).listen(PORT, () => {
  console.log(`Local API server: http://localhost:${PORT}`);
  console.log("  POST /api/chat, POST /api/search, /api/growth/* (admin)");
  if (!process.env.OPENAI_API_KEY) console.warn("  OPENAI_API_KEY not set — chat will fail.");
  if (!process.env.SERPER_API_KEY) console.warn("  SERPER_API_KEY not set — search will fail.");
});
