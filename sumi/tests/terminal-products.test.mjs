import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (args, input = '') => spawnSync(process.execPath, ['scripts/sumi.mjs', ...args], { cwd: root, input, encoding: 'utf8' });
test('端末の3製品が確認後に保存し、拒否・上書き・証明改変を扱う', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sumi-cli-'));
  try {
    const write = join(dir, 'write.json'), gate = join(dir, 'gate.json'), proof = join(dir, 'proof.json');
    assert.equal(run(['write', 'examples/write.json', write], 'no\n').status, 1);
    await assert.rejects(readFile(write));
    const w = run(['write', 'examples/write.json', write], 'yes\n');
    assert.equal(w.status, 0, w.stderr);
    const signed = JSON.parse(await readFile(write, 'utf8'));
    assert.ok(!JSON.stringify(signed).includes('この欄は本文には使いません'));
    assert.equal(run(['verify-share', write]).status, 0);
    assert.equal(run(['verify-share', write, '0'.repeat(64)]).status, 2);
    assert.equal(run(['write', 'examples/write.json', write], 'yes\n').status, 1);
    const g = run(['gate', 'examples/gate.txt', gate], 'yes\n');
    assert.equal(g.status, 0, g.stderr);
    assert.ok(!JSON.stringify(JSON.parse(await readFile(gate, 'utf8'))).includes('sample@example.test'));
    const p = run(['prove', 'examples/prove.json', proof], 'yes\n');
    assert.equal(p.status, 0, p.stderr);
    assert.equal(run(['verify', proof]).status, 0);
    const changed = JSON.parse(await readFile(proof, 'utf8'));
    assert.equal(changed.sum, 60);
    assert.ok(!('values' in changed));
    changed.sum++;
    await writeFile(proof, JSON.stringify(changed));
    assert.equal(run(['verify', proof]).status, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
