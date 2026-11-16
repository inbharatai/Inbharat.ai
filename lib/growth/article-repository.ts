import { planArticlePublication, type ArticleInput } from './article-publication.js';

export type RepositoryRequest = (path: string, method?: string, body?: unknown) => Promise<unknown>;
type GitObject = { sha: string; tree?: { sha: string }; object?: { sha: string } };

/** One commit publishes body + manifest together. Pinned reads and non-force ref
 * update reject concurrent edits instead of losing another editor's changes. */
export async function commitArticleSnapshot(request: RepositoryRequest, input: ArticleInput, body: string, now: string): Promise<{ commitSha: string; skipped: boolean }> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) throw new Error('Invalid article slug');
  const ref = await request('/git/ref/heads/main') as GitObject;
  const parent = ref.object?.sha;
  if (!parent) throw new Error('Missing repository head');
  const commit = await request(`/git/commits/${parent}`) as GitObject;
  if (!commit.tree?.sha) throw new Error('Missing repository tree');
  const read = async (path: string): Promise<string | null> => {
    const result = await request(`/contents/${path}?ref=${parent}`) as { content?: string; encoding?: string } | null;
    if (result === null) return null;
    if (result.encoding !== 'base64' || typeof result.content !== 'string') throw new Error('Repository file is not readable base64');
    return Buffer.from(result.content, 'base64').toString('utf8');
  };
  const metaPath = 'content/articles.meta.ts';
  const mdPath = `content/articles/${input.slug}.md`;
  const source = await read(metaPath);
  if (!source) throw new Error('Missing article manifest');
  const oldBody = await read(mdPath);
  const planned = planArticlePublication(source, input, oldBody, body, now);
  if (!planned.changed) return { commitSha: parent, skipped: true };
  const tree = await request('/git/trees', 'POST', {
    base_tree: commit.tree.sha,
    tree: [{ path: mdPath, mode: '100644', type: 'blob', content: body }, { path: metaPath, mode: '100644', type: 'blob', content: planned.source }],
  }) as GitObject;
  if (!tree.sha) throw new Error('Missing new tree SHA');
  const next = await request('/git/commits', 'POST', { message: `article: publish repository snapshot ${input.slug} (human-gated)`, tree: tree.sha, parents: [parent] }) as GitObject;
  if (!next.sha) throw new Error('Missing new commit SHA');
  await request('/git/refs/heads/main', 'PATCH', { sha: next.sha, force: false });
  return { commitSha: next.sha, skipped: false };
}

/** Called only by the admin-approved publish route, never by builds/tests. */
export async function publishArticleToRepository(input: ArticleInput, body: string): Promise<{ ok: boolean; commitSha?: string; skipped?: boolean; needsToken?: boolean; error?: string }> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) return { ok: false, needsToken: true, error: 'GitHub write token is not configured' };
  let needsToken = false;
  const request: RepositoryRequest = async (path, method = 'GET', payload) => {
    const response = await fetch(`https://api.github.com/repos/inbharatai/Inbharat.ai${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'inbharat-growth-agent' },
      ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(30000),
    });
    if (response.status === 404 && method === 'GET' && path.startsWith('/contents/content/articles/')) return null;
    if (!response.ok) {
      needsToken = response.status === 401 || response.status === 403;
      // Never return remote bodies (which can include secret-bearing request context).
      throw new Error(`GitHub ${method} failed (${response.status}); repository snapshot not confirmed. Retry after checking branch permissions/concurrent changes.`);
    }
    return response.json();
  };
  try { return { ok: true, ...await commitArticleSnapshot(request, input, body, new Date().toISOString()) }; }
  catch (error) { return { ok: false, needsToken, error: error instanceof Error ? error.message : 'Repository publication failed' }; }
}
