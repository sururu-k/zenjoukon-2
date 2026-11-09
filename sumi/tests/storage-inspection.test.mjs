import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectStoragePath} from '../scripts/storage-inspection.mjs';

test('保存先の所有者とPOSIX権限を読み取り、公開範囲が広い場合は再確認を求める',{skip:process.platform==='win32'},async()=>{
  const path=await mkdtemp(join(tmpdir(),'sumi-storage-'));
  try{
    await chmod(path,0o700);
    const privateResult=await inspectStoragePath(path);
    assert.equal(privateResult.result,'basic-mode-ok');
    assert.equal(privateResult.permissions,'700');
    assert.ok(privateResult.limitations.some(item=>item.includes('ACL')));
    await chmod(path,0o755);
    const sharedResult=await inspectStoragePath(path);
    assert.equal(sharedResult.result,'review-needed');
    assert.equal(sharedResult.accessibleToOthers,true);
    const root=fileURLToPath(new URL('../',import.meta.url));
    const command=spawnSync(process.execPath,['scripts/school-audit.mjs','inspect-path',path],{cwd:root,encoding:'utf8'});
    assert.equal(command.status,2);assert.equal(JSON.parse(command.stdout).permissions,'755');
    const link=join(path,'alias');await symlink(path,link);
    await assert.rejects(inspectStoragePath(link),/シンボリックリンク/);
    await assert.rejects(inspectStoragePath(join(path,'missing')));
  }finally{await rm(path,{recursive:true,force:true});}
});
