import { createVerifiedSumToolGateway } from './verified-tool-gateway.js';

// Trusted owner controls the dataset allowlist and approves one invocation.
// The agent only receives the narrow run method. This is an API boundary,
// not isolation from code that can access the owner or the transport directly.
export function createAgentVerifiedTool({ trust, recipient, datasets, transport, minimumCount = 3, recordCandidate, toolName }) {
  if (!Array.isArray(datasets) || datasets.length < 1 || datasets.length > 50 || datasets.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) || new Set(datasets).size !== datasets.length || typeof transport !== 'function' || !Number.isInteger(minimumCount) || minimumCount < 3 || minimumCount > 1000 || (recordCandidate !== undefined && typeof recordCandidate !== 'function')) throw new Error('ツール設定が不正です。');
  const allowed = new Set(datasets);
  const verifier = createVerifiedSumToolGateway(trust, recipient, toolName);
  let revision = 0, approval = null;
  const denied = reason => Object.freeze({ status: 'denied', reason });
  const agent = Object.freeze({
    async run(input) {
      const datasetId = input?.datasetId, expectedRevision = input?.revision;
      if (typeof datasetId !== 'string' || !Number.isInteger(expectedRevision) || !approval || approval.state !== 'ready' || approval.datasetId !== datasetId || revision !== expectedRevision || !allowed.has(datasetId)) return denied('対象の確認が必要です。');
      const ticket = approval;
      ticket.state = 'inflight';
      const current = () => approval === ticket && revision === expectedRevision && ticket.state === 'inflight';
      try {
        const call = await verifier.begin(datasetId);
        if (!current()) return denied('確認が変更されました。');
        // The transport may retain and mutate its response. Keep the same
        // snapshot for verification and the optional trusted audit sink.
        const response = structuredClone(await transport(call));
        if (!current()) return denied('確認が変更されました。');
        const result = await verifier.accept(call.request.requestId, response);
        if (!current()) return denied('確認が変更されました。');
        if (result.count < minimumCount) return denied('公開に必要な件数を満たしていません。');
        if (recordCandidate) {
          await recordCandidate({ datasetId, request: structuredClone(call.request), evidence: structuredClone(response.evidence) });
          if (!current()) return denied('確認が変更されました。');
        }
        return Object.freeze({ status: 'completed', tool: result.name, datasetId, sum: result.sum, count: result.count, verifiedSignatures: result.verifiedSignatures });
      } catch {
        return denied('ツール結果を検証できませんでした。');
      } finally {
        if (approval === ticket) ticket.state = 'used';
      }
    }
  });
  return Object.freeze({
    agent,
    get revision() { return revision; },
    approve(datasetId, expectedRevision) {
      if (!allowed.has(datasetId) || expectedRevision !== revision) throw new Error('対象または版を確認してください。');
      approval = { datasetId, state: 'ready' };
    },
    invalidate() { revision++; approval = null; }
  });
}
