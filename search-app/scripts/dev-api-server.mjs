// Local stand-in for Vercel's serverless function runtime, for `npm run dev`. Not a Vercel emulator
// -- `vercel dev` is that, and was tried first, but its Vite integration chokes on this project's
// index.html with an unrelated pre-existing error (Vite's import-analysis plugin, nothing to do
// with api/consultant.ts). This is the reliable alternative: a plain Node http server that mounts
// each api/*.ts file's NAMED per-HTTP-method export (Web-standard `(request: Request) => Response`),
// wired to Vite's dev server via the `/api` proxy in vite.config.ts. Dev-only -- production still
// gets api/*.ts served as real Vercel Functions per vercel.json; this file plays no part in that path.
//
// NAMED export, not `default`, and this is not a style choice: a `default` export was tried first
// and is silently WRONG on Vercel's actual runtime -- it's read as the legacy Node
// `(req, res) => void` signature, so a returned Response is discarded and the request hangs with no
// server-side error, just a WARN log. Only caught because this local server originally mirrored the
// same `default` mistake and never would have -- see api/consultant.ts's own comment on the fix.
// Importing the same named export here, not `default`, is what makes this server catch that class
// of bug locally instead of only in production.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';

// .env.local isn't loaded automatically outside Vite/Vercel's own tooling -- read it the same way
// this repo's own verification scripts already do.
try {
  const envLocal = readFileSync(path.join(root, '.env.local'), 'utf8');
  for (const line of envLocal.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  console.warn('[dev-api-server] no .env.local found -- api/consultant.ts will report missing env vars');
}

const { POST: consultantPost } = await import(pathToFileURL(path.join(root, 'api/consultant.ts')));
const { POST: deckHealthPost } = await import(pathToFileURL(path.join(root, 'api/deck-health.ts')));

// Keyed by `${method} ${path}`, matching Vercel's real per-method-export shape -- a request whose
// method has no matching export 404s here exactly like it would in production (no exported `GET`
// on this file, so a stray GET should fail the same way in both places).
const ROUTES = {
  'POST /api/consultant': consultantPost,
  'POST /api/deck-health': deckHealthPost,
};

const PORT = 3001;

const server = createServer(async (nodeReq, nodeRes) => {
  const handler = ROUTES[`${nodeReq.method} ${nodeReq.url ?? ''}`];
  if (!handler) {
    nodeRes.writeHead(404).end('Not found');
    return;
  }

  const chunks = [];
  for await (const chunk of nodeReq) chunks.push(chunk);
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  const webReq = new Request(`http://localhost:${PORT}${nodeReq.url}`, {
    method: nodeReq.method,
    headers: new Headers(Object.entries(nodeReq.headers).filter(([, v]) => typeof v === 'string')),
    body,
  });

  try {
    const webRes = await handler(webReq);
    nodeRes.writeHead(webRes.status, Object.fromEntries(webRes.headers));
    nodeRes.end(await webRes.text());
  } catch (err) {
    console.error('[dev-api-server] handler threw:', err);
    nodeRes.writeHead(500).end(JSON.stringify({ error: 'dev-api-server internal error' }));
  }
});

server.listen(PORT, () => {
  console.log(`[dev-api-server] serving api/*.ts on http://localhost:${PORT} -- run alongside \`npm run dev\``);
});
