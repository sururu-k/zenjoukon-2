import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PRODUCTS } from '../src/product-catalog.js';
import { evaluateMasking } from './evaluate-masking.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function writeAssurance(formal,egress){
  const root=new URL('../',import.meta.url),out=new URL('../dist/assurance/',import.meta.url);
  await mkdir(out,{recursive:true});
  const boundFiles=Object.fromEntries(Object.entries(egress.files).map(([name,digest])=>['src/'+name,digest]));
  for(const name of ['formal/Policy.lean','formal/Agent.lean','formal/Release.lean','formal/Verifier.lean','formal/lean-toolchain','evaluation/masking-cases.json','package.json','package-lock.json','scripts/check-formal.mjs','scripts/check-egress.mjs','scripts/evaluate-masking.mjs','scripts/write-assurance.mjs','scripts/build.mjs','ASSURANCE.md','EVALUATION.md','SURVEY.md','PRIVACY_COMPUTATION.md','PRODUCTS.md'])boundFiles[name]=sha(await readFile(new URL(name,root)));
  for(const name of [...Object.keys(egress.files).filter(n=>n.endsWith('.js')),'seal_throws.wasm'])boundFiles['dist/'+name]=sha(await readFile(new URL('dist/'+name,root)));
  let commit=null,dirty=null;
  try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim();dirty=!!execFileSync('git',['status','--porcelain'],{cwd:fileURLToPath(root),encoding:'utf8'}).trim();}catch{}
  const maskingEvaluation=evaluateMasking(JSON.parse(await readFile(new URL('evaluation/masking-cases.json',root),'utf8')));
  const report={format:'sumi-assurance-report',version:1,generatedAt:new Date().toISOString(),products:PRODUCTS,source:{commit,dirty,files:boundFiles},formal,maskingEvaluation,structuralChecks:egress,
    guarantee:{model:'authorized external plaintext noninterference with explicit release',completeSystemProof:false,fullJavaScriptProof:false,ciphertextIndistinguishabilityProof:false,sideChannelProof:false,piiDetectionCompletenessProof:false},
    trustAssumptions:['Lean kernel and standard axioms','verification scripts and build environment','honest mapping from reviewed UI snapshot to released value','browser, OS, extensions and device administrator','code hosting, TLS, dependencies and public WASM loader','Web Crypto, randomness and secret passphrase','authorized loopback AI receiver and its network behavior'],
    allowedObservations:['approved plaintext and policy','public keys and signatures','authorized aggregate statistics and protocol metadata','fixed-size v2 encrypted artifacts','file existence, purpose and date','public action schedule, timing, resource use and failures'],
    implementationChecks:{authorizationCases:formal.authorizationCases,channelCases:formal.channelCases,firstPartyAST:'guardrails only; not a sound semantic proof',draftPadding:'v2 1048576-byte plaintext frame; AES-GCM ciphertext adds 16-byte tag',legacyV1:'read-compatible; variable length'},
    ci:process.env.GITHUB_RUN_ID?{runUrl:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`} :null};
  await writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');
  await cp(new URL('formal/Policy.lean',root),new URL('Policy.lean',out));
  await cp(new URL('formal/Agent.lean',root),new URL('Agent.lean',out));
  await cp(new URL('formal/Release.lean',root),new URL('Release.lean',out));
  await cp(new URL('formal/Verifier.lean',root),new URL('Verifier.lean',out));
  await cp(new URL('ASSURANCE.md',root),new URL('ASSURANCE.md',out));
  await cp(new URL('EVALUATION.md',root),new URL('EVALUATION.md',out));
  await cp(new URL('SURVEY.md',root),new URL('SURVEY.md',out));
  await cp(new URL('PRIVACY_COMPUTATION.md',root),new URL('PRIVACY_COMPUTATION.md',out));
  await cp(new URL('PRODUCTS.md',root),new URL('PRODUCTS.md',out));
  const htmlPath=new URL('dist/assurance.html',root),html=await readFile(htmlPath,'utf8');
  const fragment=`<p>Leanモデル：${formal.theorems.length}定理を検査済み。認可と出力経路：それぞれ${formal.authorizationCases.toLocaleString()}条件でJavaScriptと一致。</p><p>エージェントの実行条件：${formal.agent.theorems.length}定理、${formal.agent.selectorCases}条件で判定を照合。</p><p class="help">JavaScript全体と端末全体の不在証明：未完了。モデルSHA-256：<code>${boundFiles['formal/Policy.lean']}</code></p>`;
  if(!html.includes('<!-- SUMI_ASSURANCE_RESULT -->'))throw new Error('保証範囲ページの検証結果を配置できません。');
  await writeFile(htmlPath,html.replace('<!-- SUMI_ASSURANCE_RESULT -->',fragment));
}
