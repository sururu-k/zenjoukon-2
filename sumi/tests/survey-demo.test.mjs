import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyDemo } from '../src/survey-demo-core.js';

test('３件未満では集計を表示せず、確定後の回答を拒否する',async()=>{
  const survey=createSurveyDemo();assert.equal(survey.count,0);
  survey.submit(true);survey.submit(false);await assert.rejects(survey.publish(),/３件/);
  assert.equal(survey.phase,'open');survey.submit(true);
  const result=await survey.publish();assert.deepEqual(result,{count:3,yes:2,no:1});
  assert.equal(survey.phase,'published');assert.throws(()=>survey.submit(false));await assert.rejects(survey.publish());
  assert.deepEqual(Object.keys(result).sort(),['count','no','yes']);assert.equal(survey.sharesA,undefined);
});
test('同じ人の重複回答を検証していないため件数は人数を証明しない',async()=>{
  const survey=createSurveyDemo();for(let i=0;i<3;i++)survey.submit(true);
  assert.deepEqual(await survey.publish(),{count:3,yes:3,no:0});
});
