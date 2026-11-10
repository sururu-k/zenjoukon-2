import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { request } from 'node:https';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createVerifiedSurveyBallot } from '../src/secure/verified-survey.js';
import { combineSignedSurveyTotals } from '../src/secure/signed-survey-totals.js';

const workerPath = fileURLToPath(new URL('./survey-collector-worker.mjs', import.meta.url));
function ready(child, party) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('集計担当の起動がタイムアウトしました。')), 10000);
    function finish(error, value) {
      clearTimeout(timer);
      child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError);
      if (error) reject(error); else resolve(value);
    }
    function onMessage(value) {
      if (value?.party !== party || value.pid !== child.pid || !Number.isInteger(value.port) || !value.publicKey || typeof value.certificate !== 'string' || !/^[a-f0-9]{64}$/.test(value.publishToken)) return finish(new Error('集計担当の起動情報が不正です。'));
      finish(null, value);
    }
    function onExit() { finish(new Error('集計担当が起動前に終了しました。')); }
    function onError(error) { finish(error); }
    child.once('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
}
function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    if (child.connected) child.send({ type: 'shutdown' }, error => { if (error) child.kill(); });
    else child.kill();
  });
}
function call(worker, path, body, certificate = worker.certificate, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (token !== undefined) headers.authorization = `Bearer ${token}`;
    const req = request({ hostname: '127.0.0.1', servername: 'localhost', port: worker.port, path, method: body === undefined ? 'GET' : 'POST', ca: certificate, rejectUnauthorized: true, headers, signal: AbortSignal.timeout(10000) }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function post(worker, path, body, token) {
  const response = await call(worker, path, body, worker.certificate, token);
  if (response.status !== 200) throw new Error(response.body.error || '集計に失敗しました。');
  return response.body;
}

// The parent is the simulated respondent and verifier; it sees the answers.
// The inherited IPC channel is the demo's trust-on-startup key distribution.
export async function runProcessSurvey(campaign, answers) {
  if (typeof campaign !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(campaign) || !Array.isArray(answers) || answers.length < 3 || answers.length > 100 || answers.some(answer => typeof answer !== 'boolean')) throw new Error('集計IDまたは回答が不正です。');
  const children = [];
  try {
    for (const party of ['A', 'B']) children.push(fork(workerPath, [party, campaign], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }));
    const [a, b] = await Promise.all(children.map((child, i) => ready(child, ['A', 'B'][i])));
    const trust = { format: 'sumi-survey-collector-trust', version: 1, A: { threshold: 1, publicKeys: [a.publicKey] }, B: { threshold: 1, publicKeys: [b.publicKey] } };
    assert.notEqual(a.pid, b.pid);
    // Pinning A to B's unrelated certificate must fail before any share is sent.
    await assert.rejects(call(a, '/status', undefined, b.certificate));
    for (const answer of answers) {
      const ballot = await createVerifiedSurveyBallot(answer, campaign);
      await post(a, '/share', ballot.A);
      await post(b, '/share', ballot.B);
    }
    const heldStatuses = await Promise.all([a, b].map(async worker => (await call(worker, '/held')).status));
    assert.deepEqual(heldStatuses, [404, 404]);
    // Test after three ballots, when a premature publish would otherwise work.
    for (const [worker, other] of [[a, b], [b, a]]) {
      assert.equal((await call(worker, '/publish', {})).status, 401);
      assert.equal((await call(worker, '/publish', {}, worker.certificate, other.publishToken)).status, 401);
      assert.equal((await call(worker, '/status')).body.phase, 'open');
    }
    const [totalA, totalB] = await Promise.all([post(a, '/publish', {}, a.publishToken), post(b, '/publish', {}, b.publishToken)]);
    const result = await combineSignedSurveyTotals(totalA, totalB, campaign, trust);
    assert.equal(result.yes, answers.filter(Boolean).length);
    const changed = structuredClone(totalA);
    changed.payload.total.share = changed.payload.total.share === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
    await assert.rejects(combineSignedSurveyTotals(changed, totalB, campaign, trust));
    await assert.rejects(combineSignedSurveyTotals(totalB, totalA, campaign, trust));
    await assert.rejects(combineSignedSurveyTotals(totalA, totalB, `${campaign}_other`, trust));
    return { count: result.count, yes: result.yes, no: result.no, pids: [a.pid, b.pid], heldStatuses };
  } finally {
    await Promise.all(children.map(stop));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [label, answers] of [['地域', [true, false, true]], ['学校', [true, true, false, false]]]) {
    const result = await runProcessSurvey(`demo_${crypto.randomUUID()}`, answers);
    console.log(`${label}の架空アンケート: ${result.count}件、賛成 ${result.yes}・反対 ${result.no}。別プロセスの署名と集計証明を検証しました。`);
    console.log('  個別シェア表示は無効。結果の改変、担当の入れ替え、異なる集計IDを拒否しました。');
  }
  console.log('通信は各担当の証明書を固定した HTTPS。異なる証明書を拒否しました。');
  console.log('権限なし・別担当のトークンによる集計確定を拒否しました。');
  console.log('同一端末上のデモです。親プロセスは回答を知り、証明書と署名の公開鍵は起動時のローカル IPC で受け取ります。');
}
