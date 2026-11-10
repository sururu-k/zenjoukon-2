import test from 'node:test';
import assert from 'node:assert/strict';
import { createFHEOwner, createFHEEncryptor, evaluateCiphertexts } from '../src/secure/fhe.js';

test('independent public-key encryptors contribute without decryption access', async () => {
  const owner=await createFHEOwner(), other=await createFHEOwner();
  let a,b;
  try {
    const published=owner.exportPublicKey();
    assert.equal(Object.hasOwn(published,'secretKey'),false);
    await assert.rejects(createFHEEncryptor(published,other.keyId));
    await assert.rejects(createFHEEncryptor({...published,publicKey:other.exportPublicKey().publicKey},owner.keyId));
    [a,b]=await Promise.all([createFHEEncryptor(published,owner.keyId),createFHEEncryptor(published,owner.keyId)]);
    assert.equal(Object.hasOwn(a,'decrypt'),false);
    const inputs=[a.encrypt([10,20]),b.encrypt([30])];
    const promise=evaluateCiphertexts(inputs);
    inputs[0].count=999; // mutation after validation cannot change the evaluation
    const result=owner.decrypt(await promise);
    assert.equal(result.count,3);assert.equal(result.sum,60);
    a.destroy();assert.throws(()=>a.encrypt([1]));
  } finally {a?.destroy();b?.destroy();owner.destroy();other.destroy();}
});
