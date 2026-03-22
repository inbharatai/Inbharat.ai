# Copilot Instructions — InBharat AI + Agent Arcade

## Project Overview
This is the InBharat AI multi-agent search platform (React + TypeScript + Vite + Vercel).
The `agent-arcade/` subfolder contains the Agent Arcade telemetry gateway for visualizing AI agent activity in real-time.

## Agent Arcade Integration
- **Gateway**: http://localhost:8787 (Bun + Socket.IO telemetry server)
- **Dashboard**: http://localhost:4000 (Next.js real-time visualizer)
- **Live Emitter**: Watches this workspace and streams edits/tool-calls to the Arcade dashboard

### How to Start Arcade
Run the VS Code task **"Arcade: Start All"** or:
```
npm run arcade
```

### Architecture
```
InBharat AI (this workspace)
  ├── Your AI app code (untouched)
  └── agent-arcade/          # Telemetry layer (cloned separately)
       ├── packages/gateway/  # Ingestion server :8787
       ├── packages/web/      # Dashboard :4000
       └── packages/sdk-node/ # Node.js telemetry SDK
```

## Coding Conventions
- Agents live in `services/agents/` and extend `BaseAgent`
- API routes are Vercel serverless functions in `api/`
- Chat pipeline utilities are in `lib/orchestration/` (router, memory, types)
- Do NOT modify existing agent code when integrating telemetry
- Any arcade-related code goes in `agent-arcade/` only
