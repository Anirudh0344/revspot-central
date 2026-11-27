// Production server for Revspot Central (Docker / Marketplace). `npm run dev` does not use it.
//
// Runs Next.js behind a thin wrapper that makes the app work under a path prefix
// (Marketplace serves it at /p/{slug}/) however the platform forwards requests:
//
//   - Prefix stripped by the platform (/deals instead of /p/cs-dashboard-1/deals):
//     put it back, since Next.js was built with that basePath and 404s without it.
//   - The bare app root: Marketplace redirects /p/{slug} to /p/{slug}/, while
//     Next.js redirects /p/{slug}/ back to /p/{slug}. Left alone the two bounce
//     forever, so both forms are served directly with no redirect.
//
// The prefix comes from the build (.next/required-server-files.json), so this file
// never names a slug.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import next from 'next';

const port = Number(process.env.PORT || 80);
const hostname = process.env.HOSTNAME || '0.0.0.0';

let base = '';
try {
  const files = JSON.parse(readFileSync(new URL('./.next/required-server-files.json', import.meta.url), 'utf8'));
  base = files.config?.basePath ?? '';
} catch {
  base = '';
}

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

function normalise(url) {
  if (!base) return url;
  const q = url.indexOf('?');
  let path = q === -1 ? url : url.slice(0, q);
  const query = q === -1 ? '' : url.slice(q);
  if (!(path === base || path.startsWith(`${base}/`))) path = `${base}${path === '/' ? '' : path}`;
  if (path === `${base}/`) path = base;
  return path + query;
}

createServer((req, res) => {
  req.url = normalise(req.url || '/');
  handle(req, res);
}).listen(port, hostname, () => {
  console.log(`Revspot Central on http://${hostname}:${port}${base || '/'}`);
});
