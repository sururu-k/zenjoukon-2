import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { decide, LABELS, ACTIONS, SINKS } from '../src/authorization.js';
import { channelFor, CHANNELS } from '../src/information-flow.js';

export const THEOREMS=Object.freeze(['unknown_denied','stale_denied','unregistered_denied','plaintext_requires_public_review','draft_requires_encryption','inference_requires_local_consent','denied_emits_nothing','plaintext_depends_only_on_release','external_plaintext_noninterference','trace_plaintext_noninterference','only_approved_plaintext'].map(n=>'Sumi.'+n));

// Leanで検査した定義を全入力で評価し、実際に使うJS判定との有限領域での一致を検査する。
export function checkFormal(){
const checked=spawnSync('lean',['--run','Policy.lean'],{cwd:fileURLToPath(new URL('../formal/',import.meta.url)),encoding:'utf8',maxBuffer:2_000_000});
if(checked.error||checked.status!==0){process.stderr.write(checked.stdout||'');process.stderr.write(checked.stderr||'');throw checked.error||new Error('認可モデルのLean検査に失敗しました。');}
const bits=checked.stdout.match(/^SUMI_POLICY_DECISIONS=([01]+)$/m)?.[1];
const channels=checked.stdout.match(/^SUMI_FLOW_CHANNELS=([0-4]+)$/m)?.[1];
assert.ok(bits,'Leanモデルの判定結果がありません。');
assert.equal(bits.length,2560);
assert.equal(channels?.length,2560,'情報流の経路を確認できません。');
const axioms=[...checked.stdout.matchAll(/'([^']+)' (?:depends on axioms: \[([^\]]*)\]|does not depend on any axioms)/g)];
assert.deepEqual(axioms.map(m=>m[1]).sort(),[...THEOREMS].sort(),'検査対象の定理を確認できません。');
for(const [,,list=''] of axioms)for(const name of list.split(',').map(s=>s.trim()).filter(Boolean))assert.ok(['propext','Classical.choice','Quot.sound'].includes(name),`追加公理: ${name}`);
let i=0;
for(const label of LABELS)for(const action of ACTIONS)for(const sink of SINKS)for(let flags=0;flags<32;flags++){
  const r={label,action,sink,reviewed:!!(flags&1),fresh:!!(flags&2),encrypted:!!(flags&4),consented:!!(flags&8),loopback:!!(flags&16)};
  assert.equal(decide(r).allow,bits[i]==='1',JSON.stringify(r));
  assert.equal(channelFor(r),CHANNELS[Number(channels[i++])],JSON.stringify(r));
}
const report={theorems:THEOREMS,axioms:axioms.map(m=>({theorem:m[1],axioms:(m[2]||'').split(',').map(s=>s.trim()).filter(Boolean)})),authorizationCases:i,channelCases:i,refinement:'finite-selector-equivalence',fullJavaScriptProof:false,completeSystemProof:false};
console.log(`Lean: ${THEOREMS.length}の定理を検査。認可と情報流のJavaScript対応: 各${i.toLocaleString()}条件。`);
return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)checkFormal();
