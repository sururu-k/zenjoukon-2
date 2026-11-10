import { canonical, hash } from '../crypto.js';
import { verifyToolResultAttestation } from './tool-result-attestation.js';

const GENESIS = '0'.repeat(64);
const ownKeys = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const fail = () => { throw new Error('監査記録または外部チェックポイントが不正です。'); };
const digest = entry => hash(canonical({ domain: 'sumi/verified-tool-audit-log/v1', index: entry.index, previous: entry.previous, record: entry.record, evidence: entry.evidence }));

// The checkpoint must be retained separately by a trusted observer. A chain
// does not prove that every event was recorded or that the signer was honest.
export function createVerifiedToolAuditLog(proofTrust, auditTrust) {
  const pTrust = structuredClone(proofTrust), aTrust = structuredClone(auditTrust), entries = [], ids = new Set();
  let head = GENESIS, queue = Promise.resolve();
  return Object.freeze({
    async append(datasetId, expectedRequest, inputEvidence, inputRecord, expectedTool) {
      const request = structuredClone(expectedRequest), evidence = structuredClone(inputEvidence), record = structuredClone(inputRecord);
      await verifyToolResultAttestation(record, datasetId, request, evidence, pTrust, aTrust, expectedTool);
      const operation = queue.then(async () => {
        if (entries.length >= 100 || ids.has(request.requestId)) fail();
        const entry = { index: entries.length, previous: head, record, evidence };
        const next = await digest(entry);
        entries.push({ ...entry, digest: next }); ids.add(request.requestId); head = next;
        return Object.freeze({ size: entries.length, head });
      });
      queue = operation.catch(() => {});
      return operation;
    },
    snapshot() { return structuredClone({ format: 'sumi-verified-tool-audit-log', version: 1, entries }); },
    checkpoint() { return Object.freeze({ size: entries.length, head }); }
  });
}

export async function verifyToolAuditLog(input, expectedCheckpoint, expectedRequests, proofTrust, auditTrust) {
  const log = structuredClone(input), checkpoint = structuredClone(expectedCheckpoint), requests = structuredClone(expectedRequests), pTrust = structuredClone(proofTrust), aTrust = structuredClone(auditTrust);
  if (!ownKeys(log, ['format', 'version', 'entries']) || log.format !== 'sumi-verified-tool-audit-log' || log.version !== 1 || !Array.isArray(log.entries) || log.entries.length > 100 || !ownKeys(checkpoint, ['size', 'head']) || checkpoint.size !== log.entries.length || typeof checkpoint.head !== 'string' || !/^[0-9a-f]{64}$/.test(checkpoint.head) || !(requests instanceof Map)) fail();
  let previous = GENESIS;
  const ids = new Set();
  for (let i = 0; i < log.entries.length; i++) {
    const entry = log.entries[i], id = entry?.record?.payload?.requestId;
    if (!ownKeys(entry, ['index', 'previous', 'record', 'evidence', 'digest']) || entry.index !== i || entry.previous !== previous || typeof id !== 'string' || ids.has(id)) fail();
    const expected = requests.get(id);
    if (!(ownKeys(expected, ['datasetId', 'request']) || ownKeys(expected, ['datasetId', 'request', 'tool'])) || expected.request?.requestId !== id) fail();
    await verifyToolResultAttestation(entry.record, expected.datasetId, expected.request, entry.evidence, pTrust, aTrust, expected.tool);
    if (entry.digest !== await digest(entry)) fail();
    previous = entry.digest; ids.add(id);
  }
  if (previous !== checkpoint.head) fail();
  return Object.freeze({ size: log.entries.length, head: previous });
}
