import { mkdtemp, cp, copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'sumi-browser-zk-'));
let server, browser;
try {
  await cp(join(here, '../../noir/document_absence_v2'), join(temp, 'circuit'), { recursive: true });
  const result = spawnSync(process.env.SUMI_NARGO || 'nargo', ['compile', '--program-dir', join(temp, 'circuit')], { encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(`nargo compile failed: ${result.stderr || result.error}`);
  await copyFile(join(temp, 'circuit/target/document_absence_v2.json'), join(temp, 'circuit.json'));
  await copyFile(join(here, 'sample-input.json'), join(temp, 'sample-input.json'));
  for (const [pkg, name] of [['acvm_js', 'acvm_js_bg.wasm'], ['noirc_abi', 'noirc_abi_wasm_bg.wasm']]) {
    const root = join(here, 'node_modules/@noir-lang', pkg);
    const { readdir } = await import('node:fs/promises');
    async function find(dir) { for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isFile() && e.name === name) return p; if (e.isDirectory()) { const found = await find(p); if (found) return found; } } }
    const source = await find(root); if (!source) throw new Error(`Missing ${name}`); await copyFile(source, join(temp, name));
  }
  await build({ entryPoints: [join(here, 'browser.js')], bundle: true, platform: 'browser', format: 'esm', outfile: join(temp, 'bundle.js'), logLevel: 'silent' });
  await writeFile(join(temp, 'index.html'), '<!doctype html><title>Fixture test</title><script type="module" src="/bundle.js"></script>');
  const files = new Set(['index.html', 'bundle.js', 'circuit.json', 'sample-input.json', 'acvm_js_bg.wasm', 'noirc_abi_wasm_bg.wasm']);
  server = createServer(async (req, res) => { const name = req.url === '/' ? 'index.html' : req.url.slice(1); if (!files.has(name)) { res.writeHead(404).end(); return; } try { const data = await readFile(join(temp, name)); res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : 'text/html'); res.end(data); } catch { res.writeHead(500).end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.SUMI_CHROMIUM ? { executablePath: process.env.SUMI_CHROMIUM } : {}) });
  const page = await browser.newPage();
  const remote = [];
  page.on('request', request => { if (!request.url().startsWith(`http://127.0.0.1:${server.address().port}/`)) remote.push(`${request.method()} ${request.url()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof window.runExperiment === 'function');
  const outcome = await page.evaluate(() => window.runExperiment());
  assert.deepEqual(outcome, { valid: true, openingValid: true, wrongOpeningRejected: true, proofTamperRejected: true, forgedStatementsRejected: true, nulAliasRejected: true, tamperedRejected: true, badWitnessRejected: true, crossOriginIsolated: false });
  assert.ok(remote.length > 0 && remote.every(x => /^GET https:\/\/crs\.aztec-(cdn\.foundation|labs\.com)\/(g1_compressed|g2|grumpkin_g1_v2)\.dat$/.test(x)), `Unexpected external request: ${remote.join(', ')}`);
  console.log('Browser proof verified; forged statements, altered proof, padded-document alias, and invalid witness rejected. SharedArrayBuffer isolation: off.');
  console.log('External requests:', remote.join(', '));
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); }
