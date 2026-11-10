#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeSigningKey, canonical, hash } from '../src/crypto.js';
import { createFHEOwner, createFHEEncryptor } from '../src/secure/fhe.js';
import { signFheContribution } from '../src/secure/signed-fhe-contributions.js';
import { createContributorFheGate } from '../src/secure/contributor-fhe-gate.js';
import { signFheVerificationContext } from '../src/secure/signed-fhe-context.js';

const args=process.argv.slice(2);
if(args.length!==1||args[0].startsWith('-')){process.stderr.write('使い方: node scripts/fhe-example-files.mjs <新しいディレクトリ>\n');process.exitCode=1;}
else {
  const dir=args[0];let owner,encryptor;
  try {
    await mkdir(dir,{mode:0o700});
    owner=await createFHEOwner();encryptor=await createFHEEncryptor(owner.exportPublicKey(),owner.keyId);
    const members=await Promise.all([makeSigningKey(),makeSigningKey(),makeSigningKey()]),signer=await makeSigningKey();
    const participants=await Promise.all(members.map(async(k,i)=>({participantId:`sample${i+1}`,publicKey:await crypto.subtle.exportKey('jwk',k.publicKey)})));
    const decryptorTrust={format:'sumi-fhe-decryptor-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',signer.publicKey)]};
    const round={format:'sumi-fhe-round',version:1,roundId:crypto.randomUUID(),datasetId:'fictional-school',recipient:'sample-verifier',keyId:owner.keyId};
    const contributions=await Promise.all([10,20,30].map((n,i)=>signFheContribution(encryptor.encrypt([n]),round,participants[i].participantId,members[i])));
    const gate=createContributorFheGate({owner,signingKeys:[signer],expectedRound:round,participants});
    const request=await gate.approve(contributions), outcome=await gate.agent.execute(request.requestId);
    if(outcome.status!=='completed')throw new Error('架空の集計を作成できませんでした。');
    const result={contributions,attestation:outcome.envelope};
    const context={format:'sumi-fhe-verification-context',version:1,round,request,participants,decryptorTrust};
    const authority=await makeSigningKey(),signedContext=await signFheVerificationContext(context,[authority]);
    const authorityTrust={format:'sumi-fhe-context-authority-trust',version:1,threshold:1,publicKeys:[await crypto.subtle.exportKey('jwk',authority.publicKey)]};
    const contextHash=await hash(canonical(context));
    for(const [name,data] of [['result.json',result],['expected.json',context],['signed-expected.json',signedContext],['authority.json',authorityTrust],['context-hash.json',{contextHash}]])await writeFile(join(dir,name),JSON.stringify(data)+'\n',{flag:'wx',mode:0o600});
    console.log('架空の結果・期待条件・署名付き条件・管理鍵・条件ハッシュを作成しました。すべて同じ作成者のため、信頼の独立性はありません。');
  } catch(error) {process.stderr.write(`${error.message}\n`);process.exitCode=1;}
  finally {encryptor?.destroy();owner?.destroy();}
}
