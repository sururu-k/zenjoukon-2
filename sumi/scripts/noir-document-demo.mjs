import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Fictional, bounded demonstration. Witnesses and generated artifacts remain
// in a temporary directory. Never use this example to process real secrets.
const nargo=process.env.SUMI_NARGO||'nargo',bb=process.env.SUMI_BB||'bb';
const source=fileURLToPath(new URL('../noir/document_absence/',import.meta.url));
const dir=await mkdtemp(join(tmpdir(),'sumi-noir-document-'));
const run=(program,args)=>spawnSync(program,args,{cwd:dir,encoding:'utf8',timeout:120000});
const required=(program,args)=>{const r=run(program,args);if(r.status!==0)throw new Error(`${program} failed: ${r.stderr||r.stdout||r.error}`);return r;};
const rejected=(program,args,message)=>{const r=run(program,args);assert.equal(r.error,undefined,message);assert.ok(Number.isInteger(r.status)&&r.status!==0,message);};
const fields=values=>Buffer.concat(values.map(value=>{const field=Buffer.alloc(32);field.writeUInt32BE(value,28);return field;}));
function sample(text,word,salt){
  const doc=Buffer.from(text,'utf8'),term=Buffer.from(word,'utf8');
  assert.ok(doc.length<=128&&term.length>0&&term.length<=8);
  const padded=Buffer.alloc(128),pattern=Buffer.alloc(8);doc.copy(padded);term.copy(pattern);
  const commitment=createHash('blake2s256').update(padded).update(salt).digest();
  const values={document_bytes:[...padded],salt:[...salt],document_length:doc.length,forbidden:[...pattern],forbidden_length:term.length,commitment:[...commitment]};
  return {toml:Object.entries(values).map(([k,v])=>`${k} = ${JSON.stringify(v)}\n`).join(''),publicInputs:fields([doc.length,...pattern,term.length,...commitment])};
}
try{
  assert.match(required(nargo,['--version']).stdout,/nargo version = 1\.0\.0/);
  assert.match(required(bb,['--version']).stdout,/6\.0\.0/);
  await mkdir(join(dir,'src'));
  await copyFile(join(source,'Nargo.toml'),join(dir,'Nargo.toml'));
  await copyFile(join(source,'src/main.nr'),join(dir,'src/main.nr'));
  const salt=randomBytes(32),good=sample('文化祭のお知らせ','山田',salt);
  await writeFile(join(dir,'Prover.toml'),good.toml);
  required(nargo,['execute']);
  required(bb,['prove','-b','target/document_absence.json','-w','target/document_absence.gz','-t','noir-recursive','--write_vk','-o','target/out']);
  const publicInputs=await readFile(join(dir,'target/out/public_inputs'));
  assert.deepEqual(publicInputs,good.publicInputs,'public inputs must match the expected document commitment and policy');
  required(bb,['verify','-t','noir-recursive','-p','target/out/proof','-k','target/out/vk','-i','target/out/public_inputs']);
  const changed=Buffer.from(publicInputs);changed[changed.length-1]^=1;
  await writeFile(join(dir,'target/out/modified_inputs'),changed);
  rejected(bb,['verify','-t','noir-recursive','-p','target/out/proof','-k','target/out/vk','-i','target/out/modified_inputs'],'modified public commitment must fail');
  const changedPolicy=Buffer.from(publicInputs);changedPolicy[63]^=1;
  await writeFile(join(dir,'target/out/modified_policy'),changedPolicy);
  rejected(bb,['verify','-t','noir-recursive','-p','target/out/proof','-k','target/out/vk','-i','target/out/modified_policy'],'modified policy must fail');
  const changedProof=await readFile(join(dir,'target/out/proof'));changedProof[changedProof.length-1]^=1;
  await writeFile(join(dir,'target/out/modified_proof'),changedProof);
  rejected(bb,['verify','-t','noir-recursive','-p','target/out/modified_proof','-k','target/out/vk','-i','target/out/public_inputs'],'modified proof must fail');
  const bad=sample('文化祭の山田さん','山田',salt);
  await writeFile(join(dir,'Prover.toml'),bad.toml);
  rejected(nargo,['execute','bad'],'document containing the forbidden text must fail');
  console.log('架空文書：証明を生成し、公開値を照合して別コマンドで検証しました。');
  console.log('禁止語を含む文書と、公開コミットメント・禁止語・証明の改変は拒否されました。');
  console.log('対象は128バイト以内の文書と公開する１語の完全一致です。個人情報全般の不在は証明しません。');
}finally{await rm(dir,{recursive:true,force:true});}
