import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, makeSigningKey } from '../src/crypto.js';
import { signQuorum } from '../src/secure/signature-quorum.js';
import { createVerifiedSurveyBallot, createVerifiedSurveyCollector, verifyVerifiedSurveyTotal } from '../src/secure/verified-survey.js';
import { signSurveyTotal, combineSignedSurveyTotals } from '../src/secure/signed-survey-totals.js';

async function fixture(){
  const campaign='signed-survey-2026';
  const a=createVerifiedSurveyCollector('A',campaign),b=createVerifiedSurveyCollector('B',campaign);
  for(const answer of [true,false,true]){
    const ballot=await createVerifiedSurveyBallot(answer,campaign);await a.receive(ballot.A);await b.receive(ballot.B);
  }
  const [a1,a2,b1,b2,outsider]=await Promise.all(Array.from({length:5},()=>makeSigningKey()));
  const pubs=await Promise.all([a1,a2,b1,b2,outsider].map(k=>crypto.subtle.exportKey('jwk',k.publicKey)));
  const trust={format:'sumi-survey-collector-trust',version:1,A:{threshold:2,publicKeys:pubs.slice(0,2)},B:{threshold:2,publicKeys:pubs.slice(2,4)}};
  const totalA=await a.publish(),totalB=await b.publish();
  return {campaign,a1,a2,b1,b2,outsider,pubs,trust,totalA,totalB,A:await signSurveyTotal(totalA,[a1,a2]),B:await signSurveyTotal(totalB,[b1,b2])};
}

test('各担当の別々の信頼鍵と回答の証明を検証してから合計を復元する',async()=>{
  const f=await fixture();
  assert.equal(await verifyVerifiedSurveyTotal(f.totalA),true);
  const result=await combineSignedSurveyTotals(f.A,f.B,f.campaign,f.trust);
  assert.deepEqual(result,{count:3,yes:2,no:1,campaign:f.campaign,verifiedA:2,verifiedB:2});
  for(const envelope of [f.A,f.B])for(const ballot of envelope.payload.total.ballots){
    assert.equal(Object.hasOwn(ballot,'value'),false);assert.equal(Object.hasOwn(ballot,'blind'),false);
  }
});

test('変更・担当の入れ替え・無関係な鍵・同じ鍵の共用・不正な形式を拒否する',async()=>{
  const f=await fixture();
  await assert.rejects(combineSignedSurveyTotals(f.B,f.A,f.campaign,f.trust));
  await assert.rejects(combineSignedSurveyTotals(f.A,f.B,'different-campaign',f.trust));
  const changed=structuredClone(f.A);changed.payload.total.share='0'.repeat(64);
  await assert.rejects(combineSignedSurveyTotals(changed,f.B,f.campaign,f.trust));
  const missing=structuredClone(f.A);missing.signatures.pop();await assert.rejects(combineSignedSurveyTotals(missing,f.B,f.campaign,f.trust));
  const unknown=await signSurveyTotal(f.totalA,[f.a1,f.outsider]);await assert.rejects(combineSignedSurveyTotals(unknown,f.B,f.campaign,f.trust));
  const overlap=structuredClone(f.trust);overlap.B.publicKeys[0]=f.pubs[0];await assert.rejects(combineSignedSurveyTotals(f.A,f.B,f.campaign,overlap));
  const extra=structuredClone(f.totalA);extra.ballots[0].value='secret';await assert.rejects(signSurveyTotal(extra,[f.a1,f.a2]));
  const untrusted=structuredClone(f.A);untrusted.payload.total.ballots[0].value='secret';await assert.rejects(combineSignedSurveyTotals(untrusted,f.B,f.campaign,f.trust));
});

test('正しい鍵で署名し直しても、不正な集計シェアや異なる回答集合は拒否する',async()=>{
  const f=await fixture();
  const wrong=structuredClone(f.totalA);wrong.share=wrong.share==='0'.repeat(64)?'1'.padStart(64,'0'):'0'.repeat(64);
  assert.equal(await verifyVerifiedSurveyTotal(wrong),false);
  await assert.rejects(signSurveyTotal(wrong,[f.a1,f.a2]));
  // A compromised signer can sign arbitrary bytes; proof verification must
  // still reject a correctly signed but mathematically inconsistent aggregate.
  const forged=structuredClone(f.A);forged.payload.total=wrong;
  forged.signatures=await signQuorum(new TextEncoder().encode('sumi/signed-survey-total/v1\n'+canonical(forged.payload)),[f.a1,f.a2]);
  await assert.rejects(combineSignedSurveyTotals(forged,f.B,f.campaign,f.trust));
  const other=createVerifiedSurveyCollector('B',f.campaign);
  for(const answer of [true,false,true])await other.receive((await createVerifiedSurveyBallot(answer,f.campaign)).B);
  const otherSigned=await signSurveyTotal(await other.publish(),[f.b1,f.b2]);
  await assert.rejects(combineSignedSurveyTotals(f.A,otherSigned,f.campaign,f.trust));
});

test('非同期の検証中に呼び出し側が書き換えても、最初の入力を検証する',async()=>{
  const f=await fixture(),original=structuredClone(f.A),pending=combineSignedSurveyTotals(f.A,f.B,f.campaign,f.trust);
  f.A.payload.total.share='0'.repeat(64);f.trust.A.threshold=1;
  assert.equal((await pending).yes,2);
  await assert.rejects(combineSignedSurveyTotals(f.A,f.B,f.campaign,f.trust));
  assert.notEqual(original.payload.total.share,f.A.payload.total.share);
});
