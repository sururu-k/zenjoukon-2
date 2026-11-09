import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import examplePolicy from '../src/school-policy.example.json' with {type:'json'};
import { validateSchoolPolicy } from '../src/school-policy-contract.js';
import { prepareAgentDocument } from '../src/agent-document.js';

// Fictional data only. Every output file is created in a temporary directory.
const dir=await mkdtemp(join(tmpdir(),'sumi-shared-policy-'));
const source=fileURLToPath(new URL('../noir/document_absence_v2/',import.meta.url));
const audit=fileURLToPath(new URL('./school-audit.mjs',import.meta.url));
const nargo=process.env.SUMI_NARGO||'nargo', bb=process.env.SUMI_BB||'bb';
const run=(program,args,options={})=>{
  const result=spawnSync(program,args,{cwd:dir,encoding:'utf8',timeout:240000,...options});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${program}: ${result.stderr||result.stdout}`);
  return result.stdout;
};
try{
  assert.match(run(nargo,['--version']),/nargo version = 1\.0\.0/);
  assert.match(run(bb,['--version']),/6\.0\.0/);
  const policy=structuredClone(examplePolicy);
  policy.school='架空の青空学校';
  policy.documentProof.forbidden=['青空祭','山田'];
  policy.assessment.controls[0].required=false;
  validateSchoolPolicy(policy);
  const policyPath=join(dir,'school.json');
  await writeFile(policyPath,JSON.stringify(policy));
  const draft=JSON.parse(run(process.execPath,[audit,'--policy',policyPath,'draft']));
  assert.equal(draft.applied,false);
  assert.equal(draft.settings[0].required,false);
  console.log('１．架空学校の共通設定から点検・物理チェック項目を作成（設定の適用なし）。');

  const prepared=prepareAgentDocument('青空祭は山田が準備します。','',policy);
  const gateway=prepared.gateway;
  const proposal={action:'read',resource:'approved-document',revision:gateway.revision};
  assert.equal((await gateway.agent.execute(proposal)).status,'denied');
  gateway.approveDocument(gateway.revision); // Simulated approval for the demo.
  const output=await gateway.agent.execute(proposal);
  assert.equal(output.status,'completed');
  const text=output.value;
  for(const word of policy.documentProof.forbidden)assert.ok(!text.includes(word));
  console.log('２．確認前は拒否。模擬承認後、同じ設定で加工した文書をエージェントへ渡す：'+text);

  const document=Buffer.from(text), padded=Buffer.alloc(512), salt=randomBytes(32);
  assert.ok(document.length<=512);document.copy(padded);
  const commitment=createHash('blake2s256').update(padded).update(salt).digest();
  const patterns=Array.from({length:4},()=>Buffer.alloc(16)),lengths=[0,0,0,0];
  for(const [i,word] of policy.documentProof.forbidden.entries()){
    const bytes=Buffer.from(word);bytes.copy(patterns[i]);lengths[i]=bytes.length;
  }
  const input={document_bytes:[...padded],salt:[...salt],document_length:document.length,forbidden:patterns.map(p=>[...p]),forbidden_lengths:lengths,forbidden_count:policy.documentProof.forbidden.length,commitment:[...commitment]};
  await mkdir(join(dir,'src'));
  await copyFile(join(source,'Nargo.toml'),join(dir,'Nargo.toml'));
  await copyFile(join(source,'src/main.nr'),join(dir,'src/main.nr'));
  await writeFile(join(dir,'Prover.toml'),Object.entries(input).map(([k,v])=>`${k} = ${JSON.stringify(v)}\n`).join(''));
  run(nargo,['execute']);
  run(bb,['prove','-b','target/document_absence_v2.json','-w','target/document_absence_v2.gz','-t','noir-recursive','--write_vk','-o','target/out']);
  const fields=[document.length,...patterns.flatMap(p=>[...p]),...lengths,policy.documentProof.forbidden.length,...commitment];
  const expected=Buffer.concat(fields.map(value=>{const field=Buffer.alloc(32);field.writeUInt32BE(value,28);return field;}));
  assert.deepEqual(await readFile(join(dir,'target/out/public_inputs')),expected);
  run(bb,['verify','-t','noir-recursive','-p','target/out/proof','-k','target/out/vk','-i','target/out/public_inputs']);
  console.log('３．同じ禁止語を公開条件とし、加工した文書の不在証明を生成・検証。');
  const altered=Buffer.from(expected);
  altered[63]^=1; // Modify one byte of the first public forbidden term.
  await writeFile(join(dir,'target/out/altered-inputs'),altered);
  const tampered=spawnSync(bb,['verify','-t','noir-recursive','-p','target/out/proof','-k','target/out/vk','-i','target/out/altered-inputs'],{cwd:dir,encoding:'utf8',timeout:240000});
  if(tampered.error)throw tampered.error;
  assert.ok(Number.isInteger(tampered.status)&&tampered.status!==0,'変更した公開条件が受理されました。');
  console.log('４．同じ証明に対して公開禁止語を変更すると、暗号検証は拒否。');
  const unsafe=Buffer.from('青空祭は山田が準備します。'), unsafePadded=Buffer.alloc(512);
  unsafe.copy(unsafePadded);
  const unsafeCommitment=createHash('blake2s256').update(unsafePadded).update(salt).digest();
  const unsafeInput={...input,document_bytes:[...unsafePadded],document_length:unsafe.length,commitment:[...unsafeCommitment]};
  await writeFile(join(dir,'Prover.toml'),Object.entries(unsafeInput).map(([k,v])=>`${k} = ${JSON.stringify(v)}\n`).join(''));
  const witness=spawnSync(nargo,['execute','unsafe'],{cwd:dir,encoding:'utf8',timeout:240000});
  if(witness.error)throw witness.error;
  assert.ok(Number.isInteger(witness.status)&&witness.status!==0,'禁止語を含む文書が受理されました。');
  assert.match(witness.stdout+witness.stderr,/assert|constraint/i,'回路の条件違反以外で失敗しました。');
  console.log('５．禁止語が残る文書では、文書に合わせたコミットメントでも回路の証明入力を拒否。');
  console.log('注意：指定語の完全一致のみが対象。形式検査は設定の発行元を認証せず、学校全体の安全を証明しません。');
}finally{
  await rm(dir,{recursive:true,force:true});
}
