import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSumDisclosure } from '../src/proof-disclosure.js';

test('証明前に公開値と、合計から個別値を推測できる可能性を示す', () => {
  assert.match(describeSumDisclosure([12], '人数'), /１件.*個別値/);
  assert.match(describeSumDisclosure([12, 18, 9, 21], '人数'), /4件、合計 60/);
  assert.match(describeSumDisclosure([12, 18], '人数'), /推測される場合/);
  assert.throws(() => describeSumDisclosure([], '人数'));
});
