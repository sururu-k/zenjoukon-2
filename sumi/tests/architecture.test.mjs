import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_PANEL_IDS } from '../src/ai-panel.js';

test('画面から保存・コピー・ネットワークの直接I/Oを呼び出さない',()=>{
  for(const file of ['app.js','privacy-lab.js','writer.js','proof-studio.js']){
    const app=readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
    for(const pattern of [/\bfetch\s*\(/,/navigator\.clipboard/,/URL\.createObjectURL/,/new Blob\b/,/\.download\s*=/])assert.doesNotMatch(app,pattern);
    assert.match(app,/createBrowserWorkspace/);
  }
});
test('画面が参照する固定IDが存在し、HTMLのIDに重複がない',()=>{
  for(const [h,j] of [['gate.html','app.js'],['privacy-lab.html','privacy-lab.js'],['writer.html','writer.js'],['proof-studio.html','proof-studio.js']]){
    const html=readFileSync(new URL(`../src/${h}`,import.meta.url),'utf8'),app=readFileSync(new URL(`../src/${j}`,import.meta.url),'utf8');
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
    for(const [,id] of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),`固定IDがありません: ${id}`);
    if(['writer.html','proof-studio.html'].includes(h))for(const id of AI_PANEL_IDS)assert.ok(ids.includes(id),`共通AI設定IDがありません: ${id}`);
  }
});
