import assert from 'node:assert/strict';
import { createDependencySnapshot, verifyDependencyPath } from '../src/secure/dependency-path.js';

const snapshot=await createDependencySnapshot([{from:'product-A',to:'private-B'},{from:'private-B',to:'private-C'},{from:'private-C',to:'library-D'}]);
const proof=await snapshot.prove(['product-A','private-B','private-C','library-D']);
const result=await verifyDependencyPath(proof,snapshot.root,'product-A','library-D');
const changed=structuredClone(proof);changed.steps[1].edge.to='library-D';
await assert.rejects(verifyDependencyPath(changed,snapshot.root,'product-A','library-D'));
console.log(`登録済みグラフの依存経路を確認: ${result.from} → ${result.to} (${result.edgeCount}辺)`);
console.log('途中の辺の改変を拒否しました。経路は公開されます。ZK証明ではありません。');
