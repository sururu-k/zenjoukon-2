import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
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
      if (value?.party !== party || value.pid !== child.pid || !Number.isInteger(value.port) || !value.publicKey) return finish(new Error('集計担当の起動情報が不正です。'));
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
async function post(port, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '集計に失敗しました。');
  return result;
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
    for (const answer of answers) {
      const ballot = await createVerifiedSurveyBallot(answer, campaign);
      await post(a.port, '/share', ballot.A);
      await post(b.port, '/share', ballot.B);
    }
    const heldStatuses = await Promise.all([a, b].map(async worker => (await fetch(`http://127.0.0.1:${worker.port}/held`, { signal: AbortSignal.timeout(10000) })).status));
    assert.deepEqual(heldStatuses, [404, 404]);
    const [totalA, totalB] = await Promise.all([post(a.port, '/publish', {}), post(b.port, '/publish', {})]);
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
  console.log('同一端末上のデモです。親プロセスは回答を知り、HTTP通信は暗号化されません。公開鍵は起動時のローカルIPCで受け取ります。');
}
