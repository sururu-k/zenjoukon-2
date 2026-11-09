import { encryptDraft, decryptDraft } from '../crypto.js';
import { splitContribution, aggregateParty, combinePartyTotals } from './mpc.js';

const wrap=payload=>({format:'sumi-mpc-file',version:1,payload});
async function unwrap(envelope,password){
  const result=await decryptDraft(envelope,password);
  if(result?.format!=='sumi-mpc-file'||result.version!==1||!result.payload||typeof result.payload!=='object')throw new Error('対応する秘匿集計ファイルではありません。');
  return result.payload;
}
export async function sealSchoolContributions(values,campaign,passwordA,passwordB){
  if(passwordA===passwordB)throw new Error('AとBには異なるパスフレーズを設定してください。');
  const split=splitContribution(values,campaign);
  return {A:await encryptDraft(wrap(split.A),passwordA),B:await encryptDraft(wrap(split.B),passwordB)};
}
export async function sealPartyTotal(envelopes,party,password){
  if(!Array.isArray(envelopes)||envelopes.length<2||envelopes.length>100)throw new Error('２〜100組のファイルが必要です。');
  const packets=[];for(const envelope of envelopes)packets.push(await unwrap(envelope,password));
  const total=await aggregateParty(packets,party);
  return encryptDraft(wrap(total),password);
}
export async function openCombinedTotal(envelopeA,passwordA,envelopeB,passwordB){
  const totalA=await unwrap(envelopeA,passwordA),totalB=await unwrap(envelopeB,passwordB);
  return combinePartyTotals(totalA,totalB);
}
