import { prepareDocument } from './document-workflow.js';
import { createAgentGateway } from './agent-guard.js';

// The gateway is initialized only with the reviewable, transformed text.
// Pattern detection is incomplete; callers must review the preview.
export function prepareAgentDocument(source,hiddenWords=''){
  if(typeof hiddenWords!=='string'||hiddenWords.length>10000)throw new Error('追加で隠す語句は10,000文字以内で指定してください。');
  const words=hiddenWords.split(/\r?\n/).map(word=>word.trim()).filter(Boolean);
  if(words.length>100||words.some(word=>word.length>100))throw new Error('追加で隠す語句は100個以内、１語100文字以内で指定してください。');
  const {result}=prepareDocument(source,words.join('\n'));
  return Object.freeze({preview:result.text,maskedCount:result.changed,gateway:createAgentGateway(result.text)});
}
