import test from 'node:test';
import assert from 'node:assert/strict';
import { proveCommittedBit, verifyCommittedBit } from '../src/secure/bit-proof.js';

test('0または1のコミットメントを証明し、証明や用途の改変を拒否する',()=>{
  for(const bit of [0,1]){
    const proof=proveCommittedBit(bit,'survey-campaign');
    assert.equal(verifyCommittedBit(proof),true);
    assert.equal(Object.hasOwn(proof,'bit'),false);
    assert.equal(verifyCommittedBit({...proof,context:'another-campaign'}),false);
    assert.equal(verifyCommittedBit({...proof,z0:'0'.repeat(64)}),false);
    assert.equal(verifyCommittedBit({...proof,e1:'f'.repeat(64)}),false);
  }
  const zero=proveCommittedBit(0,'survey-campaign'),one=proveCommittedBit(1,'survey-campaign');
  assert.equal(verifyCommittedBit({...zero,commitment:one.commitment}),false);
  assert.equal(verifyCommittedBit({...zero,R1:one.R1}),false);
  assert.throws(()=>proveCommittedBit(2,'survey-campaign'));
  assert.equal(verifyCommittedBit({}),false);
});
