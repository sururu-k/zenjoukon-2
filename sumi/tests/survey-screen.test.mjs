import test from 'node:test';
import assert from 'node:assert/strict';

test('回答画面から集計画面に移り、架空の３件を確定する',async()=>{
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',style:{},handlers:{},addEventListener(type,callback){this.handlers[type]=callback;},async click(){if(!this.disabled)await this.handlers.click?.();}});return elements.get(id);};
  globalThis.document={getElementById:get};
  try{
    await import('../src/survey-demo.js');
    assert.equal(get('publish-result').disabled,true);
    await get('load-sample').click();assert.match(get('answer-count').textContent,/3件/);
    await get('show-organizer').click();assert.equal(get('answer-view').hidden,true);assert.equal(get('organizer-view').hidden,false);
    assert.equal(get('publish-result').disabled,false);await get('publish-result').click();
    assert.equal(get('results').hidden,false);assert.equal(get('yes-count').textContent,'2件');assert.equal(get('no-count').textContent,'1件');
    assert.equal(get('answer-yes').disabled,true);assert.equal(get('publish-result').disabled,true);
  }finally{delete globalThis.document;}
});
