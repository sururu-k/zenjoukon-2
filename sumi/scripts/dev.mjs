import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
await import('./build.mjs');
const root = resolve(new URL('../dist/', import.meta.url).pathname);
const port = Number(process.env.SUMI_PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm':'application/wasm' };
createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const target = path === root ? resolve(root, 'index.html') : path;
    const content = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ページが見つかりません。'); }
}).listen(port, '127.0.0.1', () => console.log(`Sumi: http://127.0.0.1:${port}`));
