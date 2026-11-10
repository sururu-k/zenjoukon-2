import { makeSigningKey } from '../src/crypto.js';
import { startCollector } from '../survey-live/server.mjs';

// The private signing key is generated and kept inside this process.
const [party, campaign] = process.argv.slice(2);
if (!process.send || !['A', 'B'].includes(party)) throw new Error('Invalid worker invocation');
const key = await makeSigningKey();
const server = await startCollector(party, 0, { campaign, signingKeys: [key], exposeHeld: false });
process.send({ party, pid: process.pid, port: server.address().port, publicKey: await crypto.subtle.exportKey('jwk', key.publicKey) });
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close(() => process.exit(0));
}
process.on('message', message => { if (message?.type === 'shutdown') close(); });
process.on('disconnect', close);
