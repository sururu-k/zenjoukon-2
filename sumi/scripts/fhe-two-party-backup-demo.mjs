import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFHEOwner, evaluateCiphertexts } from '../src/secure/fhe.js';
import { createFheTwoPartyBackup, restoreFheTwoPartyBackup } from '../src/secure/fhe-two-party-backup.js';

const directory=await mkdtemp(join(tmpdir(),'sumi-bfv-recovery-demo-'));
let owner,restored;
try {
  owner=await createFHEOwner();
  const total=await evaluateCiphertexts([owner.encrypt([10,20]),owner.encrypt([30])]);
  const a='fictional-guardian-A-pass',b='fictional-guardian-B-pass',keyId=owner.keyId;
  const saved=await createFheTwoPartyBackup(owner,a,b),backupId=saved.backup.backupId;
  for(const name of ['backup','shareA','shareB'])await writeFile(join(directory,`${name}.json`),JSON.stringify(saved[name]),{flag:'wx',mode:0o600});
  owner.destroy();owner=null;
  const [backup,shareA,shareB]=await Promise.all(['backup','shareA','shareB'].map(async name=>JSON.parse(await readFile(join(directory,`${name}.json`),'utf8'))));
  await assert.rejects(restoreFheTwoPartyBackup(backup,shareA,a,shareA,b,keyId,backupId));
  restored=await restoreFheTwoPartyBackup(backup,shareA,a,shareB,b,keyId,backupId);
  const result=restored.decrypt(total);assert.equal(result.sum,60);
  console.log(`A・B 両方の復旧ファイルとパスフレーズで鍵を復元し、架空の ${result.count} 件・合計 ${result.sum} を復号。`);
  console.log('同じシェアの二重使用を拒否。復元時は一つのプロセスに秘密鍵が揃い、閾値復号ではありません。');
} finally {restored?.destroy();owner?.destroy();await rm(directory,{recursive:true,force:true});}
