import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { prepareAgentDocument } from '../src/agent-document.js';
import { createAgentAssistant } from '../src/agent-assistant.js';
import { createAgentLocalTransport } from '../scripts/agent-local-transport.mjs';

// A real loopback HTTP connection to a fictional model service, never an LLM.
// Bind exclusively; do not send test data to any existing service.
test('ローカルHTTPへの送信前に共通語句を加工し、確認前は送らない', {timeout:15000}, async t => {
  const received = [];
  const server = createServer(async (req,res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received.push({path:req.url, body:JSON.parse(body)});
    res.setHeader('content-type','application/json');
    if (req.url === '/api/show') res.end(JSON.stringify({model_info:{architecture:'fixture'}}));
    else if (req.url === '/api/generate') res.end(JSON.stringify({response:JSON.stringify({summary:'架空の行事連絡です。'})}));
    else {res.statusCode=404;res.end('{}');}
  });
  const available = await new Promise((resolve,reject) => {
    server.once('error', e => e.code === 'EADDRINUSE' ? resolve(false) : reject(e));
    server.listen(11434,'127.0.0.1',() => resolve(true));
  });
  if (!available) { t.skip('127.0.0.1:11434 は別のサービスが使用中'); return; }
  try {
    const prepared=prepareAgentDocument('文化祭は山田が準備します。');
    const gateway=prepared.gateway, params={endpoint:'http://127.0.0.1:11434',model:'fixture:test',revision:gateway.revision,consented:true};
    const assistant=createAgentAssistant(gateway,createAgentLocalTransport(gateway));
    await assert.rejects(assistant.summarize(params));
    assert.equal(received.length,0);
    gateway.approveDocument(gateway.revision);
    assert.equal(await assistant.summarize(params),'架空の行事連絡です。');
    assert.deepEqual(received.map(x=>x.path),['/api/show','/api/generate']);
    assert.ok(JSON.stringify(received).includes('[非公開]'));
    assert.ok(!JSON.stringify(received).includes('山田'));
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
