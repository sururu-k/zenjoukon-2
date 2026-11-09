// 見えないアンケート（実通信版）。
// 集計担当A・Bを別々のHTTPサーバーとして起動し、各担当は自分宛てのシェアしか受け取らない。
// 回答者のブラウザが回答を2つのシェアに分け、Aに片方、Bにもう片方を送る。
// 注意: 1つのプロセスで両方を起動するのはデモのため。実運用では別の管理者・別の端末が必要。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createVerifiedSurveyCollector } from '../src/secure/verified-survey.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORTS = { web: Number(process.env.LIVE_WEB_PORT || 4190), A: Number(process.env.LIVE_A_PORT || 4191), B: Number(process.env.LIVE_B_PORT || 4192) };
const CAMPAIGN = 'sumi-survey-live';
const ORIGIN = `http://127.0.0.1:${PORTS.web}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'content-type', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 4096) throw new Error('too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function startCollector(party, port) {
  const collector = createVerifiedSurveyCollector(party, CAMPAIGN);
  let held = []; // この担当が実際に保管しているもの。乱数にしか見えないことを画面で示すために公開する。
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return json(res, 204, {});
      const path = new URL(req.url, 'http://x').pathname;
      if (req.method === 'POST' && path === '/share') {
        const packet = await readBody(req);
        const count = await collector.receive(packet);
        held.push({ batch: packet.batch, share: packet.value });
        return json(res, 200, { count });
      }
      if (req.method === 'GET' && path === '/status') return json(res, 200, { party, count: collector.count, phase: collector.phase });
      if (req.method === 'GET' && path === '/held') return json(res, 200, { party, held });
      if (req.method === 'POST' && path === '/publish') {
        const total = await collector.publish();
        held = held.map((h) => ({ batch: h.batch, share: h.share })); // 確定後も記録は残す（共謀デモ用）
        return json(res, 200, total);
      }
      return json(res, 404, { error: 'not found' });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

export async function startWeb(port) {
  const bundle=await build({entryPoints:['vote.js','organizer.js'].map(name=>resolve(ROOT,'survey-live/public',name)),bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,outdir:'survey-live-bundle',external:['module','node:module','node:fs','node:fs/promises','node:url','node:path','node:crypto']});
  const modules=new Map(bundle.outputFiles.map(file=>['/'+file.path.split('/').pop(),file.contents]));
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x').pathname;
      if(modules.has(url)){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(modules.get(url));return;}
      const base = url.startsWith('/src/') ? resolve(ROOT, 'src') : resolve(ROOT, 'survey-live/public');
      const rel = url.startsWith('/src/') ? url.slice(5) : (url === '/' ? 'vote.html' : url.slice(1));
      const file = resolve(base, rel);
      if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
      if (url.startsWith('/src/') && !/^(secure\/(mpc|numeric)\.js|crypto\.js|mark\.svg|suite\.css)$/.test(rel)) { res.writeHead(404).end(); return; }
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(content);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ページが見つかりません。'); }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await startCollector('A', PORTS.A); await startCollector('B', PORTS.B); await startWeb(PORTS.web);
  console.log(`回答する画面: ${ORIGIN}/vote.html\n集める人の画面: ${ORIGIN}/organizer.html\n集計担当A: 127.0.0.1:${PORTS.A}  集計担当B: 127.0.0.1:${PORTS.B}（同一プロセスのデモ）`);
}
