import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, hash, makeSigningKey } from '../src/crypto.js';
import { prepareRandomizedSumSnapshot } from '../src/secure/sealed-randomized-sum-tool.js';
import { RANDOMIZED_SUM_TOOL } from '../src/secure/verified-tool-gateway.js';
import { signAgentToolPolicy, createAgentToolFromSignedPolicy } from '../src/secure/signed-agent-tool-policy.js';
import { createAgentFromPinnedRandomizedSnapshot } from '../src/secure/pinned-randomized-agent.js';

test('signed policy pins the snapshot used by the agent across instances', async () => {
  const policyKey=await makeSigningKey(), prover=await makeSigningKey(), outsider=await makeSigningKey(), passphrase='test-only-random-passphrase';
  const policyTrust={format:'sumi-agent-tool-policy-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',policyKey.publicKey)]};
  const proofTrust={format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',prover.publicKey)]};
  const snapshot=await prepareRandomizedSumSnapshot({school:[true,false,true]},passphrase);
  const other=await prepareRandomizedSumSnapshot({school:[true,false,true]},passphrase);
  const policy={format:'sumi-agent-tool-policy',version:3,policyId:'pinned-policy-001',recipient:'reader',datasets:['school'],minimumCount:3,tool:RANDOMIZED_SUM_TOOL,snapshotCheckpoint:snapshot.checkpoint};
  const signedPolicy=await signAgentToolPolicy(policy,[policyKey]), expectedPolicyHash=await hash(canonical(policy));
  const config={signedPolicy,expectedPolicyHash,policyTrust,proofTrust,envelope:snapshot.envelope,passphrase,signingKeys:[prover]};
  await assert.rejects(createAgentToolFromSignedPolicy({...config,transport:()=>{throw new Error('should not run');}}));
  await assert.rejects(createAgentFromPinnedRandomizedSnapshot({...config,envelope:other.envelope}));
  await assert.rejects(createAgentFromPinnedRandomizedSnapshot({...config,passphrase:'wrong-password-123'}));
  await assert.rejects(createAgentFromPinnedRandomizedSnapshot({...config,signingKeys:[outsider]}));
  const altered=structuredClone(signedPolicy);altered.policy.snapshotCheckpoint=other.checkpoint;
  await assert.rejects(createAgentFromPinnedRandomizedSnapshot({...config,signedPolicy:altered,envelope:other.envelope}));
  const [a,b]=await Promise.all([createAgentFromPinnedRandomizedSnapshot(config),createAgentFromPinnedRandomizedSnapshot(config)]);
  a.owner.approve('school',0);b.owner.approve('school',0);
  const [ra,rb]=await Promise.all([a.owner.agent.run({datasetId:'school',revision:0}),b.owner.agent.run({datasetId:'school',revision:0})]);
  assert.equal(ra.status,'completed');assert.equal(rb.status,'completed');assert.equal(ra.sum,rb.sum);
  assert.equal(ra.tool,RANDOMIZED_SUM_TOOL);
});
