import { makeSigningKey } from '../src/crypto.js';
import { startCollector } from '../survey-live/server.mjs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';

// The private signing key is generated and kept inside this process.
const [party, campaign] = process.argv.slice(2);
if (!process.send || !['A', 'B'].includes(party)) throw new Error('Invalid worker invocation');
const key = await makeSigningKey();
const publishToken = randomBytes(32).toString('hex');
// A private temporary directory is removed immediately after the TLS server
// reads its short-lived key. This certificate is pinned over parent-child IPC.
const directory = await mkdtemp(join(tmpdir(), 'sumi-survey-tls-'));
let server, certificate;
try {
  const config = join(directory, 'openssl.cnf');
  const certPath = join(directory, 'cert.pem'), keyPath = join(directory, 'key.pem');
  await writeFile(config, '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\n', { mode: 0o600 });
  await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-keyout', keyPath, '-out', certPath, '-config', config], { timeout: 10000 });
  certificate = await readFile(certPath, 'utf8');
  server = await startCollector(party, 0, { campaign, signingKeys: [key], exposeHeld: false, publishToken, tls: { cert: certificate, key: await readFile(keyPath), minVersion: 'TLSv1.2' } });
} finally {
  await rm(directory, { recursive: true, force: true });
}
process.send({ party, pid: process.pid, port: server.address().port, publicKey: await crypto.subtle.exportKey('jwk', key.publicKey), certificate, publishToken });
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close(() => process.exit(0));
}
process.on('message', message => { if (message?.type === 'shutdown') close(); });
process.on('disconnect', close);
