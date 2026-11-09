import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A fictional self-report and an isolated temporary folder; no school settings
// or pre-existing files are inspected or changed.
if (process.platform === 'win32') throw new Error('このデモは POSIX 権限を持つ環境で実行してください。');
const dir = await mkdtemp(join(tmpdir(), 'sumi-school-demo-'));
const script = fileURLToPath(new URL('./school-audit.mjs', import.meta.url));
const run = (...args) => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  return result;
};
try {
  const reportPath = join(dir, 'fictional-report.json');
  await writeFile(reportPath, JSON.stringify({mfa:true, least_privilege:true, encrypted_backup:null, locked_storage:false, screen_privacy:true}));
  await chmod(dir, 0o755);
  const first = run('review', reportPath, dir);
  assert.equal(first.status, 2, first.stderr);
  const review = JSON.parse(first.stdout);
  assert.equal(review.assessment.evidence, 'self-reported');
  assert.equal(review.storage.result, 'review-needed');
  assert.deepEqual(review.actions.map(a => a.control).sort(), ['encrypted_backup', 'least_privilege', 'locked_storage']);
  console.log('架空の学校の点検：自己申告と一時フォルダーを確認');
  for (const action of review.actions) console.log(`要確認：${action.next}（${action.source}）`);

  // The mode change applies only to the newly created temporary folder.
  await chmod(dir, 0o700);
  const second = run('review', reportPath, dir);
  assert.equal(second.status, 2, second.stderr);
  const rechecked = JSON.parse(second.stdout);
  assert.equal(rechecked.storage.result, 'basic-mode-ok');
  assert.deepEqual(rechecked.actions.map(a => a.control).sort(), ['encrypted_backup', 'locked_storage']);
  console.log('一時フォルダーの権限を変更後：保存先の基本権限は確認済み、自己申告の未確認・未対応は残ります。');
  console.log('自己申告と１箇所の基本権限だけの点検です。ACL・親フォルダー・学校全体の安全は確認していません。');
} finally {
  await rm(dir, { recursive: true, force: true });
}
