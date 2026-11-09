import { readFile } from 'node:fs/promises';
import { prepareAgentDocument } from '../src/agent-document.js';
import { pathToFileURL } from 'node:url';

export function evaluateMasking(input){
const rows=input.cases.map(item=>{
  const output=prepareAgentDocument(item.text,item.hiddenWords||'').preview;
  const passed=item.unchanged?output===item.text:!output.includes(item.secret);
  return {id:item.id,category:item.category,type:item.unchanged?'unchanged-control':item.hiddenWords?'user-specified':'sensitive-substring',passed};
});
const positive=rows.filter(row=>row.type==='sensitive-substring'),specified=rows.filter(row=>row.type==='user-specified'),controls=rows.filter(row=>row.type==='unchanged-control');
return {format:'sumi-synthetic-masking-evaluation',version:1,description:input.description,measurement:'指定文字列が加工後にそのまま残るか、対照文が変化しないかを数えます。部分情報や推測可能性は測定しません。',sensitive:{passed:positive.filter(row=>row.passed).length,total:positive.length},specified:{passed:specified.filter(row=>row.passed).length,total:specified.length},controls:{unchanged:controls.filter(row=>row.passed).length,total:controls.length},cases:rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const input=JSON.parse(await readFile(new URL('../evaluation/masking-cases.json',import.meta.url),'utf8'));
  process.stdout.write(JSON.stringify(evaluateMasking(input),null,2)+'\n');
}
