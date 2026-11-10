import { verifyAgentToolPolicy } from './signed-agent-tool-policy.js';
import { openRandomizedSumSnapshot } from './sealed-randomized-sum-tool.js';
import { createAgentVerifiedTool } from './agent-verified-tool.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';

// In-process trusted adapter. It controls the transport and checks the sealed
// snapshot against the independently pinned signed policy before starting.
export async function createAgentFromPinnedRandomizedSnapshot({ signedPolicy, expectedPolicyHash, policyTrust, proofTrust, envelope, passphrase, signingKeys, recordCandidate }) {
  const signed=structuredClone(signedPolicy), pTrust=structuredClone(policyTrust), tTrust=structuredClone(proofTrust), sealed=structuredClone(envelope);
  const keys=Array.isArray(signingKeys)?signingKeys.map(pair=>({publicKey:pair.publicKey,privateKey:pair.privateKey})):null;
  const checked=await verifyAgentToolPolicy(signed,expectedPolicyHash,pTrust);
  if (checked.policy.version!==3 || !tTrust || tTrust.format!=='sumi-sum-verifier-trust' || tTrust.version!==1 || !keys) throw new Error('固定されたランダム化設定または信頼鍵が不正です。');
  const challenge=new TextEncoder().encode('sumi/pinned-randomized-signer-check/v1');
  await verifyQuorum(challenge,await signQuorum(challenge,keys),tTrust);
  const tool=await openRandomizedSumSnapshot(sealed,passphrase,checked.policy.snapshotCheckpoint,keys);
  const owner=createAgentVerifiedTool({trust:tTrust,recipient:checked.policy.recipient,datasets:checked.policy.datasets,minimumCount:checked.policy.minimumCount,toolName:checked.policy.tool,transport:call=>tool.run(call),recordCandidate});
  return Object.freeze({owner,policyHash:checked.policyHash,policySignatures:checked.verifiedSignatures});
}
