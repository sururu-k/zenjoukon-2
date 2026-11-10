import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import example from '../src/school-policy.example.json' with {type:'json'};
import { makeSigningKey } from '../src/crypto.js';
import { signSchoolPolicy, verifySchoolPolicy } from '../src/secure/signed-school-policy.js';

async function fixture(){
  const a=await makeSigningKey(),b=await makeSigningKey(),outsider=await makeSigningKey();
  const publicKeys=await Promise.all([a,b].map(k=>crypto.subtle.exportKey('jwk',k.publicKey)));
  const trust={format:'sumi-school-policy-trust',version:1,threshold:2,publicKeys};
  const signed=await signSchoolPolicy(structuredClone(example),[a,b]);
  return {a,b,outsider,trust,signed};
}

test('別経路の信頼鍵による2人分の署名を検証し、変更した設定を拒否する',async()=>{
  const {signed,trust,a,b,outsider}=await fixture();
  const checked=await verifySchoolPolicy(signed,trust);
  assert.equal(checked.verifiedSignatures,2);assert.equal(checked.threshold,2);
  assert.equal(checked.policy.school,example.school);assert.ok(Object.isFrozen(checked.policy));
  const changed=structuredClone(signed);changed.policy.documentProof.forbidden=['秘密'];
  await assert.rejects(verifySchoolPolicy(changed,trust));
  const insufficient=structuredClone(signed);insufficient.signatures.pop();
  await assert.rejects(verifySchoolPolicy(insufficient,trust));
  const duplicate=structuredClone(signed);duplicate.signatures[1]=duplicate.signatures[0];
  await assert.rejects(verifySchoolPolicy(duplicate,trust));
  const unknown=await signSchoolPolicy(structuredClone(example),[a,outsider]);
  await assert.rejects(verifySchoolPolicy(unknown,trust));
  const wrongTrust=structuredClone(trust);wrongTrust.publicKeys[1]=await crypto.subtle.exportKey('jwk',outsider.publicKey);
  await assert.rejects(verifySchoolPolicy(signed,wrongTrust));
  await assert.rejects(signSchoolPolicy(structuredClone(example),[a,a]));
  const forged=structuredClone(signed);forged.signatures[0].signature=forged.signatures[1].signature;
  await assert.rejects(verifySchoolPolicy(forged,trust));
  const missingTrust=structuredClone(trust);missingTrust.threshold=0;
  await assert.rejects(verifySchoolPolicy(signed,missingTrust));
  const original=structuredClone(example);const pending=signSchoolPolicy(original,[a,b]);original.documentProof.forbidden=['書き換え'];
  assert.deepEqual((await verifySchoolPolicy(await pending,trust)).policy.documentProof.forbidden,example.documentProof.forbidden);
});

test('エージェントは署名付き設定を検証してから共通禁止語を使い、改変を拒否する',async()=>{
  const {signed,trust}=await fixture(),dir=await mkdtemp(join(tmpdir(),'sumi-signed-policy-'));
  try{
    const doc=join(dir,'doc.txt'),signedPath=join(dir,'signed.json'),trustPath=join(dir,'trust.json');
    await writeFile(doc,'山田さんが準備します。');await writeFile(signedPath,JSON.stringify(signed));await writeFile(trustPath,JSON.stringify(trust));
    const root=fileURLToPath(new URL('../',import.meta.url));
    const run=(...args)=>spawnSync(process.execPath,['scripts/school-agent.mjs',doc,'read',...args],{cwd:root,input:'yes\n',encoding:'utf8'});
    const ok=run('--signed-policy',signedPath,'--policy-trust',trustPath);
    assert.equal(ok.status,0,ok.stderr);assert.match(ok.stdout,/信頼鍵 2件を検証/);assert.doesNotMatch(ok.stdout,/山田/);
    const changed=structuredClone(signed);changed.policy.documentProof.forbidden=['別の名前'];await writeFile(signedPath,JSON.stringify(changed));
    const invalid=run('--signed-policy',signedPath,'--policy-trust',trustPath);
    assert.equal(invalid.status,1);assert.doesNotMatch(invalid.stdout,/エージェントに渡す文書/);
    assert.equal(run('--signed-policy',signedPath).status,1);
    assert.equal(run('--policy',signedPath,'--signed-policy',signedPath,'--policy-trust',trustPath).status,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});
