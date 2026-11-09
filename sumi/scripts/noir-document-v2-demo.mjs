import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

// Fictional examples only. This v2 format is distinct from the v1 CLI.
const nargo=process.env.SUMI_NARGO||'nargo',bb=process.env.SUMI_BB||'bb';
const source=fileURLToPath(new URL('../noir/document_absence_v2/',import.meta.url));
const dir=await mkdtemp(join(tmpdir(),'sumi-noir-v2-'));
const run=(program,args)=>spawnSync(program,args,{cwd:dir,encoding:'utf8',timeout:240000});
const required=(program,args)=>{const r=run(program,args);if(r.status!==0)throw new Error(`${program}: ${r.stderr||r.stdout||r.error}`);return r;};
const rejected=(program,args)=>{const r=run(program,args);assert.equal(r.error,undefined);assert.ok(Number.isInteger(r.status)&&r.status!==0);};
const fields=values=>Buffer.concat(values.map(value=>{const field=Buffer.alloc(32);field.writeUInt32BE(value,28);return field;}));
function sample(text,words,salt){
  const doc=Buffer.from(text,'utf8');assert.ok(doc.length<=512&&words.length>=1&&words.length<=4);
  const padded=Buffer.alloc(512);doc.copy(padded);
  const patterns=Array.from({length:4},()=>Buffer.alloc(16)),lengths=[0,0,0,0];
  for(let i=0;i<words.length;i++){const term=Buffer.from(words[i],'utf8');assert.ok(term.length>=1&&term.length<=16);term.copy(patterns[i]);lengths[i]=term.length;}
  const commitment=createHash('blake2s256').update(padded).update(salt).digest();
  const values={document_bytes:[...padded],salt:[...salt],document_length:doc.length,forbidden:patterns.map(p=>[...p]),forbidden_lengths:lengths,forbidden_count:words.length,commitment:[...commitment]};
  return {toml:Object.entries(values).map(([k,v])=>`${k} = ${JSON.stringify(v)}\n`).join(''),publicInputs:fields([doc.length,...patterns.flatMap(p=>[...p]),...lengths,words.length,...commitment])};
}
try{
  assert.match(required(nargo,['--version']).stdout,/nargo version = 1\.0\.0/);
  assert.match(required(bb,['--version']).stdout,/6\.0\.0/);
  await mkdir(join(dir,'src'));await copyFile(join(source,'Nargo.toml'),join(dir,'Nargo.toml'));await copyFile(join(source,'src/main.nr'),join(dir,'src/main.nr'));
  const salt=randomBytes(32),words=['山田','佐藤','電話番号','内部資料'];
  const good=sample('文化祭のお知らせ。生徒会から、開催日と場所をお伝えします。',words,salt);
  await writeFile(join(dir,'Prover.toml'),good.toml);required(nargo,['execute']);
  const start=performance.now();
  required(bb,['prove','-b','target/document_absence_v2.json','-w','target/document_absence_v2.gz','-t','noir-recursive','--write_vk','-o','target/out']);
  const elapsed=((performance.now()-start)/1000).toFixed(2);
  const publicInputs=await readFile(join(dir,'target/out/public_inputs'));assert.deepEqual(publicInputs,good.publicInputs);
  required(bb,['verify','-t','noir-recursive','-p','target/out/proof','-k','target/out/vk','-i','target/out/public_inputs']);
  const changed=Buffer.from(publicInputs);changed[changed.length-1]^=1;await writeFile(join(dir,'target/out/altered'),changed);
  rejected(bb,['verify','-t','noir-recursive','-p','target/out/proof','-k','target/out/vk','-i','target/out/altered']);
  const bad=sample('文化祭の佐藤さんに連絡します。',words,salt);await writeFile(join(dir,'Prover.toml'),bad.toml);rejected(nargo,['execute','bad']);
  const boundary=sample('a'.repeat(509)+'山',['山'],salt);await writeFile(join(dir,'Prover.toml'),boundary.toml);rejected(nargo,['execute','boundary']);
  console.log(`架空文書について４語の不在証明を生成・検証しました。証明生成: ${elapsed}秒（この端末の１回の計測）。`);
  console.log('２語目の混入・文書末尾の一致・コミットメント改変を拒否しました。');
  console.log('対象は512バイト以内・禁止語４つ各16バイト以内の完全一致です。');
}finally{await rm(dir,{recursive:true,force:true});}
