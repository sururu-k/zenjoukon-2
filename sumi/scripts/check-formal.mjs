import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { decide, LABELS, ACTIONS, SINKS } from '../src/authorization.js';
import { channelFor, CHANNELS } from '../src/information-flow.js';
import { canExecuteAgent } from '../src/agent-access.js';
import { verifierTransition, VERIFIER_STATES, VERIFIER_EVENTS } from '../src/secure/verifier-state.js';

export const THEOREMS=Object.freeze(['unknown_denied','stale_denied','unregistered_denied','plaintext_requires_public_review','draft_requires_encryption','inference_requires_local_consent','denied_emits_nothing','plaintext_depends_only_on_release','external_plaintext_noninterference','trace_plaintext_noninterference','only_approved_plaintext'].map(n=>'Sumi.'+n));
export const AGENT_THEOREMS=Object.freeze(['fresh','approval','policy','target','supported'].map(n=>'SumiAgent.execute_requires_'+n));
export const RELEASE_THEOREMS=Object.freeze(['edit_revokes','destination_change_revokes','unapproved_emits_nothing','wrong_destination_emits_nothing','edit_then_release_emits_nothing','emitted_is_current_and_approved','every_emission_is_current_and_approved'].map(n=>'SumiRelease.'+n));
export const VERIFIER_THEOREMS=Object.freeze(['acceptance_requires_verifying','begin_reserves','failure_allows_retry','success_consumes','cancel_blocks_success','consumed_never_accepts','cancelled_never_accepts','at_most_one_acceptance'].map(n=>'SumiVerifier.'+n));

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
const agent=spawnSync('lean',['--run','Agent.lean'],{cwd:fileURLToPath(new URL('../formal/',import.meta.url)),encoding:'utf8',maxBuffer:2_000_000});
if(agent.error||agent.status!==0){process.stderr.write(agent.stdout||'');process.stderr.write(agent.stderr||'');throw agent.error||new Error('エージェントモデルのLean検査に失敗しました。');}
const agentBits=agent.stdout.match(/^SUMI_AGENT_GATE=([01]+)$/m)?.[1];assert.equal(agentBits?.length,32);
const agentAxioms=[...agent.stdout.matchAll(/'([^']+)' (?:depends on axioms: \[([^\]]*)\]|does not depend on any axioms)/g)];
assert.deepEqual(agentAxioms.map(m=>m[1]).sort(),[...AGENT_THEOREMS].sort());
for(const [,,list=''] of agentAxioms)for(const name of list.split(',').map(s=>s.trim()).filter(Boolean))assert.ok(['propext','Classical.choice','Quot.sound'].includes(name),`追加公理: ${name}`);
for(let flags=0;flags<32;flags++)assert.equal(canExecuteAgent({fresh:!!(flags&1),approved:!!(flags&2),allowed:!!(flags&4),target:!!(flags&8),supported:!!(flags&16)}),agentBits[flags]==='1');
const release=spawnSync('lean',['Release.lean'],{cwd:fileURLToPath(new URL('../formal/',import.meta.url)),encoding:'utf8',maxBuffer:2_000_000});
if(release.error||release.status!==0){process.stderr.write(release.stdout||'');process.stderr.write(release.stderr||'');throw release.error||new Error('出力状態モデルのLean検査に失敗しました。');}
const releaseAxioms=[...release.stdout.matchAll(/'([^']+)' (?:depends on axioms: \[([^\]]*)\]|does not depend on any axioms)/g)];
assert.deepEqual(releaseAxioms.map(m=>m[1]).sort(),[...RELEASE_THEOREMS].sort());
for(const [,,list=''] of releaseAxioms)for(const name of list.split(',').map(s=>s.trim()).filter(Boolean))assert.ok(['propext','Classical.choice','Quot.sound'].includes(name),`追加公理: ${name}`);
const verifier=spawnSync('lean',['--run','Verifier.lean'],{cwd:fileURLToPath(new URL('../formal/',import.meta.url)),encoding:'utf8',maxBuffer:2_000_000});
if(verifier.error||verifier.status!==0){process.stderr.write(verifier.stdout||'');process.stderr.write(verifier.stderr||'');throw verifier.error||new Error('検証セッションモデルのLean検査に失敗しました。');}
const verifierDigits=verifier.stdout.match(/^SUMI_VERIFIER_TRANSITIONS=([0-7]+)$/m)?.[1];assert.equal(verifierDigits?.length,16);
const verifierAxioms=[...verifier.stdout.matchAll(/'([^']+)' (?:depends on axioms: \[([^\]]*)\]|does not depend on any axioms)/g)];
assert.deepEqual(verifierAxioms.map(m=>m[1]).sort(),[...VERIFIER_THEOREMS].sort());
for(const [,,list=''] of verifierAxioms)for(const name of list.split(',').map(s=>s.trim()).filter(Boolean))assert.ok(['propext','Classical.choice','Quot.sound'].includes(name),`追加公理: ${name}`);
let vi=0;for(const state of VERIFIER_STATES)for(const event of VERIFIER_EVENTS){const t=verifierTransition(state,event);assert.equal(2*VERIFIER_STATES.indexOf(t.state)+Number(t.accepted),Number(verifierDigits[vi++]));}
const report={theorems:THEOREMS,axioms:axioms.map(m=>({theorem:m[1],axioms:(m[2]||'').split(',').map(s=>s.trim()).filter(Boolean)})),authorizationCases:i,channelCases:i,agent:{theorems:AGENT_THEOREMS,axioms:agentAxioms.map(m=>({theorem:m[1],axioms:(m[2]||'').split(',').map(s=>s.trim()).filter(Boolean)})),selectorCases:32,fullRuntimeProof:false},release:{theorems:RELEASE_THEOREMS,axioms:releaseAxioms.map(m=>({theorem:m[1],axioms:(m[2]||'').split(',').map(s=>s.trim()).filter(Boolean)})),runtimeCorrespondenceProved:false},verifier:{theorems:VERIFIER_THEOREMS,axioms:verifierAxioms.map(m=>({theorem:m[1],axioms:(m[2]||'').split(',').map(s=>s.trim()).filter(Boolean)})),transitionCases:vi,fullRuntimeProof:false},refinement:'finite-selector-equivalence',fullJavaScriptProof:false,completeSystemProof:false};
console.log(`Lean: ${THEOREMS.length}の定理を検査。認可と情報流のJavaScript対応: 各${i.toLocaleString()}条件。`);
console.log(`エージェント：${AGENT_THEOREMS.length}定理、実行判定のJavaScript対応: 32条件。`);
console.log(`出力状態モデル：${RELEASE_THEOREMS.length}定理を検査。実装との対応は未証明。`);
console.log(`検証セッション：${VERIFIER_THEOREMS.length}定理、状態遷移のJavaScript対応: ${vi}条件。`);
return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)checkFormal();
