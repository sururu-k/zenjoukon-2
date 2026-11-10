'use strict';
(() => {
const groups=[['コピー・共有するデータ','policy','Sumi.',[
['trace_plaintext_noninterference','何回操作しても機密データの違いに影響されない','操作の内容・順序と共有の承認済みデータが同じなら、機密データや暗号文だけを変えても、コピー・共有されるデータとその順序は変わりません。有限回で終わる操作なら、回数にかかわらず成り立ちます。'],
['external_plaintext_noninterference','1回の操作でも機密データの違いに影響されない','同じ操作で同じ承認済みデータを使う場合、機密データや暗号文だけを変えても、コピー・共有されるデータは変わりません。'],
['plaintext_depends_only_on_release','出力は操作と承認済みデータで決まる','コピー・共有に出るデータは、操作の内容と共有を承認したデータだけで決まります。'],
['only_approved_plaintext','出力するなら承認済みデータだけ','1回の操作でコピー・共有されるデータは、何も出力されないか、共有を承認したデータ1件のどちらかです。'],
['denied_emits_nothing','拒否した操作は何も出さない','許可されなかった操作は、コピー・共有・暗号化保存・端末内AIへのデータ送信を行いません。']]],
['操作を許可する条件','policy','Sumi.',[
['plaintext_requires_public_review','コピー・共有には確認済みの公開データが必要','コピー・共有が許可されるには、データが公開用に分類され、内容の確認が済み、操作対象が最新状態である必要があります。'],
['draft_requires_encryption','保存には暗号化が必要','暗号化保存が許可されるには、暗号化済みで、操作対象が最新状態である必要があります。ここでは暗号方式自体の安全性は検証していません。'],
['inference_requires_local_consent','AIには端末内接続と同意が必要','AI処理が許可されるには、ユーザーの同意があり、接続先が同じ端末内を指すループバックアドレスで、操作対象が最新状態である必要があります。'],
['unknown_denied','分類が不明なら拒否する','データの機密区分が未分類（unknown）の場合、操作を拒否します。'],
['stale_denied','古い状態なら拒否する','操作対象を最新状態として扱えない場合（fresh = false）、操作を拒否します。'],
['unregistered_denied','未登録の出力先は拒否する','登録されていない出力先にデータを送る操作は拒否します。']]],
['エージェント実行条件','agent','SumiAgent.',[
['execute_requires_fresh','最新状態であること','実行の許可には、最新状態であることを示すフラグ（fresh）がtrueである必要があります。'],
['execute_requires_approval','承認されていること','実行の許可には、承認済みを示すフラグ（approved）がtrueである必要があります。'],
['execute_requires_policy','ポリシーに適合すること','実行の許可には、ポリシー上の許可を示すフラグ（allowed）がtrueである必要があります。'],
['execute_requires_target','対象が一致すること','実行の許可には、対象の一致を示すフラグ（target）がtrueである必要があります。'],
['execute_requires_supported','対応する操作であること','実行の許可には、対応する操作であることを示すフラグ（supported）がtrueである必要があります。']]]];
const parse=text=>new Map(text.trim().split('\n').map(line=>{const r=JSON.parse(line);return [r.name,r]}));
const reports={policy:parse(window.SUMI_POLICY_REPORT),agent:parse(window.LDR.DEFAULT_REPORT)};
const claims=new Map(),nav=document.querySelector('#claims'),detail=document.querySelector('#detail');
const add=(tag,text,parent)=>{const n=document.createElement(tag);n.textContent=text;parent.append(n);return n};
for(const [title,model,prefix,items] of groups){add('h3',title,nav);for(const [short,label,description] of items){const name=prefix+short,button=add('button',label,nav);button.type='button';button.addEventListener('click',()=>{location.hash=name});claims.set(name,{model,label,description,button})}}
function render(){const name=claims.has(location.hash.slice(1))?location.hash.slice(1):claims.keys().next().value;const {model,label,description}=claims.get(name),row=reports[model].get(name);for(const [key,c]of claims)c.button.setAttribute('aria-current',String(key===name));detail.replaceChildren();add('h2',label,detail).id='claim-title';add('p',description,detail);add('p',name,detail).className='identifier';add('h3','対応するLeanの証明コード',detail);add('p',`${model==='policy'?'Policy':'Agent'}.lean · ${row.line}–${row.lineEnd}行 · 証明の省略（sorry）なし`,detail).className='note';add('code',row.source,add('pre','',detail));add('h3','この証明が使っているコード',detail);add('p','この証明から直接参照する関数・型・ほかの証明を表示します。同じモデル内のコードが対象です。参照先がさらに使うコードや、Leanの標準ライブラリは省略しています。',detail).className='note';const deps=[...new Set(row.valueDeps)].filter(d=>d.startsWith(model==='policy'?'Sumi.':'SumiAgent.'));const list=add('ul','',detail);for(const dep of deps){const li=add('li','',list);if(claims.has(dep))add('a',claims.get(dep).label,li).href='#'+dep;else add('code',dep,li);const source=reports[model].get(dep);if(source?.source){const d=add('details','',li);add('summary','参照先のコードを見る',d);add('pre',source.source,d)}}if(!deps.length)add('p','同じモデル内のコードへの直接の参照はありません。',detail);const axioms=add('details','',detail);add('summary','証明の前提となる公理を見る',axioms);add('p',row.axioms.length?'公理は、証明せずに前提として使う命題です。この証明が使う公理：' + row.axioms.join(', '):'この証明には、公理（証明せずに前提として使う命題）への依存は記録されていません。',axioms);add('a','コード全体の依存関係をグラフで見る',detail).href=`./${model}/index.html`}
window.addEventListener('hashchange',render);render();
})();
