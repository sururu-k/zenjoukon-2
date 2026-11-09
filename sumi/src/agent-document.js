import { prepareDocument } from './document-workflow.js';
import { createAgentGateway } from './agent-guard.js';

// The gateway is initialized only with the reviewable, transformed text.
// Pattern detection is incomplete; callers must review the preview.
export function prepareAgentDocument(source,hiddenWords=''){
  if(typeof hiddenWords!=='string'||hiddenWords.length>10000)throw new Error('追加で隠す語句は10,000文字以内で指定してください。');
  const words=hiddenWords.split(/\r?\n/).map(word=>word.trim()).filter(Boolean);
  if(words.length>100||words.some(word=>word.length>100))throw new Error('追加で隠す語句は100個以内、１語100文字以内で指定してください。');
  const prepare=text=>prepareDocument(text,words.join('\n')).result;
  let current=prepare(source);
  const inner=createAgentGateway(current.text);
  const gateway=Object.freeze({
    agent:inner.agent,
    get revision(){return inner.revision;},
    approveDocument(revision){inner.approveDocument(revision);},
    replaceDocument(source){
      // Prepare before changing state: failed input preserves the old version.
      const next=prepare(source);
      inner.replaceDocument(next.text);
      current=next;
    }
  });
  return Object.freeze({get preview(){return current.text;},get maskedCount(){return current.changed;},gateway});
}
