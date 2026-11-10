import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decryptDraft, encryptDraft } from '../src/crypto.js';
import { createFHEOwner, createFHEEncryptor, evaluateCiphertexts, restoreFHEOwner } from '../src/secure/fhe.js';

test('encrypted BFV key can be restored for earlier ciphertexts with independently pinned ID', async () => {
  const dir=await mkdtemp(join(tmpdir(),'sumi-bfv-key-test-')), owner=await createFHEOwner(), other=await createFHEOwner();
  let contributor,restored;
  try {
    const id=owner.keyId,password='fictional-bfv-passphrase';
    contributor=await createFHEEncryptor(owner.exportPublicKey(),id);
    const packets=[contributor.encrypt([10,20]),contributor.encrypt([30])], total=await evaluateCiphertexts(packets);
    const encrypted=await owner.exportEncrypted(password);
    assert.equal(JSON.stringify(encrypted).includes(id),false);
    const path=join(dir,'key.json');await writeFile(path,JSON.stringify(encrypted),{flag:'wx',mode:0o600});
    const fromFile=JSON.parse(await readFile(path,'utf8'));
    await assert.rejects(restoreFHEOwner(fromFile,'wrong-test-passphrase',id));
    await assert.rejects(restoreFHEOwner(fromFile,password,other.keyId));
    const tampered=structuredClone(fromFile);tampered.ciphertext=(tampered.ciphertext[0]==='A'?'B':'A')+tampered.ciphertext.slice(1);
    await assert.rejects(restoreFHEOwner(tampered,password,id));
    const original=await decryptDraft(fromFile,password),foreign=await decryptDraft(await other.exportEncrypted(password),password);
    const mismatched=await encryptDraft({...original,secretKey:foreign.secretKey},password);
    await assert.rejects(restoreFHEOwner(mismatched,password,id));
    owner.destroy();
    restored=await restoreFHEOwner(fromFile,password,id);
    assert.deepEqual(restored.decrypt(total),{count:3,sum:60,mean:20});
    assert.equal(restored.exportPublicKey().keyId,id);
  } finally {contributor?.destroy();restored?.destroy();owner.destroy();other.destroy();await rm(dir,{recursive:true,force:true});}
});

test('destroyed owner cannot finish a pending encrypted export', async () => {
  const owner=await createFHEOwner(), pending=owner.exportEncrypted('fictional-bfv-passphrase');
  owner.destroy();
  await assert.rejects(pending);
  await assert.rejects(owner.exportEncrypted('fictional-bfv-passphrase'));
});
