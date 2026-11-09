import { canonical, hash } from './crypto.js';

// A closed lookup table for proposals. Decisions are independent of any LLM.
export const AGENT_POLICY='sumi-agent-guard-v1';
const rules=Object.freeze({
  'student|read|own-document':'allow',
  'teacher|read|class-document':'allow',
  'agent|read|approved-document':'allow',
  'agent|summarize|approved-document':'allow',
  'agent|export|approved-document':'review',
  'agent|send|external-service':'deny',
  'agent|delete|class-document':'deny',
  'administrator|read|private-consultation':'deny'
});
export function evaluateAgentAction(request){
  if(!request||typeof request.actor!=='string'||typeof request.action!=='string'||typeof request.resource!=='string')return Object.freeze({decision:'deny',reason:'入力が不正です。',policy:AGENT_POLICY});
  const decision=rules[`${request.actor}|${request.action}|${request.resource}`]||'deny';
  return Object.freeze({decision,reason:decision==='allow'?'登録された条件に一致しました。':decision==='review'?'利用者による確認が必要です。':'登録されていないか、禁止された操作です。',policy:AGENT_POLICY});
}
export async function createDecisionReceipt(request){
  const input={actor:request?.actor,action:request?.action,resource:request?.resource};
  const result=evaluateAgentAction(input);
  if(Object.values(input).some(value=>typeof value!=='string'||value.length>80))throw new Error('操作の入力が不正です。');
  return Object.freeze({format:'sumi-agent-decision',version:1,input,result,digest:await hash(canonical({input,result}))});
}
// This unkeyed digest checks consistency only: anyone can recompute it.
// It does not authenticate an actor or prove that an action happened.
export async function verifyDecisionReceipt(receipt){
  if(receipt?.format!=='sumi-agent-decision'||receipt.version!==1||!receipt.input||!receipt.result)return false;
  const expected=evaluateAgentAction(receipt.input);
  return canonical(expected)===canonical(receipt.result)&&receipt.digest===await hash(canonical({input:receipt.input,result:expected}));
}

// Give `agent` to the agent and retain the document/approval methods in the
// trusted caller. This boundary is an API discipline, not OS process isolation.
export function createAgentGateway(initialDocument){
  if(typeof initialDocument!=='string'||initialDocument.length>50000)throw new Error('文書は50,000文字以内にしてください。');
  let documentText=initialDocument,revision=0,approvedRevision=null;
  const agent=Object.freeze({
    async execute(proposal){
      if(!proposal||typeof proposal!=='object')throw new Error('操作の提案が不正です。');
      // Snapshot caller-controlled fields before the asynchronous receipt hash.
      const {action,resource,revision:requestedRevision}=proposal;
      if(typeof action!=='string'||typeof resource!=='string'||!Number.isInteger(requestedRevision))throw new Error('操作の提案が不正です。');
      const request={actor:'agent',action,resource};
      const decision=evaluateAgentAction(request);
      const receipt=await createDecisionReceipt(request);
      // The event contains metadata only; it is not a signed or durable log.
      const result=(status,reason,value)=>({status,reason,...(status==='completed'?{value}:{}),receipt,event:Object.freeze({actor:'agent',action,resource,requestedRevision,currentRevision:revision,policyDecision:decision.decision,status,reason})});
      if(requestedRevision!==revision)return result('denied','文書が変更されました。');
      if(decision.decision!=='allow')return result('denied',decision.reason);
      if(approvedRevision!==revision)return result('denied','この版の文書はまだ確認されていません。');
      if(resource!=='approved-document')return result('denied','対象を確認できません。');
      if(action==='read')return result('completed','確認済みの文書を読み取りました。',documentText);
      if(action==='summarize')return result('completed','確認済みの文書から先頭３文を抽出しました。',documentText.split(/(?<=[。！？])|\n/u).map(s=>s.trim()).filter(Boolean).slice(0,3).join('\n'));
      return result('denied','未実装の操作です。');
    }
  });
  return Object.freeze({
    agent,
    replaceDocument(text){if(typeof text!=='string'||text.length>50000)throw new Error('文書は50,000文字以内にしてください。');documentText=text;revision++;approvedRevision=null;},
    get revision(){return revision;},
    approveDocument(expectedRevision){
      if(!Number.isInteger(expectedRevision)||expectedRevision!==revision)throw new Error('文書が変更されました。現在の版を確認してください。');
      approvedRevision=revision;
    }
  });
}
