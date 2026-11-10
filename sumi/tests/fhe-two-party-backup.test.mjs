import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFHEOwner, evaluateCiphertexts } from '../src/secure/fhe.js';
import { createFheTwoPartyBackup, restoreFheTwoPartyBackup } from '../src/secure/fhe-two-party-backup.js';

test('both separately encrypted shares are required to restore the BFV owner', async () => {
  const dir=await mkdtemp(join(tmpdir(),'sumi-bfv-recovery-')),owner=await createFHEOwner();let restored;
  try {
    const a='participant-A-password',b='participant-B-password';
    const total=await evaluateCiphertexts([owner.encrypt([10,20,30])]);
    await assert.rejects(createFheTwoPartyBackup(owner,a,a));
    const backup=await createFheTwoPartyBackup(owner,a,b),keyId=owner.keyId,backupId=backup.backup.backupId;
    for(const name of ['backup','shareA','shareB'])await writeFile(join(dir,`${name}.json`),JSON.stringify(backup[name]),{flag:'wx',mode:0o600});
    const [stored,A,B]=await Promise.all(['backup','shareA','shareB'].map(async name=>JSON.parse(await readFile(join(dir,`${name}.json`),'utf8'))));
    await assert.rejects(restoreFheTwoPartyBackup(stored,A,'incorrect-password',B,b,keyId,backupId));
    await assert.rejects(restoreFheTwoPartyBackup(stored,B,b,A,a,keyId,backupId));
    await assert.rejects(restoreFheTwoPartyBackup(stored,A,a,A,b,keyId,backupId));
    await assert.rejects(restoreFheTwoPartyBackup(stored,A,a,B,b,'0'.repeat(64),backupId));
    const different=await createFheTwoPartyBackup(owner,a,b);
    await assert.rejects(restoreFheTwoPartyBackup(stored,A,a,different.shareB,b,keyId,backupId));
    owner.destroy();
    restored=await restoreFheTwoPartyBackup(stored,A,a,B,b,keyId,backupId);
    assert.deepEqual(restored.decrypt(total),{count:3,sum:60,mean:20});
  } finally {restored?.destroy();owner.destroy();await rm(dir,{recursive:true,force:true});}
});
