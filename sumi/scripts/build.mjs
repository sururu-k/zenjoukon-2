import { mkdir, cp, readFile, stat } from 'node:fs/promises';
import { build } from 'esbuild';
import { checkFormal } from './check-formal.mjs';
import { checkEgress } from './check-egress.mjs';
import { writeAssurance } from './write-assurance.mjs';
import { HTML_PROFILES } from './check-egress.mjs';
const formal=checkFormal();
const egress=await checkEgress();
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await cp(new URL('../src/', import.meta.url), new URL('../dist/', import.meta.url), { recursive: true });
// Keep the same verified visualization available locally and on Pages.
await import('./check-lean-visualization.mjs');
await cp(new URL('../visualization/lean/', import.meta.url), new URL('../dist/lean/', import.meta.url), { recursive: true });
await build({entryPoints:['privacy-lab.js','proof-studio.js'].map(name=>new URL('../src/'+name,import.meta.url).pathname),bundle:true,format:'esm',platform:'browser',target:'es2022',outdir:new URL('../dist/',import.meta.url).pathname,external:['module','node:module','node:fs','node:fs/promises','node:url','node:path','node:crypto']});
const css=await build({entryPoints:[new URL('../src/suite.css',import.meta.url).pathname],outfile:new URL('../dist/suite.css',import.meta.url).pathname});
if(css.warnings.length)throw new Error('製品画面のCSSに構文の警告があります。');
await cp(new URL('../node_modules/node-seal/dist/seal_throws.wasm',import.meta.url),new URL('../dist/seal_throws.wasm',import.meta.url));
await mkdir(new URL('../dist/licenses/',import.meta.url),{recursive:true});
for(const name of ['node-seal','@noble/curves','@noble/hashes'])await cp(new URL(`../node_modules/${name}/LICENSE`,import.meta.url),new URL(`../dist/licenses/${name.replaceAll('/','-')}.txt`,import.meta.url));
await writeAssurance(formal,egress);
const outputRoot=new URL('../dist/',import.meta.url);
for(const file of Object.keys(HTML_PROFILES)){
  const html=await readFile(new URL(file,outputRoot),'utf8');
  for(const [,path] of html.matchAll(/(?:href|src)="(\.\/[^"#]*)"/g)){
    const target=new URL(path,outputRoot);if(!target.href.startsWith(outputRoot.href))throw new Error(`配置先の外を参照しています：${file} ${path}`);
    const info=await stat(target);if(info.isDirectory())await stat(new URL('index.html',target));
  }
}
console.log('Built Sumi → dist/');
