import { parse } from 'acorn';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DIRECT=new Set(['fetch','XMLHttpRequest','WebSocket','WebTransport','EventSource','Worker','SharedWorker','BroadcastChannel','postMessage','sendBeacon','localStorage','sessionStorage','indexedDB','caches']);
const DANGEROUS_MEMBERS=new Set([...DIRECT,'innerHTML','outerHTML','srcdoc','cookie','insertAdjacentHTML','write','writeln','execCommand','setAttributeNS']);
const NATIVE_MEMBERS=new Set(['clipboard','createObjectURL','revokeObjectURL','href','download']);
const NETWORK_ATTRIBUTES=new Set(['src','href','srcdoc','action','formaction','ping','data','poster','srcset','http-equiv']);
const IMPORTS=new Set(['node-seal','@noble/curves/ed25519.js']);
function constant(node){if(node?.type==='Literal')return node.value;if(node?.type==='BinaryExpression'&&node.operator==='+'){const a=constant(node.left),b=constant(node.right);if(typeof a==='string'&&typeof b==='string')return a+b;}return undefined;}
function member(node){return node?.computed?constant(node.property):node?.property?.name;}

// Regression guardrails over every first-party JS file. This is deliberately
// reported as syntax checking, not as a sound JS information-flow proof.
export function inspectSource(source,file){
  const ast=parse(source,{sourceType:'module',ecmaVersion:'latest',locations:true}),issues=[],native=file==='browser-effects.js';
  const fail=(node,rule)=>issues.push({file,line:node.loc.start.line,rule});
  function walk(node,parent,ancestors=[]){
    if(!node||typeof node!=='object')return;
    if(node.type==='Identifier'){
      const property=parent?.type==='Property'&&parent.key===node&&!parent.computed&&!parent.shorthand||parent?.type==='MemberExpression'&&parent.property===node&&!parent.computed;
      if(!property&&DIRECT.has(node.name)&&!native)fail(node,'direct-egress-api');
      if(!property&&['eval','Function'].includes(node.name))fail(node,'dynamic-code');
      if(!property&&['globalThis','self','top','parent','opener','frames','navigator'].includes(node.name)&&!native)fail(node,'ambient-global');
      if(!property&&node.name==='window'&&!(parent?.type==='UnaryExpression'&&parent.operator==='typeof')&&!(parent?.type==='MemberExpression'&&parent.object===node&&member(parent)==='scrollTo'))fail(node,'ambient-window');
      if(!property&&node.name==='document'&&parent?.type!=='MemberExpression')fail(node,'document-alias');
    }
    if(node.type==='ImportExpression')fail(node,'dynamic-import');
    if(node.type==='ImportDeclaration'){const name=node.source.value;if(!name.startsWith('./')&&!name.startsWith('../')&&!IMPORTS.has(name))fail(node,'unregistered-dependency');}
    if(node.type==='MemberExpression'){
      const name=member(node);
      if(DANGEROUS_MEMBERS.has(name)&&(!native||!DIRECT.has(name)))fail(node,'dangerous-member');
      if(NATIVE_MEMBERS.has(name)&&!native){
        // URL reads in the public WASM loader are the only non-I/O href access.
        const publicAssetURL=file==='secure/fhe.js'&&name==='href'&&node.object.type==='NewExpression'&&node.object.callee.name==='URL';
        const guardedAdapter=file==='workspace.js'&&node.object.type==='Identifier'&&node.object.name==='adapters'&&['copy','download'].includes(name)&&ancestors.some(n=>n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.callee.name==='dispatchEgress');
        if(!publicAssetURL&&!guardedAdapter)fail(node,'native-effect-outside-adapter');
      }
    }
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&member(node.callee)==='setAttribute'){
      const attr=constant(node.arguments[0]);if(typeof attr!=='string'||NETWORK_ATTRIBUTES.has(attr.toLowerCase()))fail(node,'active-dom-attribute');
    }
    const next=[...ancestors,node];
    for(const [key,value] of Object.entries(node)){if(['loc','start','end'].includes(key))continue;if(Array.isArray(value))for(const child of value)walk(child,node,next);else if(value&&typeof value==='object')walk(value,node,next);}
  }
  walk(ast,null);return issues;
}
async function list(dir,prefix=''){const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const name=prefix+item.name;if(item.isDirectory())out.push(...await list(new URL(item.name+'/',dir),name+'/'));else if(item.name.endsWith('.js'))out.push(name);}return out;}
export function inspectMarkup(source,file){
  const issues=[],fail=rule=>issues.push({file,rule});
  if(/\son\w+\s*=/i.test(source))fail('inline-event-handler');
  for(const tag of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){if(tag[2].trim()||!/^\s*(?:type="module"\s+)?src="\.\/[a-zA-Z0-9_/-]+\.js"\s*$/.test(tag[1]))fail('unregistered-script');}
  const csp=source.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
  if(!csp){fail('missing-csp');return issues;}
  const directives=Object.fromEntries(csp.split(';').map(s=>s.trim().split(/\s+/)).filter(a=>a[0]).map(([key,...value])=>[key,value.join(' ')]));
  const expected={"object-src":"'none'","base-uri":"'self'","form-action":"'none'"};
  for(const [key,value] of Object.entries(expected))if(directives[key]!==value)fail('csp-'+key);
  const scripts=file==='privacy-lab.html'?"'self' 'wasm-unsafe-eval'":file==='assurance.html'?"'none'":"'self'";
  if(directives['script-src']!==scripts)fail('csp-script-src');
  const connections=file==='index.html'?"http://127.0.0.1:* http://localhost:* http://[::1]:* https://127.0.0.1:* https://localhost:* https://[::1]:*":file==='privacy-lab.html'?"'self'":"'none'";
  if(directives['connect-src']!==connections)fail('csp-connect-src');
  return issues;
}
export async function checkEgress(){
  const root=new URL('../src/',import.meta.url),files=await list(root),issues=[],hashes={};
  for(const file of files.sort()){const source=await readFile(new URL(file,root),'utf8');issues.push(...inspectSource(source,file));hashes[file]=createHash('sha256').update(source).digest('hex');}
  for(const file of ['index.html','privacy-lab.html','assurance.html']){const source=await readFile(new URL(file,root),'utf8');issues.push(...inspectMarkup(source,file));hashes[file]=createHash('sha256').update(source).digest('hex');}
  if(issues.length)throw new Error('出力経路の構文検査に失敗しました：'+JSON.stringify(issues));
  console.log(`出力経路の構文検査: ${files.length} JS + 3 HTML。未登録の既知I/Oなし。`);
  return {kind:'first-party-ast-guardrails',soundInformationFlowAnalysis:false,files:hashes,exceptions:[{file:'browser-effects.js',purpose:'clipboard, download, authorized loopback fetch'},{file:'secure/fhe.js',purpose:'same-origin static WASM loader via node-seal'}]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkEgress();
