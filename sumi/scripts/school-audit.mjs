import { readFile } from 'node:fs/promises';
import { SCHOOL_POLICY, assessSchoolPolicy, generateConfigurationDraft } from '../src/school-policy.js';

const [command, file, extra]=process.argv.slice(2);
try {
  if(extra||!['check','draft'].includes(command)||command==='check'&&!file||command==='draft'&&file)throw new Error('使い方: node scripts/school-audit.mjs check <確認結果.json> | draft');
  const output=command==='draft'?generateConfigurationDraft(SCHOOL_POLICY):assessSchoolPolicy(SCHOOL_POLICY,JSON.parse(await readFile(file,'utf8')));
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
  if(command==='check'&&!output.complete)process.exitCode=2;
}catch(error){process.stderr.write((error.message||'処理に失敗しました。')+'\n');process.exitCode=1;}
