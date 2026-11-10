import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decryptDraft, makeSigningKey } from '../src/crypto.js';
import { prepareRandomizedSumSnapshot, openRandomizedSumSnapshot } from '../src/secure/sealed-randomized-sum-tool.js';
import { createVerifiedSumToolGateway, RANDOMIZED_SUM_TOOL } from '../src/secure/verified-tool-gateway.js';

test('stored encrypted randomization is reused by separately restored tool instances', async () => {
  const key=await makeSigningKey(), password='fictional-test-passphrase';
  const trust={format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',key.publicKey)]};
  const prepared=await prepareRandomizedSumSnapshot({school:[true,false,true,false,true]},password);
  const clear=await decryptDraft(prepared.envelope,password);
  assert.deepEqual(Object.keys(clear.samples[0]).sort(),['count','id','sum']);
  const dir=await mkdtemp(join(tmpdir(),'sumi-random-test-'));
  try {
    const path=join(dir,'state.json');await writeFile(path,JSON.stringify(prepared.envelope),{flag:'wx',mode:0o600});
    const stored=JSON.parse(await readFile(path,'utf8'));
    const a=await openRandomizedSumSnapshot(stored,password,prepared.checkpoint,[key]);
    const b=await openRandomizedSumSnapshot(stored,password,prepared.checkpoint,[key]);
    const verifier=createVerifiedSumToolGateway(trust,'reader',RANDOMIZED_SUM_TOOL);
    const [ca,cb]=await Promise.all([verifier.begin('school'),verifier.begin('school')]);
    const [ra,rb]=await Promise.all([a.run(ca),b.run(cb)]);
    const [va,vb]=await Promise.all([verifier.accept(ca.request.requestId,ra),verifier.accept(cb.request.requestId,rb)]);
    assert.equal(va.sum,vb.sum);assert.equal(va.count,5);assert.equal(vb.count,5);
    await assert.rejects(openRandomizedSumSnapshot(stored,'wrong-test-passphrase',prepared.checkpoint,[key]));
    await assert.rejects(openRandomizedSumSnapshot(stored,password,'0'.repeat(64),[key]));
    const changed=structuredClone(stored);changed.ciphertext=(changed.ciphertext[0]==='A'?'B':'A')+changed.ciphertext.slice(1);
    await assert.rejects(openRandomizedSumSnapshot(changed,password,prepared.checkpoint,[key]));
    const other=await prepareRandomizedSumSnapshot({school:[true,false,true,false,true]},password);
    await assert.rejects(openRandomizedSumSnapshot(other.envelope,password,prepared.checkpoint,[key]));
    await assert.rejects(a.run({...ca,arguments:{datasetId:'other'}}));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('invalid raw datasets are rejected before snapshot creation', async () => {
  await assert.rejects(prepareRandomizedSumSnapshot({school:[true,false]},'fictional-test-passphrase'));
  await assert.rejects(prepareRandomizedSumSnapshot({school:[true,false,0]},'fictional-test-passphrase'));
});
