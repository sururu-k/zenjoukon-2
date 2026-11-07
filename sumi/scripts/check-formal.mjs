import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { decide, LABELS, ACTIONS, SINKS } from '../src/authorization.js';

// Leanで検査した定義を全入力で評価し、実際に使うJS判定との有限領域での一致を検査する。
const checked=spawnSync('lean',['--run','Policy.lean'],{cwd:fileURLToPath(new URL('../formal/',import.meta.url)),encoding:'utf8',maxBuffer:2_000_000});
if(checked.error||checked.status!==0){process.stderr.write(checked.stdout||'');process.stderr.write(checked.stderr||'');throw checked.error||new Error('認可モデルのLean検査に失敗しました。');}
const bits=checked.stdout.match(/^SUMI_POLICY_DECISIONS=([01]+)$/m)?.[1];
assert.ok(bits,'Leanモデルの判定結果がありません。');
assert.equal(bits.length,2560);
const axioms=[...checked.stdout.matchAll(/depends on axioms: \[([^\]]*)\]/g)];
assert.equal(axioms.length,6,'6つの定理の公理検査を確認できません。');
for(const [,list] of axioms)for(const name of list.split(',').map(s=>s.trim()).filter(Boolean))assert.ok(['propext','Classical.choice','Quot.sound'].includes(name),`追加公理: ${name}`);
let i=0;
for(const label of LABELS)for(const action of ACTIONS)for(const sink of SINKS)for(let flags=0;flags<32;flags++){
  const r={label,action,sink,reviewed:!!(flags&1),fresh:!!(flags&2),encrypted:!!(flags&4),consented:!!(flags&8),loopback:!!(flags&16)};
  assert.equal(decide(r).allow,bits[i++]==='1',JSON.stringify(r));
}
console.log('Lean: 6つの定理を検査。JavaScript判定との一致: 2,560条件。');
