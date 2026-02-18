export function getRequestId(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const id = req.headers?.["x-vercel-id"] ?? req.headers?.["x-request-id"];
  if (typeof id === "string") return id;
  if (Array.isArray(id) && id[0]) return id[0];
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function log(requestId: string, message: string, meta?: Record<string, unknown>): void {
  const payload = { requestId, message, ...meta };
  console.log(JSON.stringify(payload));
}
