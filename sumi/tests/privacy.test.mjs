import test from 'node:test';
import assert from 'node:assert/strict';
import {SAMPLE,PRESETS,detect,transform,aggregate,parseCSV,validateAIEntities,validateEndpoint,validatePolicy,records,buildSharePayload} from '../src/privacy.js';
const process=(source,policy=PRESETS.public,extras=[],ai=[])=>transform(source,detect(source,policy,extras,ai),policy);

test('サンプルの氏名・都市・クラスを加工し、研究に必要な通学時間と自由記述を残す',()=>{
  const result=process(SAMPLE);
  for(const value of ['山田太郎','佐藤花子','鈴木健太','高橋美咲','田中陽','伊藤葵','豊田市','名古屋市','2年3組','16歳','生徒会長','吹奏楽部','さくら高校'])assert.ok(!result.text.includes(value),value);
  assert.match(result.text,/回答者A/);assert.match(result.text,/中部地方/);assert.match(result.text,/通学：90分/);assert.match(result.text,/朝の混雑と乗り換えが大変です/);
  assert.equal(records(result.text).length,6);assert.equal(result.combinations.length,6);
});
test('共有先ごとの粒度を適用し、番地は残さない',()=>{
  const source='氏名：山田太郎、居住地：愛知県豊田市1丁目2番地、年齢：16歳、クラス：2年3組';
  const teacher=process(source,PRESETS.teacher).text,student=process(source,PRESETS.students).text;
  assert.match(teacher,/愛知県豊田市/);assert.match(teacher,/16歳/);assert.match(teacher,/2年/);assert.ok(!teacher.includes('1丁目'));assert.ok(!teacher.includes('3組'));
  assert.match(student,/愛知県/);assert.ok(!student.includes('豊田市'));assert.match(student,/10代/);
});
test('通学時間を非公開にしたら、加工後の集計にも数値を残さない',()=>{
  const r=process(SAMPLE,{...PRESETS.public,keepCommute:false}),stats=aggregate(r.text);
  assert.equal(stats.minutes.length,0);assert.equal(stats.mean,null);assert.ok(!r.text.includes('90分'));
  assert.equal(aggregate(process(SAMPLE).text).minutes.length,6);
  assert.equal(Number(aggregate(process(SAMPLE).text).mean.toFixed(1)),59.2);
  assert.deepEqual(aggregate(process(SAMPLE).text).transport.map(t=>t.ids.length),[3,2,1,0]);
});
test('一つの候補を原文のまま残すと明示的に計上する',()=>{
  const source='氏名：山田太郎、年齢：16歳';const c=detect(source,PRESETS.public);const person=c.find(e=>e.kind==='PERSON');
  const r=transform(source,c,PRESETS.public,{[person.id]:'keep'});assert.equal(r.kept,1);assert.match(r.text,/山田太郎/);assert.match(r.edits[0].reason,/利用者/);
});
test('同じ氏名は同じ回答者ラベルを使い、追加指定語を優先する',()=>{
  const source='氏名：山田太郎、さくら祭担当\n氏名：山田太郎、年齢：16歳';const r=process(source,PRESETS.public,['さくら祭担当']);
  assert.equal(r.text.match(/回答者A/g).length,2);assert.ok(!r.text.includes('さくら祭担当'));
});
test('連絡先、全角年齢、ラベル付き国際化メールを加工する',()=>{
  const r=process('メール：やまだ@example.jp、連絡先：090-1234-5678、年齢：１６歳、通学：９０分');
  assert.ok(!r.text.includes('やまだ@example.jp'));assert.ok(!r.text.includes('090-1234-5678'));assert.match(r.text,/10代/);assert.match(r.text,/通学：９０分/);
});
test('ローカルAIが返した架空の値・不正な種類・範囲を採用しない',()=>{
  const text='原文には小川春という氏名があります。通学90分です。';
  const raw=[{kind:'PERSON',value:'小川春'},{kind:'PERSON',value:'存在しない名前'},{kind:'SCRIPT',value:'原文'},{kind:'AGE',value:'90'},{kind:'PERSON',value:'x'.repeat(81)}];
  const checked=validateAIEntities(text,raw);assert.equal(checked.length,1);assert.equal(text.slice(checked[0].start,checked[0].end),'小川春');assert.ok(!process(text,PRESETS.public,[],raw).text.includes('小川春'));
});
test('CSVの引用符・改行・BOMを扱い、列数不一致を拒否する',()=>{
  const text=parseCSV('\ufeff氏名,居住地,通学時間,回答\r\n山田太郎,愛知県豊田市,90分,"混雑,雨\n遅れる"\r\n佐藤花子,愛知県名古屋市,45分,ふつう');
  assert.equal(records(text).length,2);assert.match(text,/混雑,雨 ／ 遅れる/);assert.ok(!process(text).text.includes('山田太郎'));
  assert.throws(()=>parseCSV('氏名,回答\n山田,雨,晴れ'),/列数/);assert.throws(()=>parseCSV('氏名,回答\n山田,"閉じない'),/引用符/);assert.throws(()=>parseCSV('氏名,氏名\nA,B'),/重複/);
});
test('接続先は資格情報や任意のパスを含まないループバックに限定する',()=>{
  assert.equal(validateEndpoint('http://127.0.0.1:11434/'),'http://127.0.0.1:11434');assert.equal(validateEndpoint('http://localhost:11434'),'http://localhost:11434');
  for(const url of ['https://example.com','http://127.0.0.1.evil.com','http://user:pass@localhost','http://localhost/api','http://localhost?key=abc','file:///etc/passwd','http://192.168.0.1:11434'])assert.throws(()=>validateEndpoint(url),url);
});
test('不正な加工条件を拒否する',()=>{
  assert.deepEqual(validatePolicy(PRESETS.public),PRESETS.public);assert.throws(()=>validatePolicy({...PRESETS.public,location:'raw'}));assert.throws(()=>validatePolicy({...PRESETS.public,keepCommute:'true'}));
});
test('共有パッケージに原文・加工前の値・原文ハッシュ・対応表を混入させない',()=>{
  const r=process(SAMPLE);const p=buildSharePayload(r,PRESETS.public,'2026-11-07T00:00:00Z');const json=JSON.stringify(p);
  for(const forbidden of ['山田太郎','豊田市','16歳','overrides','source','edits','sourceHash'])assert.ok(!json.includes(forbidden),forbidden);
  assert.equal(p.text,r.text);assert.equal(p.records[0].id,'R01');assert.deepEqual(Object.keys(p.records[0]).sort(),['id','text']);
});
test('50件の架空の定型回答で識別項目を加工し、回答文と通学時間を保持する',()=>{
  for(let i=0;i<50;i++){
    const name=`架空${i}太郎`,age=15+i%4,minutes=10+i;
    const input=`氏名：${name}、居住地：愛知県豊田市、年齢：${age}歳、クラス：${1+i%3}年${1+i%4}組、役職：部長、通学：${minutes}分、回答：雨の日の混雑が大変です。`;
    const r=process(input);assert.ok(!r.text.includes(name));assert.ok(!r.text.includes('豊田市'));assert.ok(!r.text.includes(age+'歳'));assert.match(r.text,new RegExp(`通学：${minutes}分`));assert.ok(r.text.includes('回答：雨の日の混雑が大変です。'));
  }
});
