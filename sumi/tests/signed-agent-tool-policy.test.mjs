import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, hash, makeSigningKey } from '../src/crypto.js';
import { createSignedSum } from '../src/secure/verified-sum-bridge.js';
import { signAgentToolPolicy, verifyAgentToolPolicy, createAgentToolFromSignedPolicy } from '../src/secure/signed-agent-tool-policy.js';
import { RANDOMIZED_SUM_TOOL } from '../src/secure/verified-tool-gateway.js';
import { createRandomizedSumTool } from '../src/secure/randomized-sum-tool.js';

async function fixture() {
  const admins=await Promise.all([makeSigningKey(),makeSigningKey()]), prover=await makeSigningKey();
  const policy={format:'sumi-agent-tool-policy',version:1,policyId:'school-policy-v1',recipient:'test-owner',datasets:['school'],minimumCount:4};
  const expectedPolicyHash=await hash(canonical(policy));
  const policyTrust={format:'sumi-agent-tool-policy-trust',version:1,threshold:2,publicKeys:await Promise.all(admins.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))};
  const proofTrust={format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',prover.publicKey)]};
  const signedPolicy=await signAgentToolPolicy(policy,admins);
  const transport=async call=>{const evidence=await createSignedSum([1,2,3],call.request,[prover]);return {result:{sum:6,count:3},evidence};};
  return {admins,policy,policyTrust,proofTrust,expectedPolicyHash,signedPolicy,transport};
}

test('signed policy controls agent datasets and minimum count', async () => {
  const f=await fixture();
  const checked=await verifyAgentToolPolicy(f.signedPolicy,f.expectedPolicyHash,f.policyTrust);
  assert.equal(checked.verifiedSignatures,2); assert.equal(Object.isFrozen(checked.policy.datasets),true);
  const {owner}=await createAgentToolFromSignedPolicy(f);
  assert.throws(()=>owner.approve('community',0));
  owner.approve('school',0);
  const result=await owner.agent.run({datasetId:'school',revision:0});
  assert.equal(result.status,'denied');assert.equal(Object.hasOwn(result,'sum'),false);
});

test('version 2 policy binds the selected randomized tool', async () => {
  const f=await fixture(), prover=await makeSigningKey();
  const policy={...f.policy,version:2,tool:RANDOMIZED_SUM_TOOL,minimumCount:3};
  const signedPolicy=await signAgentToolPolicy(policy,f.admins), expectedPolicyHash=await hash(canonical(policy));
  const proofTrust={format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',prover.publicKey)]};
  const tool=createRandomizedSumTool({school:[true,false,true]},[prover]);
  const {owner}=await createAgentToolFromSignedPolicy({signedPolicy,expectedPolicyHash,policyTrust:f.policyTrust,proofTrust,transport:call=>tool.run(call)});
  owner.approve('school',0);
  const result=await owner.agent.run({datasetId:'school',revision:0});
  assert.equal(result.status,'completed');assert.equal(result.tool,RANDOMIZED_SUM_TOOL);
  const changed=structuredClone(signedPolicy);changed.policy.tool='sumi.sum.v1';
  await assert.rejects(verifyAgentToolPolicy(changed,expectedPolicyHash,f.policyTrust));
});

test('tampered, stale, insufficient or untrusted policy is rejected before startup', async () => {
  const f=await fixture();
  const changed=structuredClone(f.signedPolicy);changed.policy.minimumCount=3;
  await assert.rejects(verifyAgentToolPolicy(changed,f.expectedPolicyHash,f.policyTrust));
  await assert.rejects(verifyAgentToolPolicy(f.signedPolicy,'0'.repeat(64),f.policyTrust));
  const one=structuredClone(f.signedPolicy);one.signatures.pop();
  await assert.rejects(verifyAgentToolPolicy(one,f.expectedPolicyHash,f.policyTrust));
  const outsider=await makeSigningKey();
  const wrong={...f.policyTrust,publicKeys:[f.policyTrust.publicKeys[0],await crypto.subtle.exportKey('jwk',outsider.publicKey)]};
  await assert.rejects(verifyAgentToolPolicy(f.signedPolicy,f.expectedPolicyHash,wrong));
  await assert.rejects(createAgentToolFromSignedPolicy({...f,signedPolicy:changed}));
});
