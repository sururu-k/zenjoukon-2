import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyBallot, createSurveyCollector, combineSurveyTotals } from '../src/secure/survey.js';
import { splitContribution } from '../src/secure/mpc.js';

test('別々の集計担当は３件以上でそれぞれ合算し、対応する結果だけを復元する',async()=>{
  const campaign='survey-test',a=createSurveyCollector('A',campaign),b=createSurveyCollector('B',campaign);
  const ballots=[true,false,true].map(answer=>createSurveyBallot(answer,campaign));
  for(const ballot of ballots.slice(0,2)){a.receive(ballot.A);b.receive(ballot.B);}
  await assert.rejects(a.publish(),/３件/);await assert.rejects(b.publish(),/３件/);
  assert.throws(()=>a.receive(ballots[0].A));assert.throws(()=>a.receive(ballots[2].B));
  const mutable=structuredClone(ballots[2].A);a.receive(mutable);b.receive(ballots[2].B);mutable.share='0';
  const totalA=await a.publish(),totalB=await b.publish();
  assert.deepEqual(combineSurveyTotals(totalA,totalB),{count:3,yes:2,no:1});
  assert.throws(()=>a.receive(ballots[2].A));await assert.rejects(a.publish());
  assert.throws(()=>combineSurveyTotals(totalA,{...totalB,batchDigest:'a'.repeat(64)}));
  assert.equal(a.packets,undefined);
});
test('１回答以外の入力と不正な集計値を受け付けない',async()=>{
  const campaign='survey-test',a=createSurveyCollector('A',campaign),b=createSurveyCollector('B',campaign);
  const ballots=[true,true,true].map(answer=>createSurveyBallot(answer,campaign));
  assert.throws(()=>a.receive({...ballots[0].A,count:2}));assert.throws(()=>createSurveyBallot('yes',campaign));
  for(const ballot of ballots){a.receive(ballot.A);b.receive(ballot.B);}
  const totalA=await a.publish(),totalB=await b.publish();
  assert.throws(()=>combineSurveyTotals(totalA,{...totalB,count:4}));
});
test('集計結果が二択の件数を超える場合は復元しない',async()=>{
  const campaign='survey-test',a=createSurveyCollector('A',campaign),b=createSurveyCollector('B',campaign);
  for(let i=0;i<3;i++){const ballot=splitContribution([10],campaign);a.receive(ballot.A);b.receive(ballot.B);}
  const totalA=await a.publish(),totalB=await b.publish();
  assert.throws(()=>combineSurveyTotals(totalA,totalB));
});
