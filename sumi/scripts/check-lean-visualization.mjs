import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute} from 'node:path';
import { THEOREMS, AGENT_THEOREMS } from './check-formal.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(new URL('../visualization/lean/manifest.json',import.meta.url),'utf8'));
const required=['formal/Policy.lean','formal/Agent.lean','visualization/lean/policy/report.jsonl','visualization/lean/policy/js/default-report.js','visualization/lean/agent/report.jsonl','visualization/lean/agent/js/default-report.js'];
if(manifest.format!=='sumi-lean-visualization-snapshot'||manifest.version!==1||Object.keys(manifest.files).length!==required.length)throw Error('可視化の来歴情報が不正です。');
for(const name of required){const path=resolve(root,name),rel=relative(root,path);if(rel.startsWith('..')||isAbsolute(rel))throw Error('可視化の参照先が不正です。');const digest=createHash('sha256').update(await readFile(path)).digest('hex');if(digest!==manifest.files[name])throw Error(`可視化の元または結果が変わっています。再生成してください: ${name}`);}
console.log('Lean可視化: 元の２モデルとレポート・表示データのハッシュが一致しました。');

for (const [name, sourcePath, expected] of [
  ['policy', 'formal/Policy.lean', THEOREMS],
  ['agent', 'formal/Agent.lean', AGENT_THEOREMS],
]) {
  const lines = (await readFile(resolve(root,sourcePath),'utf8')).split(/\r?\n/);
  const report = (await readFile(resolve(root,`visualization/lean/${name}/report.jsonl`),'utf8')).trim().split('\n').map(line => JSON.parse(line));
  for (const theorem of expected) {
    const rows = report.filter(row => row.name === theorem && row.scope === 'target');
    if (rows.length !== 1) throw Error(`可視化に対象の定理が１件ありません: ${theorem}`);
    const row = rows[0], short = theorem.slice(theorem.lastIndexOf('.') + 1);
    if (row.kind !== 'theorem' || !Number.isInteger(row.line) || !Number.isInteger(row.lineEnd) || row.line < 1 || row.lineEnd < row.line || row.lineEnd > lines.length || row.usesSorry !== false || !Array.isArray(row.axioms) || row.axioms.some(a => !['propext','Classical.choice','Quot.sound'].includes(a))) throw Error(`定理の来歴または公理が不正です: ${theorem}`);
    const source = lines.slice(row.line - 1, row.lineEnd).join('\n').trim();
    if (source !== row.source?.trim() || !source.startsWith(`theorem ${short} `)) throw Error(`定理の原文・位置が元のモデルと一致しません: ${theorem}`);
  }
  console.log(`Lean可視化: ${name} の対象定理 ${expected.length} 件の原文と位置が一致しました。`);
}
