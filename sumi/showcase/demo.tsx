import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Stage } from './vendor/kit/stage';
import { Window } from './vendor/kit/window';
import { Button } from './vendor/kit/controls/Button';
import { States } from './vendor/kit/motion/States';
import type { Act } from './vendor/kit/act';
import './demo.css';

type Scene = { id:string; name:string; title:string; body:string; inputLabel:string; input:string; action:string; before:string; after:string; outcome:string; limit:string; link:string; linkText:string; };
const scenes: Scene[] = [
  {id:'proof',name:'文書の条件の証明',title:'本文を見せず、指定語がないことを検証する',body:'提出者は文書と秘密の値から証明を作り、確認者は別途確認した公開条件と照合します。',inputLabel:'公開する条件',input:'指定語：山田 ／ 文書長',action:'証明を検証',before:'期待条件と照合する',after:'期待条件に対する証明を検証',outcome:'確認者には、文書そのものを見せずに指定した条件の成立を示せます。',limit:'対象は指定語との完全一致。表記ゆれや指定していない個人情報は対象外です。実演のアニメーション自体は証明を生成しません。',link:'../document-proof/index.html',linkText:'実際の文書証明を試す'},
  {id:'write',name:'Sumi Write',title:'本文用の情報と内部メモを分けて作る',body:'公開する内容を組み立てる欄と、外に出さない内部メモ欄を分けます。',inputLabel:'内部メモ',input:'準備担当の調整は未確定',action:'本文案を作成',before:'本文はまだ作成されていません',after:'本文案を作成。内部メモは使いません',outcome:'定型の本文生成とAIへの入力に、内部メモ欄を渡さない設計です。',limit:'本文用の欄に秘密を書いた場合や、内部メモを本文に貼り付けた場合は防げません。',link:'../writer.html',linkText:'Write を試す'},
  {id:'gate',name:'Sumi Gate',title:'共有する版と出力先を確認する',body:'書類から候補を検出して加工し、共有する文章の全文と行き先を確認します。',inputLabel:'加工された共有版',input:'連絡先：［メールアドレス］',action:'公開を確認',before:'未確認のため、書き出しを拒否',after:'確認した版を出力可能に',outcome:'内容や出力先を変更すると確認が失効し、再確認を求めます。',limit:'検出には見逃しがあります。加工後の全文を人が確認する必要があります。',link:'../gate.html',linkText:'Gate を試す'},
  {id:'prove',name:'Sumi Prove',title:'個別の数値を明かさず、合計を検証する',body:'個々の値を証明ファイルに含めず、コミットした値と公開する合計の関係を示します。',inputLabel:'公開する値',input:'4件 ／ 合計 60',action:'証明を検証',before:'証明と合計の関係を照合',after:'合計 60 の証明を検証',outcome:'公開情報には件数、合計、用途、コミットメント、証明が含まれます。',limit:'数値が現実の事実であることは証明しません。件数や合計から個別値が推測される場合があります。',link:'../proof-studio.html',linkText:'Prove を試す'},
  {id:'survey',name:'見えないアンケート',title:'個別の回答ではなく、合計を見る',body:'昼休みの図書室について３件の架空回答を集め、合計だけを表示する流れです。',inputLabel:'受付状況',input:'架空の回答 3件',action:'集計を確定',before:'3件以上で集計できます',after:'開けてほしい 2件 ／ 今のまま 1件',outcome:'集める画面には、個別回答を表示する機能を設けていません。',limit:'公開版は１端末の模擬です。この画面だけで端末や管理者から個別回答を守れるわけではありません。',link:'../survey-demo.html',linkText:'アンケートを試す'},
  {id:'agent',name:'エージェント',title:'提案と実行を分け、確認前は渡さない',body:'架空の文書を加工し、確認した版に限ってエージェントの操作に渡す流れです。',inputLabel:'エージェントの提案',input:'確認した文書を要約する',action:'実行可否を判定',before:'確認前：要約を拒否',after:'確認後：登録済みの要約を実行',outcome:'未登録の外部送信は拒否し、文書変更後は再確認を求めます。',limit:'デモの要約は固定処理です。任意のAIや端末全体の隔離を証明するものではありません。',link:'https://github.com/sururu-k/zenjoukon-2/blob/main/sumi/TERMINAL.md',linkText:'端末デモの手順を見る'},
  {id:'formal',name:'Lean による検査',title:'検査した性質と、信頼する前提を分ける',body:'認可・情報流のモデルと、承認・出力を表す状態遷移モデルを Lean で検査します。',inputLabel:'状態遷移モデル',input:'編集 → 承認失効 → 出力を拒否',action:'検査結果を見る',before:'対象の定理と前提を確認',after:'モデル上の性質を Lean で検査',outcome:'任意の有限操作列について、出力時のモデル状態が承認済みの状態と一致することを示します。',limit:'モデルと JavaScript・ブラウザ全体の対応は未証明です。可視化は元の２モデルのスナップショットです。',link:'../assurance.html',linkText:'保証範囲を確認する'}
];

