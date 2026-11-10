import { canonical, hash } from '../crypto.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';
import { verifySignedSum } from './verified-sum-bridge.js';

// A signed statement about a verifiable result, not proof that an external
// recipient acted on it, that the input is truthful, or that a log is complete.
const DOMAIN = 'sumi/tool-result-attestation/v1\n';
const TOOL = 'sumi.sum.v1';
const ownKeys = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const fail = () => { throw new Error('ツール結果の記録または検証条件が不正です。'); };
const bytes = payload => new TextEncoder().encode(DOMAIN + canonical(payload));

async function checkEvidence(datasetId, request, evidence, proofTrust) {
  if (typeof datasetId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(datasetId)) fail();
  const invocationHash = await hash(canonical({ name: TOOL, arguments: { datasetId } }));
  if (request?.purpose !== `sumi-tool-v1:${invocationHash}`) fail();
  return verifySignedSum(evidence, request, proofTrust);
}

export async function attestVerifiedToolResult(datasetId, expectedRequest, inputEvidence, proofTrust, signerKeys) {
  const request = structuredClone(expectedRequest), evidence = structuredClone(inputEvidence), trust = structuredClone(proofTrust);
  const result = await checkEvidence(datasetId, request, evidence, trust);
  const payload = { format: 'sumi-tool-result-attestation', version: 1, tool: TOOL, datasetId, requestId: request.requestId, evidenceDigest: await hash(canonical(evidence)), sum: result.sum, count: result.count };
  return { payload, signatures: await signQuorum(bytes(payload), signerKeys) };
}

export async function verifyToolResultAttestation(input, expectedDatasetId, expectedRequest, inputEvidence, proofTrust, auditTrust) {
  const record = structuredClone(input), request = structuredClone(expectedRequest), evidence = structuredClone(inputEvidence), pTrust = structuredClone(proofTrust), aTrust = structuredClone(auditTrust);
  if (!ownKeys(record, ['payload', 'signatures']) || !ownKeys(record.payload, ['format', 'version', 'tool', 'datasetId', 'requestId', 'evidenceDigest', 'sum', 'count']) || record.payload.format !== 'sumi-tool-result-attestation' || record.payload.version !== 1 || record.payload.tool !== TOOL || record.payload.datasetId !== expectedDatasetId || record.payload.requestId !== request?.requestId || !ownKeys(aTrust, ['format', 'version', 'threshold', 'publicKeys']) || aTrust.format !== 'sumi-tool-audit-trust' || aTrust.version !== 1) fail();
  const proof = await checkEvidence(expectedDatasetId, request, evidence, pTrust);
  if (record.payload.evidenceDigest !== await hash(canonical(evidence)) || record.payload.sum !== proof.sum || record.payload.count !== proof.count) fail();
  const signatures = await verifyQuorum(bytes(record.payload), record.signatures, aTrust);
  return Object.freeze({ datasetId: expectedDatasetId, requestId: request.requestId, sum: proof.sum, count: proof.count, auditSignatures: signatures.verifiedSignatures, proofSignatures: proof.verifiedSignatures });
}
