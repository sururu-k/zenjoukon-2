import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(new URL('../visualization/lean/manifest.json',import.meta.url),'utf8'));
const required=['formal/Policy.lean','formal/Agent.lean','visualization/lean/policy/report.jsonl','visualization/lean/policy/js/default-report.js','visualization/lean/agent/report.jsonl','visualization/lean/agent/js/default-report.js'];
if(manifest.format!=='sumi-lean-visualization-snapshot'||manifest.version!==1||Object.keys(manifest.files).length!==required.length)throw Error('可視化の来歴情報が不正です。');
for(const name of required){const path=resolve(root,name),rel=relative(root,path);if(rel.startsWith('..')||isAbsolute(rel))throw Error('可視化の参照先が不正です。');const digest=createHash('sha256').update(await readFile(path)).digest('hex');if(digest!==manifest.files[name])throw Error(`可視化の元または結果が変わっています。再生成してください: ${name}`);}
console.log('Lean可視化: 元の２モデルとレポート・表示データのハッシュが一致しました。');
