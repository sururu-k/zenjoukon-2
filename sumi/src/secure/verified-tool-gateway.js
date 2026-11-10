import { canonical, hash } from '../crypto.js';
import { createSumVerifierSession } from './verified-sum-bridge.js';

// Local adapter, not an implementation of the MCP specification. The
// dataset name is public and does not authenticate the underlying data.
const TOOL = 'sumi.sum.v1';
const ownKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const invalid = () => { throw new Error('ツール呼び出しまたは検証結果が不正です。'); };

export function createVerifiedSumToolGateway(trust, recipient) {
  if (typeof recipient !== 'string' || !recipient.trim() || recipient.length > 120) invalid();
  const verifier = createSumVerifierSession(trust);
  const issued = new Map();
  return Object.freeze({
    async begin(datasetId) {
      if (typeof datasetId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(datasetId)) invalid();
      const args = Object.freeze({ datasetId });
      const invocationHash = await hash(canonical({ name: TOOL, arguments: args }));
      const request = verifier.issue(`sumi-tool-v1:${invocationHash}`, recipient);
      issued.set(request.requestId, Object.freeze({ datasetId, request }));
      return Object.freeze({ name: TOOL, arguments: args, request });
    },
    async accept(requestId, input) {
      const entry = issued.get(requestId);
      if (!entry) invalid();
      const response = structuredClone(input);
      if (!ownKeys(response, ['result', 'evidence']) || !ownKeys(response.result, ['sum', 'count']) || !Number.isSafeInteger(response.result.sum) || !Number.isSafeInteger(response.result.count)) invalid();
      // Reject inconsistent output without consuming the request. The proof
      // and signatures are still checked independently before any return.
      const proof = response.evidence?.payload?.proof;
      if (proof?.sum !== response.result.sum || proof?.count !== response.result.count) invalid();
      const verified = await verifier.verifyAndConsume(response.evidence, requestId);
      if (verified.sum !== response.result.sum || verified.count !== response.result.count) invalid();
      return Object.freeze({ name: TOOL, datasetId: entry.datasetId, sum: verified.sum, count: verified.count, verifiedSignatures: verified.verifiedSignatures });
    }
  });
}
