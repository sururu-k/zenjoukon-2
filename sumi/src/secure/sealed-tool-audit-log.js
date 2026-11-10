import { encryptDraft, decryptDraft } from '../crypto.js';
import { createVerifiedToolAuditLog, verifyToolAuditLog } from './verified-tool-audit-log.js';

// Only the log is encrypted. Expected requests, keys and the checkpoint must
// come from a separate trusted source and are never taken from this file.
export async function sealToolAuditLog(inputLog, expectedCheckpoint, expectedRequests, proofTrust, auditTrust, passphrase) {
  const log = structuredClone(inputLog), checkpoint = structuredClone(expectedCheckpoint), requests = structuredClone(expectedRequests), pTrust = structuredClone(proofTrust), aTrust = structuredClone(auditTrust);
  await verifyToolAuditLog(log, checkpoint, requests, pTrust, aTrust);
  return encryptDraft({ format: 'sumi-sealed-tool-audit-log', version: 1, log }, passphrase);
}

export async function openToolAuditLog(envelope, passphrase, expectedCheckpoint, expectedRequests, proofTrust, auditTrust) {
  const sealed = structuredClone(envelope), checkpoint = structuredClone(expectedCheckpoint), requests = structuredClone(expectedRequests), pTrust = structuredClone(proofTrust), aTrust = structuredClone(auditTrust);
  const payload = await decryptDraft(sealed, passphrase);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 3 || payload.format !== 'sumi-sealed-tool-audit-log' || payload.version !== 1 || !Object.hasOwn(payload, 'log')) throw new Error('監査記録ファイルの形式が不正です。');
  await verifyToolAuditLog(payload.log, checkpoint, requests, pTrust, aTrust);
  const restored = createVerifiedToolAuditLog(pTrust, aTrust);
  for (const entry of payload.log.entries) {
    const expected = requests.get(entry.record.payload.requestId);
    await restored.append(expected.datasetId, expected.request, entry.evidence, entry.record);
  }
  return restored;
}
