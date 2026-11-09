import { composeDocument, prepareDocument, WRITER_SAMPLE, DOCUMENT_SAMPLE } from '../src/document-workflow.js';
import { decide, requestFor, outputClassification, POLICY_ID } from '../src/authorization.js';
import { proveCommittedSum, verifyCommittedSum } from '../src/secure/zk.js';

// The same export decision is evaluated for each product. This demo does not
// perform an export: a real human review cannot be inferred by a program.
function exportDecision(label) {
  return decide(requestFor('export', 'share-file', label, { fresh: true, reviewed: false }));
}
const document = composeDocument(WRITER_SAMPLE);
const prepared = prepareDocument(DOCUMENT_SAMPLE);
const proof = proveCommittedSum([12, 18, 9, 21], '各班の参加人数の合計');
const output = {
  demo: true,
  commonPolicy: POLICY_ID,
  write: { document, beforeReview: exportDecision('public') },
  gate: { prepared: prepared.result.text, beforeReview: exportDecision(outputClassification(prepared.policy, prepared.result.kept)) },
  prove: { count: proof.count, sum: proof.sum, verified: verifyCommittedSum(proof), beforeReview: exportDecision('public'), doesNotProve: ['入力の真実性', '情報漏洩全体の不在'] }
};
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
