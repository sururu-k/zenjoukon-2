import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMinutes } from '../src/secure/numeric.js';
import { proveCommittedSum, verifyCommittedSum } from '../src/secure/zk.js';
import { splitContribution, aggregateParty, combinePartyTotals } from '../src/secure/mpc.js';
import { randomizedResponse, releaseLongCommute, createReleaseLedger, EPSILON } from '../src/secure/dp.js';
import { createFHEOwner, evaluateCiphertexts } from '../src/secure/fhe.js';

test('数値集計は範囲・件数・整数を検査し、自由文を受け取らない',()=>{
  assert.deepEqual(parseMinutes('0, 30\n180'),[0,30,180]);
  for(const s of ['', '181','-1','1.5','氏名：太郎、30分'])assert.throws(()=>parseMinutes(s));
});
test('ZKは個別値を含まないコミットされた合計を検証し、合計・用途・要素の改変を拒否する',()=>{
  const p=proveCommittedSum([30,90,60]);assert.equal(p.sum,180);assert.equal(verifyCommittedSum(p),true);assert.ok(!('values' in p));assert.ok(!('blind' in p));
  for(const changed of [{...p,sum:181},{...p,context:'別の用途'},{...p,count:4},{...p,response:'f'.repeat(64)},{...p,commitments:[...p.commitments].reverse()},{...p,R:'00'.repeat(32)}])assert.equal(verifyCommittedSum(changed),false);
  assert.notDeepEqual(proveCommittedSum([30,90,60]).commitments,p.commitments);
  assert.equal(verifyCommittedSum(proveCommittedSum([0,0])),true);
});
test('MPCは2者が独立に合算し、学校別のシェアを開かず統合集計を復元する',async()=>{
  const x=splitContribution([30,90],'campaign-test'),y=splitContribution([60,40],'campaign-test');
  const a=await aggregateParty([x.A,y.A],'A'),b=await aggregateParty([x.B,y.B],'B');
  const r=combinePartyTotals(a,b);assert.equal(r.sum,220);assert.equal(r.count,4);assert.equal(r.mean,55);assert.equal(r.contributors,2);assert.ok(!('values' in x.A));assert.notEqual(x.A.share,splitContribution([30,90],'campaign-test').A.share);
  await assert.rejects(aggregateParty([x.A,x.A],'A'));await assert.rejects(aggregateParty([x.A,y.B],'A'));await assert.rejects(aggregateParty([x.A],'A'));assert.throws(()=>combinePartyTotals(a,{...b,campaign:'wrong-test'}));assert.throws(()=>combinePartyTotals(a,{...b,batchDigest:'a'.repeat(64)}));assert.throws(()=>combinePartyTotals(a,{...b,share:'-1'}));
});
test('MPCの提出数はファイル組数であり、異なる学校数を認証しない',async()=>{
  const one=splitContribution([30,90],'campaign-test'),another=splitContribution([30,90],'campaign-test');
  const a=await aggregateParty([one.A,another.A],'A'),b=await aggregateParty([one.B,another.B],'B');
  const result=combinePartyTotals(a,b);assert.equal(result.contributors,2);assert.equal(result.sum,240);
});
test('ランダム化回答は全8条件で正答率3/4、置換隣接の確率比は3以下になる',()=>{
  for(const output of [false,true]){
    const p=[false,true].map(bit=>[0,1,2,3].filter(draw=>randomizedResponse(bit,draw)===output).length/4);
    assert.ok(p[0]/p[1]<=3);assert.ok(p[1]/p[0]<=3);
  }
  for(const bit of [false,true])assert.equal([0,1,2,3].filter(d=>randomizedResponse(bit,d)===bit).length,3);
  assert.equal(EPSILON,Math.log(3));assert.throws(()=>randomizedResponse(true,4));
  const r=releaseLongCommute([30,90,60]);assert.equal(r.publicCount,3);assert.ok(r.estimatedPositive>=0&&r.estimatedPositive<=3);assert.ok(!('values' in r));assert.equal(r.delta,0);
});
test('同じ入力のDP公開を繰り返すと同じ結果を再利用する',()=>{
  const ledger=createReleaseLedger(),a=ledger.release([30,60,90]);assert.equal(ledger.release([30,60,90]),a);assert.ok(Object.isFrozen(a));assert.notEqual(ledger.release([30,60,91]),a);
});
test('実際のBFV暗号文を秘密鍵なしで加算し、元の鍵で合計・件数を復元する',async()=>{
  const owner=await createFHEOwner(),other=await createFHEOwner();
  try{
    const a=owner.encrypt([30,90]),b=owner.encrypt([60,180]),total=await evaluateCiphertexts([a,b]);
    const r=owner.decrypt(total);assert.equal(r.sum,360);assert.equal(r.count,4);assert.equal(r.mean,90);assert.ok(r.noiseBudgetBits>0);assert.ok(!('secretKey' in a));assert.notEqual(a.ciphertext,owner.encrypt([30,90]).ciphertext);
    assert.throws(()=>other.decrypt(total));await assert.rejects(evaluateCiphertexts([a,a]));await assert.rejects(evaluateCiphertexts([a,other.encrypt([10])]));await assert.rejects(evaluateCiphertexts([{...a,ciphertext:'invalid'}]));
    const edge=owner.decrypt(await evaluateCiphertexts([owner.encrypt(Array(1000).fill(180))]));assert.equal(edge.sum,180000);
  }finally{owner.destroy();other.destroy();}
  assert.throws(()=>owner.encrypt([10]));
});
