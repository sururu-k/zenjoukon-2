'use strict';
(() => {
const groups=[['外へ出る平文','policy','Sumi.',[
['trace_plaintext_noninterference','操作を繰り返しても秘密を混ぜない','同じ要求列と公開を許可した値なら、秘密状態と暗号文を変えても、平文出力の列は一致します。任意の長さの有限操作列が対象です。'],
['external_plaintext_noninterference','1回の操作で秘密を混ぜない','同じ要求と公開を許可した値なら、秘密と暗号文を変えても平文出力は一致します。'],
['plaintext_depends_only_on_release','平文は公開を許可した値で決まる','平文出力は、要求と公開を許可した値だけから決まる射影に一致します。'],
['only_approved_plaintext','平文出力の候補を限定する','外部の平文出力は空か、公開を許可した値1件です。'],
['denied_emits_nothing','拒否した操作は何も出さない','認可されなかった要求は、出力イベントを生成しません。']]],
['操作の認可','policy','Sumi.',[
['plaintext_requires_public_review','コピー・共有には公開確認が必要','認可されるなら、公開分類・確認済み・最新状態という条件が成立します。'],
['draft_requires_encryption','保存には暗号化が必要','暗号化保存が認可されるなら、暗号化済みで最新状態です。暗号方式自体の安全性を示す定理ではありません。'],
['inference_requires_local_consent','AIには端末内接続と同意が必要','認可されるなら、同意済み・ループバック接続・最新状態です。'],
['unknown_denied','分類が不明なら拒否する','分類がunknownの要求は拒否されます。'],
['stale_denied','古い状態なら拒否する','freshがfalseの要求は拒否されます。'],
['unregistered_denied','未登録の出力先は拒否する','未登録の出力先への要求は拒否されます。']]],
['エージェント実行条件','agent','SumiAgent.',[
['execute_requires_fresh','最新状態であること','実行が許可されるなら、freshがtrueです。'],
['execute_requires_approval','承認されていること','実行が許可されるなら、approvedがtrueです。'],
['execute_requires_policy','ポリシーに適合すること','実行が許可されるなら、allowedがtrueです。'],
['execute_requires_target','対象が一致すること','実行が許可されるなら、targetがtrueです。'],
['execute_requires_supported','対応する操作であること','実行が許可されるなら、supportedがtrueです。']]]];
const parse=text=>new Map(text.trim().split('\n').map(line=>{const r=JSON.parse(line);return [r.name,r]}));
const reports={policy:parse(window.SUMI_POLICY_REPORT),agent:parse(window.LDR.DEFAULT_REPORT)};
const claims=new Map(),nav=document.querySelector('#claims'),detail=document.querySelector('#detail');
const add=(tag,text,parent)=>{const n=document.createElement(tag);n.textContent=text;parent.append(n);return n};
for(const [title,model,prefix,items] of groups){add('h3',title,nav);for(const [short,label,description] of items){const name=prefix+short,button=add('button',label,nav);button.type='button';button.addEventListener('click',()=>{location.hash=name});claims.set(name,{model,label,description,button})}}
function render(){const name=claims.has(location.hash.slice(1))?location.hash.slice(1):claims.keys().next().value;const {model,label,description}=claims.get(name),row=reports[model].get(name);for(const [key,c]of claims)c.button.setAttribute('aria-current',String(key===name));detail.replaceChildren();add('h2',label,detail).id='claim-title';add('p',description,detail);add('p',name,detail).className='identifier';add('h3','Leanの原文',detail);add('p',`${model==='policy'?'Policy':'Agent'}.lean · ${row.line}–${row.lineEnd}行 · sorryによる証明省略なし`,detail).className='note';add('code',row.source,add('pre','',detail));add('h3','この証明が直接使う定義・定理',detail);add('p','証明本体の依存先のうち、同じモデルの宣言を表示します。間接的な依存とLean標準ライブラリは省略しています。',detail).className='note';const deps=[...new Set(row.valueDeps)].filter(d=>d.startsWith(model==='policy'?'Sumi.':'SumiAgent.'));const list=add('ul','',detail);for(const dep of deps){const li=add('li','',list);if(claims.has(dep))add('a',claims.get(dep).label,li).href='#'+dep;else add('code',dep,li);const source=reports[model].get(dep);if(source?.source){const d=add('details','',li);add('summary','依存先の原文',d);add('pre',source.source,d)}}if(!deps.length)add('p','同じモデル内の直接の依存先はありません。',detail);const axioms=add('details','',detail);add('summary','公理を確認する',axioms);add('p',row.axioms.length?row.axioms.join(', '):'公理への依存は記録されていません。',axioms);add('a','このモデルの詳細グラフを開く',detail).href=`./${model}/index.html`}
window.addEventListener('hashchange',render);render();
})();
