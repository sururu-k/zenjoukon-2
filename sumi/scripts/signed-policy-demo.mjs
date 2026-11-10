import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import example from '../src/school-policy.example.json' with {type:'json'};
import { makeSigningKey } from '../src/crypto.js';
import { signSchoolPolicy, verifySchoolPolicy } from '../src/secure/signed-school-policy.js';

const dir=await mkdtemp(join(tmpdir(),'sumi-sign-demo-'));
try{
  const pairs=await Promise.all([makeSigningKey(),makeSigningKey()]);
  const trust={format:'sumi-school-policy-trust',version:1,threshold:2,publicKeys:await Promise.all(pairs.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
  const policy=structuredClone(example);policy.school='架空の青空学校';policy.documentProof.forbidden=['青空祭'];
  const signed=await signSchoolPolicy(policy,pairs);
  assert.equal((await verifySchoolPolicy(signed,trust)).verifiedSignatures,2);
  const policyFile=join(dir,'policy.json'),trustFile=join(dir,'trust.json'),doc=join(dir,'document.txt');
  await writeFile(policyFile,JSON.stringify(signed));await writeFile(trustFile,JSON.stringify(trust));await writeFile(doc,'青空祭は来月開催します。');
  const root=fileURLToPath(new URL('../',import.meta.url));
  const run=()=>spawnSync(process.execPath,['scripts/school-agent.mjs',doc,'read','--signed-policy',policyFile,'--policy-trust',trustFile],{cwd:root,input:'yes\n',encoding:'utf8'});
  const ok=run();assert.equal(ok.status,0,ok.stderr);assert.doesNotMatch(ok.stdout,/青空祭/);
  const audit=()=>spawnSync(process.execPath,['scripts/school-audit.mjs','--signed-policy',policyFile,'--policy-trust',trustFile,'draft'],{cwd:root,encoding:'utf8'});
  const draft=audit();assert.equal(draft.status,0,draft.stderr);assert.equal(JSON.parse(draft.stdout).format,'sumi-configuration-draft');
  console.log('１．架空の学校設定に２つの鍵で署名し、別に用意した信頼鍵と必要数で検証。');
  console.log('２．同じ設定を点検案とエージェントの加工に使用。確認前は拒否、模擬確認後に加工版を表示。');
  const changed=structuredClone(signed);changed.policy.documentProof.forbidden=['別の語'];await writeFile(policyFile,JSON.stringify(changed));
  const altered=run();assert.equal(altered.status,1);assert.doesNotMatch(altered.stdout,/エージェントに渡す文書/);
  assert.equal(audit().status,1);
  console.log('３．署名後に禁止語を差し替えると、文書を表示する前に拒否。');
  console.log('鍵の所有者の本人確認、信頼設定の配布、失効、古い設定の再利用防止は含みません。架空データ専用。');
}finally{await rm(dir,{recursive:true,force:true});}
