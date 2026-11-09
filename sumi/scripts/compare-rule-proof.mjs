import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

// Deliberately flawed baseline: checks only the first 32 UTF-8 bytes.
// This is an illustrative implementation, not a claim about real products.
const term='山田', needle=Buffer.from(term), salt=randomBytes(32);
const cases=[
  {name:'訓練例：指定語なし', text:'文化祭のお知らせ', partial:false, exact:false},
  {name:'訓練例：先頭の指定語', text:'山田さんのお知らせ', partial:true, exact:true},
  {name:'追加例：32バイト以降', text:'a'.repeat(40)+'山田', partial:false, exact:true},
  {name:'追加例：文書末尾', text:'a'.repeat(506)+'山田', partial:false, exact:true},
  {name:'限界例：間に文字を挿入', text:'山\u200b田', partial:false, exact:false},
];
const nargo=process.env.SUMI_NARGO||'nargo',bb=process.env.SUMI_BB||'bb';
const dir=await mkdtemp(join(tmpdir(),'sumi-rule-proof-'));
const source=fileURLToPath(new URL('../noir/document_absence_v2/',import.meta.url));
function run(program,args){const r=spawnSync(program,args,{cwd:dir,encoding:'utf8',timeout:240000});if(r.error)throw r.error;return r;}
function requireSuccess(program,args){const r=run(program,args);if(r.status!==0)throw Error(`${program} failed: ${r.stderr||r.stdout}`);return r;}
function witness(text){
  const doc=Buffer.from(text);assert.ok(doc.length<=512);
  const padded=Buffer.alloc(512);doc.copy(padded);
  const commitment=createHash('blake2s256').update(padded).update(salt).digest();
  const pattern=Buffer.alloc(16);needle.copy(pattern);
  const input={document_bytes:[...padded],salt:[...salt],document_length:doc.length,forbidden:[[...pattern],...Array.from({length:3},()=>Array(16).fill(0))],forbidden_lengths:[needle.length,0,0,0],forbidden_count:1,commitment:[...commitment]};
  return Object.entries(input).map(([key,value])=>`${key} = ${JSON.stringify(value)}\n`).join('');
}
try{
  assert.match(requireSuccess(nargo,['--version']).stdout,/nargo version = 1\.0\.0/);
  assert.match(requireSuccess(bb,['--version']).stdout,/6\.0\.0/);
  await mkdir(join(dir,'src'));await copyFile(join(source,'Nargo.toml'),join(dir,'Nargo.toml'));await copyFile(join(source,'src/main.nr'),join(dir,'src/main.nr'));
  console.log('例 | 先頭32バイトの検査 | 全文完全一致 | 回路の証明入力');
  for(let i=0;i<cases.length;i++){
    const c=cases[i],bytes=Buffer.from(c.text),partial=bytes.subarray(0,32).includes(needle),exact=bytes.includes(needle);
    assert.equal(partial,c.partial);assert.equal(exact,c.exact);
    await writeFile(join(dir,'Prover.toml'),witness(c.text));
    const execution=run(nargo,['execute',`case${i}`]);
    if(exact){assert.notEqual(execution.status,0,`${c.name}: unexpected success`);assert.match(execution.stderr+execution.stdout,/assert|constraint/i,`${c.name}: unrelated failure`);}
    else assert.equal(execution.status,0,`${c.name}: ${execution.stderr}`);
    if(i===0){
      requireSuccess(bb,['prove','-b','target/document_absence_v2.json','-w','target/case0.gz','-t','noir-recursive','--write_vk','-o','target/out']);
      requireSuccess(bb,['verify','-t','noir-recursive','-p','target/out/proof','-k','target/out/vk','-i','target/out/public_inputs']);
    }
    console.log(`${c.name} | ${partial?'検出':'未検出'} | ${exact?'あり':'なし'} | ${execution.status===0?'成立':'拒否'}`);
  }
  console.log('\n先頭32バイトだけの検査は２つの訓練例を通過しても、後半の指定語を見落とします。');
  console.log('全文を通常の文字列検索でも検査できます。ZKの利点は対象の条件を、原文を渡さずに検証できることです。');
  console.log('別表記は完全一致しないため回路も受理します。証明成功は個人情報全般の不在を意味しません。');
}finally{await rm(dir,{recursive:true,force:true});}
