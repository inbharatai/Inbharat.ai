/// <reference types="vite/client" />

// Ensures import.meta.glob (used by content/articles.body.ts) and the ?raw
// query typecheck under this project's tsconfig (which sets "types": ["node"]
// and would otherwise not pull in vite/client). The (import.meta as any).env
// casts used elsewhere in the codebase remain harmless.