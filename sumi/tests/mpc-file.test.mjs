import test from 'node:test';
import assert from 'node:assert/strict';
import { sealSchoolContributions, sealPartyTotal, openCombinedTotal } from '../src/secure/mpc-file.js';

test('２校の暗号化ファイルを担当者別に集計し、合算値のみ復元する',async()=>{
  const a='school-secret-for-A',b='school-secret-for-B',campaign='school-campaign';
  const one=await sealSchoolContributions([30,90],campaign,a,b),two=await sealSchoolContributions([60,40],campaign,a,b);
  assert.ok(!JSON.stringify(one).includes('sumi-mpc-sum-v1'));
  await assert.rejects(sealSchoolContributions([30],campaign,a,a));
  await assert.rejects(sealPartyTotal([one.A,two.A],'A','wrong-passphrase'));
  await assert.rejects(sealPartyTotal([one.A,one.A],'A',a));
  await assert.rejects(sealPartyTotal([one.A,two.B],'A',a));
  const totalA=await sealPartyTotal([one.A,two.A],'A',a),totalB=await sealPartyTotal([one.B,two.B],'B',b);
  const result=await openCombinedTotal(totalA,a,totalB,b);
  assert.equal(result.sum,220);assert.equal(result.count,4);assert.equal(result.contributors,2);
  await assert.rejects(openCombinedTotal(totalA,a,totalB,'wrong-passphrase'));
});
