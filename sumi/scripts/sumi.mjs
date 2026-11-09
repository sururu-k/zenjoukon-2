#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { composeDocument, prepareDocument } from '../src/document-workflow.js';
import { createWorkspace } from '../src/workspace.js';
import { requestFor } from '../src/authorization.js';
import { dispatchEgress } from '../src/information-flow.js';
import { proveCommittedSum, verifyCommittedSum } from '../src/secure/zk.js';
import { verifyPackage } from '../src/crypto.js';

const usage = '使い方: node scripts/sumi.mjs write <入力.json> <共有ファイル> | gate <入力.txt> <共有ファイル> | prove <数値.json> <証明.json> | verify <証明.json> | verify-share <共有ファイル> [期待する鍵指紋]';
const [command, input, output, ...extra] = process.argv.slice(2);

async function readText(path) {
  const text = await readFile(path, 'utf8');
  if (text.length > 1_000_000) throw new Error('入力ファイルが大きすぎます。');
  return text;
}
async function save(path, value) {
  // Never overwrite an existing file, including the input file.
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
async function confirm() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question('\n上記の内容と出力先を確認しましたか？ 保存するには yes と入力: ');
    return answer.trim() === 'yes';
  } finally { rl.close(); }
}

async function main() {
  if (extra.length || !input || !['write', 'gate', 'prove', 'verify', 'verify-share'].includes(command) || (command === 'verify' ? !!output : command === 'verify-share' ? false : !output)) throw new Error(usage);
  if (command === 'verify-share') {
    const result = await verifyPackage(JSON.parse(await readText(input)), output || '');
    stdout.write(`署名: ${result.valid ? '正常' : '不正'}\n鍵指紋: ${result.fingerprint}\n送信者: ${result.identity === 'matched' ? '指定した鍵と一致' : result.identity === 'mismatch' ? '指定した鍵と不一致' : '未確認'}\n`);
    if (!result.valid || result.identity === 'mismatch') process.exitCode = 2;
    return;
  }
  if (command === 'verify') {
    const valid = verifyCommittedSum(JSON.parse(await readText(input)));
    stdout.write(valid ? '証明は検証できました。入力の真実性や情報漏洩の不在は証明しません。\n' : '証明を検証できませんでした。\n');
    if (!valid) process.exitCode = 2;
    return;
  }
  if (command === 'prove') {
    const data = JSON.parse(await readText(input));
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.values) || typeof data.context !== 'string') throw new Error('数値入力は context と values を含むJSONにしてください。');
    const proof = proveCommittedSum(data.values, data.context);
    if (!verifyCommittedSum(proof)) throw new Error('生成した証明の検証に失敗しました。');
    stdout.write(`証明の用途: ${proof.context}\n開示: 件数 ${proof.count}、合計 ${proof.sum}、コミットメントと証明\n保存先: ${output}\n入力の真実性や情報漏洩の不在は証明しません。\n`);
    if (!await confirm()) throw new Error('保存を取り消しました。');
    const request = requestFor('export', 'share-file', 'public', { fresh: true, reviewed: true });
    await dispatchEgress(request, { released: proof }, { 'share-file': value => save(output, value) });
  } else {
    const source = command === 'write' ? composeDocument(JSON.parse(await readText(input))) : await readText(input);
    const prepared = prepareDocument(source);
    const workspace = createWorkspace({ download: (_name, value) => save(output, value) });
    workspace.setDocument(prepared.result, prepared.policy);
    workspace.setDestination('share-file');
    stdout.write(`共有版:\n${prepared.result.text}\n\n情報区分: ${workspace.classification}\n保存先: ${output}\n`);
    if (!await confirm()) throw new Error('保存を取り消しました。');
    await workspace.approve();
    const receipt = await workspace.export();
    stdout.write(`署名鍵の指紋: ${receipt.fingerprint}\n`);
  }
  stdout.write('保存しました。既存ファイルは上書きしません。\n');
}
main().catch(error => { stderr.write(`${error.message}\n`); process.exitCode = 1; });
