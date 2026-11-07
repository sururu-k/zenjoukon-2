import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, requestFor, outputClassification, LABELS, ACTIONS, SINKS } from '../src/authorization.js';
import { PRESETS } from '../src/privacy.js';

test('全2,560条件で、許可された平文出力は公開・確認済み・現行版に限る',()=>{
  let total=0;
  for(const label of LABELS)for(const action of ACTIONS)for(const sink of SINKS)for(let flags=0;flags<32;flags++){
    const r=requestFor(action,sink,label,{reviewed:!!(flags&1),fresh:!!(flags&2),encrypted:!!(flags&4),consented:!!(flags&8),loopback:!!(flags&16)});
    const decision=decide(r);total++;
    if(!decision.allow)continue;
    assert.notEqual(r.label,'unknown');assert.equal(r.fresh,true);assert.notEqual(r.sink,'unregistered');
    if(action==='copy'||action==='export'){assert.equal(label,'public');assert.equal(r.reviewed,true);assert.equal(sink,action==='copy'?'clipboard':'share-file');}
    if(action==='saveEncrypted'){assert.equal(sink,'encrypted-draft');assert.equal(r.encrypted,true);}
    if(action==='infer'){assert.equal(sink,'local-ai');assert.equal(r.loopback,true);assert.equal(r.consented,true);}
  }
  assert.equal(total,2560);
});
test('不明な操作・不完全な入力・真偽値の偽装は許可しない',()=>{
  for(const r of [null,{},requestFor('delete','share-file','public',{fresh:true,reviewed:true}),requestFor('copy','https://evil.test','public',{fresh:true,reviewed:true}),{...requestFor('copy','clipboard','public',{fresh:true}),reviewed:'true'}])assert.equal(decide(r).allow,false);
  const r=requestFor('copy','clipboard','public',{fresh:true,reviewed:true,label:'confidential',sink:'unregistered'});
  assert.equal(r.label,'public');assert.equal(r.sink,'clipboard');
});
test('画面の「公開」という表示名やAIの提案で機密区分を下げられない',()=>{
  assert.equal(outputClassification(PRESETS.public,0),'public');assert.equal(outputClassification(PRESETS.students,0),'internal');assert.equal(outputClassification({...PRESETS.teacher,label:'公開'},0),'confidential');
  assert.equal(outputClassification(PRESETS.public,1),'confidential');assert.equal(outputClassification({...PRESETS.public,location:'raw'},0),'unknown');assert.equal(outputClassification(PRESETS.public,-1),'unknown');
});
