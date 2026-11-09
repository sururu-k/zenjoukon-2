import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedSurveyBallot,verifySurveyShare,createVerifiedSurveyCollector,combineVerifiedSurveyTotals} from '../src/secure/verified-survey.js';

test('各担当が証明と自分のシェアを検証し、３回答の合計を復元する',async()=>{
  const campaign='survey-proof-test',a=createVerifiedSurveyCollector('A',campaign),b=createVerifiedSurveyCollector('B',campaign);
  const ballots=await Promise.all([true,false,true].map(v=>createVerifiedSurveyBallot(v,campaign)));
  for(const ballot of ballots){await a.receive(ballot.A);await b.receive(ballot.B);}
  const result=await combineVerifiedSurveyTotals(await a.publish(),await b.publish());
  assert.deepEqual(result,{count:3,yes:2,no:1});
  await assert.rejects(a.receive(ballots[0].A));
});

test('他担当のシェア、別回答の証明、改変したシェアや集計IDを拒否する',async()=>{
  const campaign='survey-proof-test';
  const first=await createVerifiedSurveyBallot(true,campaign),second=await createVerifiedSurveyBallot(false,campaign);
  assert.equal(await verifySurveyShare(first.A,'A',campaign),true);
  for(const altered of [first.B,{...first.A,value:'0'.repeat(64)},{...first.A,B:second.A.B},{...first.A,proof:second.A.proof},{...first.A,batch:second.A.batch},{...first.A,campaign:'another-campaign'}]){
    assert.equal(await verifySurveyShare(altered,'A',campaign),false);
  }
  const collector=createVerifiedSurveyCollector('A',campaign);
  await collector.receive(first.A);
  await assert.rejects(collector.receive(first.A));
  await assert.rejects(collector.publish());
  await assert.rejects(combineVerifiedSurveyTotals({},{ }));
});

test('担当者が異なる提出の組を合算した場合は結果を合わせない',async()=>{
  const campaign='survey-proof-test',a=createVerifiedSurveyCollector('A',campaign),b=createVerifiedSurveyCollector('B',campaign);
  const ballots=await Promise.all([true,false,true,false].map(v=>createVerifiedSurveyBallot(v,campaign)));
  for(const ballot of ballots.slice(0,3))await a.receive(ballot.A);
  for(const ballot of ballots.slice(1,4))await b.receive(ballot.B);
  const totalA=await a.publish(),totalB=await b.publish();
  await assert.rejects(combineVerifiedSurveyTotals(totalA,totalB));
});

test('担当者が集計シェアやブラインド値、公開された提出内容を改変したら拒否する',async()=>{
  const campaign='survey-proof-test',a=createVerifiedSurveyCollector('A',campaign),b=createVerifiedSurveyCollector('B',campaign);
  for(const answer of [true,false,true]){const ballot=await createVerifiedSurveyBallot(answer,campaign);await a.receive(ballot.A);await b.receive(ballot.B);}
  const totalA=await a.publish(),totalB=await b.publish();
  const altered=structuredClone(totalA);altered.share=altered.share==='0'.repeat(64)?'1'.padStart(64,'0'):'0'.repeat(64);
  await assert.rejects(combineVerifiedSurveyTotals(altered,totalB));
  const alteredBlind=structuredClone(totalA);alteredBlind.blind=alteredBlind.blind==='0'.repeat(64)?'1'.padStart(64,'0'):'0'.repeat(64);
  await assert.rejects(combineVerifiedSurveyTotals(alteredBlind,totalB));
  const alteredBallots=structuredClone(totalA);alteredBallots.ballots[0].A=alteredBallots.ballots[1].A;
  await assert.rejects(combineVerifiedSurveyTotals(alteredBallots,totalB));
});
