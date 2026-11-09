import test from 'node:test';
import assert from 'node:assert/strict';
import { startCollector } from '../survey-live/server.mjs';
import { splitContribution } from '../src/secure/mpc.js';

const P = (1n << 61n) - 1n;
const call = async (server, path, body) => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};

test('実際のHTTP通信で、AとBは自分宛てのシェアだけを保管し、合計だけが復元できる', async () => {
  const A = await startCollector('A', 0), B = await startCollector('B', 0);
  try {
    const answers = [true, false, true];
    for (const answer of answers) {
      const { A: a, B: b } = splitContribution([answer ? 1 : 0], 'sumi-survey-live');
      assert.equal((await call(A, '/share', a)).status, 200);
      assert.equal((await call(B, '/share', b)).status, 200);
    }
    const heldA = (await call(A, '/held')).body.held, heldB = (await call(B, '/held')).body.held;
    assert.equal(heldA.length, 3);
    // AとBの保管内容は提出IDが対応するだけで、片方の値からは回答（0/1）が分からない。
    assert.deepEqual(heldA.map((h) => h.batch), heldB.map((h) => h.batch));
    const a = (await call(A, '/publish', {})).body, b = (await call(B, '/publish', {})).body;
    assert.equal(Number((BigInt(a.share) + BigInt(b.share)) % P), 2);
    assert.equal(a.count, 3);
  } finally { A.close(); B.close(); }
});

test('3件未満の集計、他担当宛てのシェア、重複した提出は拒否される', async () => {
  const A = await startCollector('A', 0);
  try {
    const { A: a, B: b } = splitContribution([1], 'sumi-survey-live');
    assert.equal((await call(A, '/share', b)).status, 400, 'B宛てをAが受け取ってはいけない');
    assert.equal((await call(A, '/share', a)).status, 200);
    assert.equal((await call(A, '/share', a)).status, 400, '同じ提出の重複');
    assert.equal((await call(A, '/publish', {})).status, 400, '3件未満');
    assert.equal((await call(A, '/nothing')).status, 404);
  } finally { A.close(); }
});
