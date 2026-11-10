import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createVerifiedSurveyBallot } from '../src/secure/verified-survey.js';
import { combineSignedSurveyTotals } from '../src/secure/signed-survey-totals.js';
import { startCollector } from '../survey-live/server.mjs';

// Fictional data only. Separate loopback endpoints but one process: neither
// independent administration nor confidentiality against this process exists.
const keys=await Promise.all([makeSigningKey(),makeSigningKey()]);
const publicKeys=await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)));
const trust={format:'sumi-survey-collector-trust',version:1,A:{threshold:1,publicKeys:[publicKeys[0]]},B:{threshold:1,publicKeys:[publicKeys[1]]}};
async function post(server,path,body){
  const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'集計に失敗しました。');return result;
}
async function close(server){server.closeAllConnections();await new Promise((ok,reject)=>server.close(error=>error?reject(error):ok()));}
for(const [label,campaign,answers] of [
  ['地域の架空アンケート','community-poll-2026',[true,false,true]],
  ['学校の架空アンケート','school-poll-2026',[true,true,false,false]],
]){
  const A=await startCollector('A',0,{campaign,signingKeys:[keys[0]]});
  let B;
  try{
    B=await startCollector('B',0,{campaign,signingKeys:[keys[1]]});
    for(const answer of answers){
      const ballot=await createVerifiedSurveyBallot(answer,campaign);
      await post(A,'/share',ballot.A);await post(B,'/share',ballot.B);
    }
    const [totalA,totalB]=await Promise.all([post(A,'/publish',{}),post(B,'/publish',{})]);
    const result=await combineSignedSurveyTotals(totalA,totalB,campaign,trust);
    assert.equal(result.yes,answers.filter(Boolean).length);
    const changed=structuredClone(totalA);changed.payload.total.share='0'.repeat(64);
    await assert.rejects(combineSignedSurveyTotals(changed,totalB,campaign,trust));
    await assert.rejects(combineSignedSurveyTotals(totalB,totalA,campaign,trust));
    console.log(`${label}：${result.count}回答、賛成 ${result.yes}・反対 ${result.no}。各担当の実HTTP応答、署名、回答・集計証明を検証。`);
    console.log('  集計シェアの改変と担当者の入れ替えを拒否。');
  }finally{if(B)await close(B);await close(A);}
}
console.log('集計ID・回答件数・回答ごとのコミットメントと証明・各担当の合算シェア・署名は公開されます。');
console.log('両担当と鍵は同一プロセスの模擬です。署名は本人確認、組織分離、投票の網羅性や一人一票を証明しません。');
