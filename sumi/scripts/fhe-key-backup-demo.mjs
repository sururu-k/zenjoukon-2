import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFHEOwner, createFHEEncryptor, evaluateCiphertexts, restoreFHEOwner } from '../src/secure/fhe.js';

const directory=await mkdtemp(join(tmpdir(),'sumi-bfv-key-demo-'));
let owner,contributor,restored;
try {
  owner=await createFHEOwner();
  const expectedKeyId=owner.keyId, password='fictional-demo-passphrase';
  contributor=await createFHEEncryptor(owner.exportPublicKey(),expectedKeyId);
  const total=await evaluateCiphertexts([contributor.encrypt([10,20]),contributor.encrypt([30])]);
  const sealed=await owner.exportEncrypted(password), path=join(directory,'bfv-key.json');
  await writeFile(path,JSON.stringify(sealed),{flag:'wx',mode:0o600});
  owner.destroy();owner=null;
  const stored=JSON.parse(await readFile(path,'utf8'));
  await assert.rejects(restoreFHEOwner(stored,'wrong-demo-passphrase',expectedKeyId));
  restored=await restoreFHEOwner(stored,password,expectedKeyId);
  const result=restored.decrypt(total);
  assert.equal(result.sum,60);
  console.log(`鍵の破棄後、暗号化ファイルと別途保持した鍵 ID から復元し、架空の ${result.count} 件・合計 ${result.sum} を復号しました。`);
  console.log('信頼された入力によるオフラインのデモです。復号結果の公開は秘密鍵を危険にさらす場合があります。');
} finally {
  contributor?.destroy();restored?.destroy();owner?.destroy();
  await rm(directory,{recursive:true,force:true});
}
