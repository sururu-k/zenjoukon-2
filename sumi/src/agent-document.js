import { prepareDocument } from './document-workflow.js';
import { createAgentGateway } from './agent-guard.js';

// The gateway is initialized only with the reviewable, transformed text.
// Pattern detection is incomplete; callers must review the preview.
export function prepareAgentDocument(source,hiddenWords=''){
  const {result}=prepareDocument(source,hiddenWords);
  return Object.freeze({preview:result.text,maskedCount:result.changed,gateway:createAgentGateway(result.text)});
}
