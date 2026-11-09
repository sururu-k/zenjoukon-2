import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,symlink,rm,writeFile} from 'node:fs/promises';
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
    const review=spawnSync(process.execPath,['scripts/school-audit.mjs','review','school-backend/observations.example.json',path],{cwd:root,encoding:'utf8'});
    assert.equal(review.status,2);
    const combined=JSON.parse(review.stdout);
    assert.equal(combined.assessment.evidence,'self-reported');
    assert.equal(combined.assessment.results.find(item=>item.id==='least_privilege').status,'reported-unmet');
    assert.ok(combined.actions.some(item=>item.source==='observed-posix-mode'));
    assert.ok(combined.actions.some(item=>item.source==='self-reported'));
    const selfReport=join(path,'report.json');
    await writeFile(selfReport,JSON.stringify({mfa:true,least_privilege:true,encrypted_backup:true,locked_storage:true,screen_privacy:true}));
    const conflict=spawnSync(process.execPath,['scripts/school-audit.mjs','review',selfReport,path],{cwd:root,encoding:'utf8'});
    assert.equal(conflict.status,2);
    const report=JSON.parse(conflict.stdout);
    assert.equal(report.assessment.complete,true);
    assert.equal(report.actions.length,1);
    assert.equal(report.actions[0].source,'observed-posix-mode');
    const link=join(path,'alias');await symlink(path,link);
    await assert.rejects(inspectStoragePath(link),/シンボリックリンク/);
    await assert.rejects(inspectStoragePath(join(path,'missing')));
  }finally{await rm(path,{recursive:true,force:true});}
});
