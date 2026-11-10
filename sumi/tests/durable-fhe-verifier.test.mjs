import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSigningKey } from '../src/crypto.js';
import { createFHEOwner, createFHEEncryptor } from '../src/secure/fhe.js';
import { signFheContribution } from '../src/secure/signed-fhe-contributions.js';
import { createContributorFheGate } from '../src/secure/contributor-fhe-gate.js';
import { initializeFheReplayLedger, openFheReplayLedger } from '../scripts/durable-fhe-verifier.mjs';

const workerPath=fileURLToPath(new URL('./fixtures/fhe-ledger-worker.mjs',import.meta.url));
function worker(input){
  return new Promise((resolve,reject)=>{
    const child=fork(workerPath,[],{stdio:['ignore','ignore','ignore','ipc']});
    const timer=setTimeout(()=>{child.kill();reject(new Error('worker timeout'));},15000);
    let answer;
    child.on('message',message=>{if(message.status==='ready')child.send(input);else answer=message.status;});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('exit',code=>{clearTimeout(timer);if(code!==0||!answer)reject(new Error('worker failed'));else resolve(answer);});
  });
}

test('SQLite atomically rejects replays across processes and reopen', async () => {
  const dir=await mkdtemp(join(tmpdir(),'sumi-fhe-ledger-')), path=join(dir,'ledger.sqlite');
  const owner=await createFHEOwner(), encoder=await createFHEEncryptor(owner.exportPublicKey(),owner.keyId);
  try {
    const keys=await Promise.all([makeSigningKey(),makeSigningKey(),makeSigningKey()]), signer=await makeSigningKey();
    const participants=await Promise.all(keys.map(async(k,i)=>({participantId:`p${i}`,publicKey:await crypto.subtle.exportKey('jwk',k.publicKey)})));
    const trust={format:'sumi-fhe-decryptor-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',signer.publicKey)]};
    const round={format:'sumi-fhe-round',version:1,roundId:crypto.randomUUID(),datasetId:'school',recipient:'auditor',keyId:owner.keyId};
    const bundles=await Promise.all([1,2,3].map((value,i)=>signFheContribution(encoder.encrypt([value]),round,participants[i].participantId,keys[i])));
    const gate=createContributorFheGate({owner,signingKeys:[signer],expectedRound:round,participants});
    const request=await gate.approve(bundles), accepted=await gate.agent.execute(request.requestId);
    assert.equal(accepted.status,'completed');
    const result={contributions:bundles,attestation:accepted.envelope};
    const {ledgerId}=await initializeFheReplayLedger(path);
    assert.equal((await stat(path)).mode&0o077,0);
    await assert.rejects(initializeFheReplayLedger(path));
    await assert.rejects(openFheReplayLedger(path,crypto.randomUUID()));
    const ledger=await openFheReplayLedger(path,ledgerId);
    const forged=structuredClone(result);forged.attestation.payload.sum++;
    await assert.rejects(ledger.verifyAndConsume(forged,round,request,participants,trust));
    ledger.close();
    const inputs={path,ledgerId,result,round,request,participants,trust};
    const outcomes=await Promise.all([worker(inputs),worker(inputs)]);
    assert.deepEqual(outcomes.sort(),['accepted','rejected']);
    const reopened=await openFheReplayLedger(path,ledgerId);
    await assert.rejects(reopened.verifyAndConsume(result,round,request,participants,trust));
    reopened.close();
    await assert.rejects(openFheReplayLedger(join(dir,'missing.sqlite'),ledgerId));
  } finally {encoder.destroy();owner.destroy();await rm(dir,{recursive:true,force:true});}
});
