import test from 'node:test';
import assert from 'node:assert/strict';
import { createDependencySnapshot, verifyDependencyPath } from '../src/secure/dependency-path.js';

test('committed dependency edges verify a complete path against an independent root',async()=>{
  const edges=[{from:'product',to:'private-a'},{from:'private-a',to:'private-b'},{from:'private-b',to:'library'},{from:'other',to:'library'}];
  const snapshot=await createDependencySnapshot(edges), reordered=await createDependencySnapshot([...edges].reverse());
  assert.equal(snapshot.root,reordered.root);
  const proof=await snapshot.prove(['product','private-a','private-b','library']);
  assert.deepEqual(await verifyDependencyPath(proof,snapshot.root,'product','library'),{from:'product',to:'library',edgeCount:3});
  const tampered=structuredClone(proof);tampered.steps[1].edge.to='library';
  await assert.rejects(verifyDependencyPath(tampered,snapshot.root,'product','library'));
  const omitted=structuredClone(proof);omitted.steps.splice(1,1);
  await assert.rejects(verifyDependencyPath(omitted,snapshot.root,'product','library'));
  await assert.rejects(verifyDependencyPath(proof,'0'.repeat(64),'product','library'));
  await assert.rejects(verifyDependencyPath(proof,snapshot.root,'other','library'));
  await assert.rejects(snapshot.prove(['product','library']));
});

test('rejects duplicate and invalid edges and bounded paths',async()=>{
  await assert.rejects(createDependencySnapshot([{from:'a',to:'b'},{from:'a',to:'b'}]));
  await assert.rejects(createDependencySnapshot([{from:'a',to:'a'}]));
  const snapshot=await createDependencySnapshot([{from:'a',to:'b'}]);
  const proof=await snapshot.prove(['a','b']);
  assert.equal((await verifyDependencyPath(proof,snapshot.root,'a','b')).edgeCount,1);
  await assert.rejects(snapshot.prove(['a','b','a']));
});
