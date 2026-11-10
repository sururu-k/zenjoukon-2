import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, hash } from '../src/crypto.js';

const run=promisify(execFile);
const script=name=>fileURLToPath(new URL(`../scripts/${name}`,import.meta.url));
const cli=(...args)=>run(process.execPath,[script('fhe-verify.mjs'),...args],{timeout:30000,maxBuffer:1024*1024});

test('CLI creates fictional files, uses separate expected context and persists replay rejection', async () => {
  const dir=await mkdtemp(join(tmpdir(),'sumi-fhe-cli-'));
  try {
    const example=join(dir,'example'),ledger=join(dir,'replay.sqlite');
    await run(process.execPath,[script('fhe-example-files.mjs'),example],{timeout:30000});
    await assert.rejects(run(process.execPath,[script('fhe-example-files.mjs'),example],{timeout:30000}));
    const initialized=JSON.parse((await cli('init',ledger)).stdout);
    await assert.rejects(cli('init',ledger));
    const result=join(example,'result.json'),expected=join(example,'expected.json'),bad=join(dir,'bad.json');
    const context=JSON.parse(await readFile(expected,'utf8'));context.round.recipient='other';
    await writeFile(bad,JSON.stringify(context));
    await assert.rejects(cli('verify',result,bad,ledger,initialized.ledgerId));
    const verified=JSON.parse((await cli('verify',result,expected,ledger,initialized.ledgerId)).stdout);
    assert.equal(verified.status,'verified');assert.equal(verified.sum,60);assert.equal(verified.participants,3);
    await assert.rejects(cli('verify',result,expected,ledger,initialized.ledgerId));
    await assert.rejects(cli('verify',result,expected,ledger,'0'.repeat(32)));
    const signedLedger=join(dir,'signed.sqlite');
    const signedId=JSON.parse((await cli('init',signedLedger)).stdout).ledgerId;
    const signed=join(example,'signed-expected.json'),authority=join(example,'authority.json');
    const {contextHash}=JSON.parse(await readFile(join(example,'context-hash.json'),'utf8'));
    await assert.rejects(cli('verify-signed',result,signed,authority,'0'.repeat(64),signedLedger,signedId));
    const tampered=JSON.parse(await readFile(signed,'utf8'));tampered.context.round.recipient='evil';
    const badSigned=join(dir,'bad-signed.json');await writeFile(badSigned,JSON.stringify(tampered));
    await assert.rejects(cli('verify-signed',result,badSigned,authority,contextHash,signedLedger,signedId));
    const changed=JSON.parse(await readFile(signed,'utf8'));changed.context.request.inputDigest='0'.repeat(64);
    await writeFile(badSigned,JSON.stringify(changed));
    await assert.rejects(cli('verify-signed',result,badSigned,authority,await hash(canonical(changed.context)),signedLedger,signedId));
    const checked=JSON.parse((await cli('verify-signed',result,signed,authority,contextHash,signedLedger,signedId)).stdout);
    assert.equal(checked.sum,60);assert.equal(checked.contextSignatures,1);
    await assert.rejects(cli('verify-signed',result,signed,authority,contextHash,signedLedger,signedId));
  } finally {await rm(dir,{recursive:true,force:true});}
});
