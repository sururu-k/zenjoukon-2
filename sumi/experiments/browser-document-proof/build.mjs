import { mkdtemp, cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const here = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2] ? resolve(process.argv[2]) : join(here, 'dist');
const temp = await mkdtemp(join(tmpdir(), 'sumi-web-circuit-'));
try {
  await cp(join(here, '../../noir/document_absence_v2'), temp, {recursive:true});
  const result = spawnSync(process.env.SUMI_NARGO || 'nargo', ['compile', '--program-dir', temp], {encoding:'utf8', timeout:120000});
  if (result.status !== 0) throw new Error(`nargo compile failed: ${result.stderr || result.error}`);
  await mkdir(output, {recursive:true});
  await cp(join(here, 'public'), output, {recursive:true});
  await copyFile(join(temp, 'target/document_absence_v2.json'), join(output, 'circuit.json'));
  await copyFile(join(here, '../../src/school-policy.example.json'), join(output, 'school-policy.example.json'));
  await copyFile(join(here, '../../src/school-policy-contract.js'), join(output, 'school-policy-contract.js'));
  for (const [pkg, name] of [['acvm_js','acvm_js_bg.wasm'],['noirc_abi','noirc_abi_wasm_bg.wasm']]) {
    const {readdir} = await import('node:fs/promises');
    async function find(dir) { for (const e of await readdir(dir, {withFileTypes:true})) { const p = join(dir,e.name); if (e.isFile() && e.name === name) return p; if (e.isDirectory()) { const found = await find(p); if (found) return found; } } }
    const path = await find(join(here, 'node_modules/@noir-lang', pkg)); if (!path) throw new Error(`Missing ${name}`); await copyFile(path, join(output, name));
  }
  await build({entryPoints:[join(here, 'worker.js')], bundle:true, platform:'browser', format:'esm', outfile:join(output, 'worker.js')});
  console.log(`Built ${output}`);
} finally { await rm(temp, {recursive:true,force:true}); }