type Status = { done:boolean };
const initial:Status = {done:false};
const poster:Status = {done:true};
async function act(a:Act<Status>) { await a.wait(600); await a.move('run'); await a.wait(350); await a.click(); await a.set({done:true}); await a.move(a.layout === 'compact' ? {x:315,y:285} : {x:540,y:285}); await a.wait(2400); }
function SceneStage({scene}:{scene:Scene}) {
  return <Stage width={620} height={340} compact={{below:560,width:358,height:340}} initial={initial} poster={poster} script={act} play="once" cursor={{at:{wide:{x:520,y:280},compact:{x:300,y:280}}}} accent="#285d43" className="scene-stage" fidelity="realistic">
    {(state) => <Window title={scene.name} className="scene-window"><div className="scene-body"><div className="scene-content"><span className="scene-label">{scene.inputLabel}</span><div className="scene-input">{scene.input}</div><div className="scene-actions"><Button variant="primary" size="large" data-target="run">{scene.action}</Button></div><div className="scene-status" data-done={state.done}><span className="scene-dot"/><States align="start" value={state.done?'after':'before'} states={{before:scene.before,after:scene.after}}/></div></div></div></Window>}
  </Stage>;
}

function RuleComparison(){
  const [value,setValue]=useState('a'.repeat(40)+'山田');
  const bytes=new TextEncoder().encode(value), needle=new TextEncoder().encode('山田');
  const includes=(data:Uint8Array)=>data.some((_,i)=>needle.every((n,j)=>data[i+j]===n));
  const partial=includes(bytes.slice(0,32)), full=includes(bytes);
  return <div className="rule-lab"><p className="test-caption">先頭だけの検査も、次の２例には正しく答えます。</p><div className="test-examples"><div><span>文化祭のお知らせ</span><strong>指定語なし</strong></div><div><span>山田さんのお知らせ</span><strong>指定語あり</strong></div></div><label htmlFor="rule-text">別の文書で比べる</label><textarea id="rule-text" value={value} onChange={e=>setValue(e.target.value)} rows={3} maxLength={512}/><p className="micro">指定語：山田　／　UTF-8 {bytes.length} バイト</p><div className="rule-results"><div><span>先頭32バイトだけ</span><strong>{partial?'検出':'検出なし'}</strong></div><div><span>全文の完全一致</span><strong>{full?'検出':'検出なし'}</strong></div></div><p className="micro">この比較はブラウザ内の文字列検索です。わざと不完全にした例で、特定の製品の精度を示すものではありません。</p></div>;
}
function App(){return <><header className="top"><a href="../" className="brand"><img src="../mark.svg" alt=""/>Sumi</a><nav aria-label="ページ内"><a href="#comparison">比較</a><a href="#proof">文書の証明</a><a href="#write">各機能</a><a href="#formal">検証範囲</a></nav><a className="top-link" href="../">製品一覧へ</a></header><main><section className="hero"><div><p className="overline">Sumi / interactive story</p><h1>従来のルールベースは<br/><em>本当に安全か？</em></h1><p className="lead">テストに通った検査でも、試していない入力を見落とすことがある。では、秘密を渡さずに何を確かめられるのか。</p><div className="hero-actions"><a className="link-button" href="#comparison">デモを始める <span>↓</span></a><a className="text-link" href="#formal">検証の範囲から読む</a></div><p className="disclosure">すべて架空データ。動く画面は説明のための再構成です。各セクションから実際の機能を開けます。</p></div><div className="hero-figure"><span className="figure-label">情報を渡す前に</span><div className="flow-row"><span>秘密の文書</span><i>→</i><span>条件を定める</span><i>→</i><span>検証する</span></div><p>何が公開され、何が証明されないかまで確認する。</p></div></section>
<section className="comparison section" id="comparison"><div className="section-copy"><p className="section-index">01 / 見落としを確かめる</p><h2>テストに通ることと、<br/>全文を調べることは違う。</h2><p>先頭32バイトしか調べない検査を意図的に用意しました。最初の例では「山田」は後半にあるため、先頭の検査は見逃します。文章を編集して比べられます。</p><p className="note">全文検索も表記ゆれには対応しません。ゼロ知識証明の利点は、全文検索より検出精度が高いことではなく、条件の成立を原文を見せずに検証できる点です。</p></div><RuleComparison/></section>
<div className="bridge"><p>必要なものだけを渡すために</p><h2>条件を検証し、操作を分ける。</h2><span>ここからの画面演出は、各機能の一場面を要約したものです。</span></div>
{scenes.map((scene,i)=><section className="chapter section" id={scene.id} key={scene.id}><div className="section-copy"><p className="section-index">{String(i+2).padStart(2,'0')} / {scene.name}</p><h2>{scene.title}</h2><p>{scene.body}</p><p>{scene.outcome}</p><a className="chapter-link" href={scene.link}>{scene.linkText} <span>↗</span></a><details><summary>対象と限界</summary><p>{scene.limit}</p></details></div><div className="stage-wrap"><p className="stage-caption">架空データを使った画面演出</p><div aria-hidden="true"><SceneStage scene={scene}/></div></div></section>)}
<section className="closing"><p className="section-index">Sumi の現在地</p><h2>「安全」と言い切る前に、<br/>何を確かめたかを示す。</h2><p>ルールの検出、承認の仕組み、暗号による証明、Lean のモデル検査は、それぞれ異なる範囲を扱います。実際の個人情報には使わず、架空データでお試しください。</p><div className="closing-links"><a className="link-button" href="../assurance.html">保証範囲と検証結果</a><a className="text-link" href="https://github.com/sururu-k/zenjoukon-2">ソースコードを見る ↗</a></div></section></main><footer><span>Sumi — Research prototype</span><a href="../">製品一覧へ戻る</a></footer></>}

createRoot(document.getElementById('root')!).render(<App/>);
