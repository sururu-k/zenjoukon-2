import test from 'node:test';
import assert from 'node:assert/strict';
import { startCollector } from '../survey-live/server.mjs';
import { splitContribution } from '../src/secure/mpc.js';
import { createVerifiedSurveyBallot, combineVerifiedSurveyTotals } from '../src/secure/verified-survey.js';
import { makeSigningKey } from '../src/crypto.js';
import { combineSignedSurveyTotals } from '../src/secure/signed-survey-totals.js';

const call = async (server, path, body) => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};

test('実際のHTTP通信で、AとBは自分宛てのシェアだけを保管し、合計だけが復元できる', async () => {
  const A = await startCollector('A', 0), B = await startCollector('B', 0);
  try {
    const answers = [true, false, true];
    for (const answer of answers) {
      const { A: a, B: b } = await createVerifiedSurveyBallot(answer, 'sumi-survey-live');
      assert.equal((await call(A, '/share', a)).status, 200);
      assert.equal((await call(B, '/share', b)).status, 200);
    }
    const heldA = (await call(A, '/held')).body.held, heldB = (await call(B, '/held')).body.held;
    assert.equal(heldA.length, 3);
    // AとBの保管内容は提出IDが対応するだけで、片方の値からは回答（0/1）が分からない。
    assert.deepEqual(heldA.map((h) => h.batch), heldB.map((h) => h.batch));
    const a = (await call(A, '/publish', {})).body, b = (await call(B, '/publish', {})).body;
    assert.deepEqual(await combineVerifiedSurveyTotals(a,b),{count:3,yes:2,no:1});
  } finally { A.close(); B.close(); }
});

test('3件未満の集計、他担当宛てのシェア、重複した提出は拒否される', async () => {
  const A = await startCollector('A', 0);
  try {
    const { A: a, B: b } = await createVerifiedSurveyBallot(true, 'sumi-survey-live');
    assert.equal((await call(A, '/share', b)).status, 400, 'B宛てをAが受け取ってはいけない');
    assert.equal((await call(A, '/share', a)).status, 200);
    assert.equal((await call(A, '/share', a)).status, 400, '同じ提出の重複');
    assert.equal((await call(A, '/share', splitContribution([2], 'sumi-survey-live').A)).status, 400, '旧形式の不正な回答');
    const next=await createVerifiedSurveyBallot(false, 'sumi-survey-live');
    assert.equal((await call(A, '/share', {...next.A,value:'0'.repeat(64)})).status,400,'シェアの改変');
    assert.equal((await call(A, '/publish', {})).status, 400, '3件未満');
    assert.equal((await call(A, '/nothing')).status, 404);
  } finally { A.close(); }
});

test('実HTTPの各担当が集計へ署名し、別途指定した信頼鍵と回答証明を検証する', async () => {
  const [keyA,keyB]=await Promise.all([makeSigningKey(),makeSigningKey()]);
  const trust={format:'sumi-survey-collector-trust',version:1,
    A:{threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',keyA.publicKey)]},
    B:{threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',keyB.publicKey)]}};
  const mutableKeyA={publicKey:keyA.publicKey,privateKey:keyA.privateKey};
  const A=await startCollector('A',0,{signingKeys:[mutableKeyA]}),B=await startCollector('B',0,{signingKeys:[keyB]});
  try{
    // The already-started collector must not change signer if its caller
    // later mutates the original configuration object.
    mutableKeyA.publicKey=keyB.publicKey;mutableKeyA.privateKey=keyB.privateKey;
    for(const answer of [true,false,true]){
      const ballot=await createVerifiedSurveyBallot(answer,'sumi-survey-live');
      assert.equal((await call(A,'/share',ballot.A)).status,200);
      assert.equal((await call(B,'/share',ballot.B)).status,200);
    }
    const [a,again,b]=await Promise.all([call(A,'/publish',{}),call(A,'/publish',{}),call(B,'/publish',{})]);
    assert.equal(a.status,200);assert.equal(again.status,200);assert.deepEqual(a.body,again.body);
    assert.deepEqual(await combineSignedSurveyTotals(a.body,b.body,'sumi-survey-live',trust),{count:3,yes:2,no:1,campaign:'sumi-survey-live',verifiedA:1,verifiedB:1});
    const changed=structuredClone(a.body);changed.payload.total.share='0'.repeat(64);
    await assert.rejects(combineSignedSurveyTotals(changed,b.body,'sumi-survey-live',trust));
    const wrong=structuredClone(trust);wrong.A.publicKeys=wrong.B.publicKeys;
    await assert.rejects(combineSignedSurveyTotals(a.body,b.body,'sumi-survey-live',wrong));
  }finally{A.close();B.close();}
});

test('一致しない署名鍵を設定した担当は回答の受付前に起動を拒否する',async()=>{
  const [a,b]=await Promise.all([makeSigningKey(),makeSigningKey()]);
  await assert.rejects(startCollector('A',0,{signingKeys:[{publicKey:a.publicKey,privateKey:b.privateKey}]}));
  await assert.rejects(startCollector('A',0,{signingKeys:[]}));
});
