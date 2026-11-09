import { minutes } from './secure/numeric.js';

// A proof may omit raw values while the released aggregate still reveals them.
export function describeSumDisclosure(values, context) {
  const entries = minutes(values);
  if (typeof context !== 'string' || !context.trim()) throw new Error('証明の用途を確認してください。');
  const total = entries.reduce((sum, value) => sum + value, 0);
  return `公開：用途「${context}」、${entries.length}件、合計 ${total}、コミットメントと証明。\n${entries.length === 1 ? '１件のため、公開する合計から個別値がそのまま分かります。' : '個別値を含めなくても、少人数の集計や他の情報との照合で推測される場合があります。'}\n用途に個人情報を書かないでください。`;
}
