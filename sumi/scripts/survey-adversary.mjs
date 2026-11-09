import assert from 'node:assert/strict';
import { createSurveyBallot, createSurveyCollector, combineSurveyTotals } from '../src/secure/survey.js';
import { splitContribution } from '../src/secure/mpc.js';

// An untrusted client bypasses createSurveyBallot and sends an encoding of 2.
// The final aggregate remains within 0..3, so the total-range check cannot
// detect the invalid ballot. All data are fictional.
const campaign='survey-attack-demo';
const a=createSurveyCollector('A',campaign),b=createSurveyCollector('B',campaign);
const ballots=[createSurveyBallot(false,campaign),createSurveyBallot(false,campaign),splitContribution([2],campaign)];
for(const ballot of ballots){a.receive(ballot.A);b.receive(ballot.B);}
const result=combineSurveyTotals(await a.publish(),await b.publish());
assert.deepEqual(result,{count:3,yes:2,no:1});
console.log('攻撃実験（架空の回答）');
console.log('正規の回答：反対、反対 / 不正な回答：数値 2');
console.log(`集計結果：賛成 ${result.yes} 件、反対 ${result.no} 件として受理`);
console.log('各回答が0または1である証明は未実装です。合計の範囲検査だけでは不正を検出できません。');
