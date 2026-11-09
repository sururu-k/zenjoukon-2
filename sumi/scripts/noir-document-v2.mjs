import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const nargo=process.env.SUMI_NARGO||'nargo',bb=process.env.SUMI_BB||'bb';
const source=fileURLToPath(new URL('../noir/document_absence_v2/',import.meta.url));
const [command,...args]=process.argv.slice(2);
const fail=message=>{throw new Error(message);};
const readSmall=async(path,max)=>{const s=await stat(path);if(!s.isFile()||s.size>max)fail('入力ファイルの種類またはサイズが不正です。');return readFile(path);};
const readDocument=async(path)=>{const bytes=await readSmall(path,512);try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('文書は正しいUTF-8で指定してください。');}return bytes;};
const parseJson=async(path)=>{
  const bytes=await readSmall(path,1000000);let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('JSONは正しいUTF-8で指定してください。');}
  return JSON.parse(text);
};
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fields=values=>Buffer.concat(values.map(value=>{const f=Buffer.alloc(32);f.writeUInt32BE(value,28);return f;}));
function publicInputs(statement){
  if(!statement||!Number.isInteger(statement.documentLength)||statement.documentLength<0||statement.documentLength>512||!hex(statement.commitment))fail('公開条件の形式が不正です。');
  const words=policyWords(statement.forbidden),patterns=Array.from({length:4},()=>Buffer.alloc(16)),lengths=[0,0,0,0];
  words.forEach((word,i)=>{word.copy(patterns[i]);lengths[i]=word.length;});
  return fields([statement.documentLength,...patterns.flatMap(p=>[...p]),...lengths,words.length,...Buffer.from(statement.commitment,'hex')]);
}
function policyWords(terms){
  if(!Array.isArray(terms)||terms.length<1||terms.length>4||terms.some(s=>typeof s!=='string'||!s.isWellFormed())||new Set(terms).size!==terms.length)fail('禁止語は重複のない１〜４語を指定してください。');
  return terms.map(term=>{const word=Buffer.from(term,'utf8');if(word.length<1||word.length>16)fail('各禁止語はUTF-8で１〜16バイトにしてください。');return word;});
}
const run=(program,args,cwd)=>{const result=spawnSync(program,args,{cwd,encoding:'utf8',timeout:120000});if(result.status!==0)fail(`${program} の実行に失敗しました: ${result.stderr||result.stdout||result.error}`);return result.stdout;};
async function setup(dir){
  if(!/nargo version = 1\.0\.0(?:\s|$)/.test(run(nargo,['--version'],dir))||!/6\.0\.0(?:\s|$)/.test(run(bb,['--version'],dir)))fail('nargo 1.0.0 と bb 6.0.0 が必要です。');
  await mkdir(join(dir,'src'));await copyFile(join(source,'Nargo.toml'),join(dir,'Nargo.toml'));await copyFile(join(source,'src/main.nr'),join(dir,'src/main.nr'));
}
function makeInput(doc,words,salt){
  if(doc.length>512)fail('文書は512バイト以内にしてください。');
  if(words.some(word=>doc.indexOf(word)!==-1))fail('文書に禁止語が含まれています。');
  const padded=Buffer.alloc(512),patterns=Array.from({length:4},()=>Buffer.alloc(16)),lengths=[0,0,0,0];doc.copy(padded);
  words.forEach((word,i)=>{word.copy(patterns[i]);lengths[i]=word.length;});
  const commitment=createHash('blake2s256').update(padded).update(salt).digest('hex');
  const values={document_bytes:[...padded],salt:[...salt],document_length:doc.length,forbidden:patterns.map(p=>[...p]),forbidden_lengths:lengths,forbidden_count:words.length,commitment:[...Buffer.from(commitment,'hex')]};
  return {commitment,toml:Object.entries(values).map(([k,v])=>`${k} = ${JSON.stringify(v)}\n`).join('')};
}
async function main(){
  if(command==='open'){
    if(args.length!==3)fail('使い方: open <文書> <非公開開封情報.json> <期待条件.json>');
    const [file,openingFile,expectedFile]=args,opening=await parseJson(openingFile),expected=await parseJson(expectedFile),doc=await readDocument(file);
    publicInputs(expected);
    if(opening?.format!=='sumi-document-opening-v2'||!hex(opening.salt))fail('開封情報が不正です。');
    const padded=Buffer.alloc(512);doc.copy(padded);
    const actual=createHash('blake2s256').update(padded).update(Buffer.from(opening.salt,'hex')).digest('hex');
    if(actual!==expected.commitment||doc.length!==expected.documentLength||doc.length!==opening.documentLength)fail('文書は期待したコミットメントと一致しません。');
    console.log('文書とコミットメントが一致しました。');return;
  }
  if(!['prove','verify'].includes(command)||(command==='prove'&&args.length!==4)||(command==='verify'&&args.length!==2))fail('使い方: prove <文書> <禁止語リスト.json> <証明.json> <非公開開封情報.json> | verify <証明.json> <期待条件.json> | open <文書> <非公開開封情報.json> <期待条件.json>');
  const dir=await mkdtemp(join(tmpdir(),'sumi-noir-user-'));
  try{
    await setup(dir);
    if(command==='prove'){
      const [file,policyFile,out,openingFile]=args,policy=await parseJson(policyFile),forbidden=policy?.forbidden;
      const doc=await readDocument(file),words=policyWords(forbidden),salt=randomBytes(32),input=makeInput(doc,words,salt);
      const statement={documentLength:doc.length,forbidden,commitment:input.commitment};
      await writeFile(join(dir,'Prover.toml'),input.toml,{mode:0o600});
      run(nargo,['execute'],dir);run(bb,['prove','-b','target/document_absence_v2.json','-w','target/document_absence_v2.gz','-t','noir-recursive','--write_vk','-o','target/out'],dir);
      const publicFile=await readFile(join(dir,'target/out/public_inputs'));
      if(!publicFile.equals(publicInputs(statement)))fail('証明の公開条件が一致しません。');
      run(bb,['verify','-t','noir-recursive','-p','target/out/proof','-k','target/out/vk','-i','target/out/public_inputs'],dir);
      const proof=await readFile(join(dir,'target/out/proof'));
      await writeFile(openingFile,JSON.stringify({format:'sumi-document-opening-v2',salt:salt.toString('hex'),documentLength:doc.length},null,2)+'\n',{flag:'wx',mode:0o600});
      await writeFile(out,JSON.stringify({format:'sumi-document-proof-v2',statement,proof:proof.toString('base64')},null,2)+'\n',{flag:'wx',mode:0o600});
      console.log('証明と非公開の開封情報を保存しました。開封情報は公開しないでください。');
      console.log('期待条件として、禁止語・文書の長さ・コミットメントを検証者と別経路で確認してください。');
    }else{
      const [proofFile,expectedFile]=args,pkg=await parseJson(proofFile),expected=await parseJson(expectedFile);
      if(pkg?.format!=='sumi-document-proof-v2'||typeof pkg.proof!=='string'||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(pkg.proof))fail('証明の形式が不正です。');
      const trusted=publicInputs(expected),received=publicInputs(pkg.statement);
      if(!trusted.equals(received))fail('証明の公開条件が期待条件と一致しません。');
      run(nargo,['compile'],dir);
      run(bb,['write_vk','-b','target/document_absence_v2.json','-t','noir-recursive','-o','target/trusted'],dir);
      await writeFile(join(dir,'proof'),Buffer.from(pkg.proof,'base64'),{mode:0o600});await writeFile(join(dir,'inputs'),trusted,{mode:0o600});
      run(bb,['verify','-t','noir-recursive','-p','proof','-k','target/trusted/vk','-i','inputs'],dir);
      console.log('期待した禁止語・文書コミットメントについて証明を検証しました。');
    }
  }finally{await rm(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error.message||'処理に失敗しました。');process.exitCode=1;});
