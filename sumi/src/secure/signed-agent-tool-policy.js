import { canonical, hash } from '../crypto.js';
import { isWellFormedUnicode } from '../school-policy-contract.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';
import { createAgentVerifiedTool } from './agent-verified-tool.js';

const DOMAIN = 'sumi/signed-agent-tool-policy/v1\n';
const ownKeys = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const fail = () => { throw new Error('ツール設定、期待値または信頼鍵が不正です。'); };
const bytes = p => new TextEncoder().encode(DOMAIN + canonical(p));
function policySnapshot(input) {
  const p = structuredClone(input);
  if (!ownKeys(p, ['format','version','policyId','recipient','datasets','minimumCount']) || p.format !== 'sumi-agent-tool-policy' || p.version !== 1 || typeof p.policyId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(p.policyId) || typeof p.recipient !== 'string' || !p.recipient.trim() || p.recipient.length > 120 || !isWellFormedUnicode(p.recipient) || !Array.isArray(p.datasets) || p.datasets.length < 1 || p.datasets.length > 50 || p.datasets.some(v => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v)) || new Set(p.datasets).size !== p.datasets.length || !Number.isInteger(p.minimumCount) || p.minimumCount < 3 || p.minimumCount > 1000) fail();
  return p;
}

export async function signAgentToolPolicy(input, keyPairs) {
  const policy = policySnapshot(input);
  const keys = Array.isArray(keyPairs) ? keyPairs.map(pair => ({publicKey:pair.publicKey,privateKey:pair.privateKey})) : keyPairs;
  return { format:'sumi-signed-agent-tool-policy',version:1,policy,signatures:await signQuorum(bytes(policy),keys) };
}

export async function verifyAgentToolPolicy(input, expectedPolicyHash, trust) {
  const signed = structuredClone(input), anchors = structuredClone(trust);
  if (!ownKeys(signed,['format','version','policy','signatures']) || signed.format !== 'sumi-signed-agent-tool-policy' || signed.version !== 1 || !ownKeys(anchors,['format','version','threshold','publicKeys']) || anchors.format !== 'sumi-agent-tool-policy-trust' || anchors.version !== 1 || typeof expectedPolicyHash !== 'string' || !/^[0-9a-f]{64}$/.test(expectedPolicyHash)) fail();
  const policy = policySnapshot(signed.policy), policyHash = await hash(canonical(policy));
  if (policyHash !== expectedPolicyHash) fail();
  const quorum = await verifyQuorum(bytes(policy), signed.signatures, anchors);
  Object.freeze(policy.datasets); Object.freeze(policy);
  return Object.freeze({policy,policyHash,...quorum});
}

// expectedPolicyHash, policyTrust and proofTrust come from the owner, not the
// signed package or transport. Signatures do not provide key revocation.
export async function createAgentToolFromSignedPolicy({ signedPolicy, expectedPolicyHash, policyTrust, proofTrust, transport, recordCandidate }) {
  const signed = structuredClone(signedPolicy), anchors = structuredClone(policyTrust), evidenceTrust = structuredClone(proofTrust);
  const checked = await verifyAgentToolPolicy(signed, expectedPolicyHash, anchors);
  const owner = createAgentVerifiedTool({ trust:evidenceTrust, recipient:checked.policy.recipient, datasets:checked.policy.datasets, minimumCount:checked.policy.minimumCount, transport, recordCandidate });
  return Object.freeze({owner,policyHash:checked.policyHash,policySignatures:checked.verifiedSignatures});
}
