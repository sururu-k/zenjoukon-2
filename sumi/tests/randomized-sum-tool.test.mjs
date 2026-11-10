import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningKey } from '../src/crypto.js';
import { createRandomizedSumTool } from '../src/secure/randomized-sum-tool.js';
import { createVerifiedSumToolGateway } from '../src/secure/verified-tool-gateway.js';

test('randomized answers feed signed sum proofs and reuse one sample per dataset', async () => {
  const key=await makeSigningKey(), trust={format:'sumi-sum-verifier-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',key.publicKey)]};
  const source={school:[true,false,true,false],community:[false,true,false]}, tool=createRandomizedSumTool(source,[key]), gateway=createVerifiedSumToolGateway(trust,'test-reader');
  source.school.length=0;
  const [a,b]=await Promise.all([gateway.begin('school'),gateway.begin('school')]);
  const [ra,rb]=await Promise.all([tool.run(a),tool.run(b)]);
  const [va,vb]=await Promise.all([gateway.accept(a.request.requestId,ra),gateway.accept(b.request.requestId,rb)]);
  assert.equal(va.sum,vb.sum); assert.equal(va.count,4);assert.equal(vb.count,4);
  assert.notDeepEqual(ra.evidence.payload.proof.commitments,rb.evidence.payload.proof.commitments);
  assert.equal(Object.hasOwn(ra,'truth'),false);
  const community=await gateway.begin('community');
  assert.equal((await gateway.accept(community.request.requestId,await tool.run(community))).count,3);
  await assert.rejects(tool.run({...a,arguments:{datasetId:'community'}}));
  await assert.rejects(tool.run({...a,arguments:{datasetId:'unknown'}}));
});

test('rejects invalid dataset shapes before handling a request', async () => {
  const key=await makeSigningKey();
  assert.throws(()=>createRandomizedSumTool({school:[true,false]},[key]));
  assert.throws(()=>createRandomizedSumTool({school:[true,false,1]},[key]));
});
