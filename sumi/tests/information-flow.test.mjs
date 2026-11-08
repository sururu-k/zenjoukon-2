import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, requestFor, LABELS, ACTIONS, SINKS } from '../src/authorization.js';
import { channelFor, selectEgress, dispatchEgress } from '../src/information-flow.js';
import { inspectSource, inspectMarkup, checkEgress } from '../scripts/check-egress.mjs';
import { createWorkspace } from '../src/workspace.js';
import { PRESETS } from '../src/privacy.js';
import { createLocalAITransport } from '../src/browser-effects.js';

test('2,560条件で出力の種類と取り出すフィールドが一致し、拒否時は値にも実行APIにも触らない',async()=>{
  const released=Symbol('released'),secret=Symbol('secret'),sealed=Symbol('sealed');let cases=0;
  for(const label of LABELS)for(const action of ACTIONS)for(const sink of SINKS)for(let flags=0;flags<32;flags++){
    const r=requestFor(action,sink,label,{reviewed:!!(flags&1),fresh:!!(flags&2),encrypted:!!(flags&4),consented:!!(flags&8),loopback:!!(flags&16)});cases++;
    const channel=channelFor(r);
    if(!decide(r).allow){assert.equal(channel,'none');const forbidden=new Proxy({},{get(){throw new Error('must not inspect');}});await assert.rejects(dispatchEgress(r,forbidden,forbidden),e=>e.name==='AuthorizationError');continue;}
    const expected=channel==='encrypted-draft'?'sealed':channel==='local-ai'?'private':'released';
    const values=new Proxy({released,private:secret,sealed},{get(target,key){assert.equal(key,expected);return target[key];}});
    const selected=selectEgress(r,values);assert.equal(selected.value,{released,private:secret,sealed}[expected]);
    let called=0;await dispatchEgress(r,values,{[channel]:value=>{called++;assert.equal(value,selected.value);}});assert.equal(called,1);
  }
  assert.equal(cases,2560);
});
test('承認済みの平文は、秘密情報と暗号文を差し替えても変わらない',()=>{
  for(const [action,sink] of [['copy','clipboard'],['export','share-file']]){
    const r=requestFor(action,sink,'public',{fresh:true,reviewed:true});
    for(const secret of ['山田太郎','x'.repeat(50000),{source:'機密',key:'秘密鍵'}])assert.equal(selectEgress(r,{released:'明示的に公開を許可した版',private:secret,sealed:crypto.randomUUID()}).value,'明示的に公開を許可した版');
  }
});
test('同じ公開版の共有内容に、秘密の編集回数や原文の付加フィールドを混ぜない',async t=>{
  const RealDate=Date;t.mock.method(globalThis,'Date',class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-08T00:00:00.000Z']));}});
  async function exported(extraEdits,secret){
    let saved;const w=createWorkspace({copy:async()=>{},download:async(_,data)=>{saved=data;}});
    for(let i=0;i<extraEdits;i++){w.setDocument({text:'未公開の内容'+i,kept:0},PRESETS.public);w.clear();}
    w.setDocument({text:'確認した公開版',kept:0,source:secret,originalHash:secret,overrides:secret},PRESETS.public);w.setDestination('share-file');await w.approve();await w.export();return saved.payload;
  }
  const a=await exported(0,'秘密A'),b=await exported(7,'別の秘密B');assert.deepEqual(a,b);assert.ok(!JSON.stringify(a).includes('秘密'));assert.ok(!('revision' in a.authorization));assert.ok(!('reviewDigest' in a.authorization));assert.equal(a.authorization.releaseDigest,b.authorization.releaseDigest);
});
test('全ソースを構文検査し、別名・Unicode表記・計算した属性名でも既知の未登録I/Oを拒否する',async()=>{
  for(const source of ['fetch(secret)','const leak = f\\u0065tch; leak(secret);','navigator["send"+"Beacon"]("/",secret)','globalThis.fetch(secret)','new WebSocket("wss://example.test")','node.setAttribute("s"+"rc",secret)','import(secret)','const leak=Function("return 1")','adapters.download(name,secret)'])assert.ok(inspectSource(source,'untrusted.js').length>0,source);
  assert.ok(inspectSource('adapters.download(name,secret)','workspace.js').length>0);
  assert.equal(inspectSource('node.textContent=secret','app.js').length,0);
  const result=await checkEgress();assert.equal(result.soundInformationFlowAnalysis,false);assert.ok(Object.keys(result.files).length>=13);
});
test('CSPの緩和・インラインスクリプト・イベントハンドラを検出する',()=>{
  for(const source of ['<script>fetch(secret)</script>','<img onerror="leak()">','<meta http-equiv="Content-Security-Policy" content="script-src *; connect-src *">'])assert.ok(inspectMarkup(source,'index.html').length>0);
});
test('AIの本文をシリアライズする途中で版が変わったら、通信の前に拒否する',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('must not send');});
  const w=createWorkspace({copy:async()=>{},download:async()=>{}}),ai=createLocalAITransport(w),expectedRevision=w.revision;
  const body={toJSON(){w.clear();return {prompt:'送ってはいけない秘密'};}};
  await assert.rejects(ai.request('http://127.0.0.1:11434','/api/generate',body,{consented:true,expectedRevision}),e=>e.name==='AuthorizationError'&&e.code==='stale');assert.equal(calls,0);
});
