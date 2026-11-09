import { createSurveyDemo } from './survey-demo-core.js';
const $=id=>document.getElementById(id);
let survey=createSurveyDemo();
const status=message=>{$('survey-status').textContent=message;};
function update(){
  $('answer-count').textContent=`受け付けた回答 ${survey.count}件`;
  $('publish-result').disabled=survey.phase!=='open'||survey.count<3;
  for(const id of ['answer-yes','answer-no','load-sample'])$(id).disabled=survey.phase!=='open';
  $('sample-note').hidden=survey.count!==0;
}
function submit(answer){try{survey.submit(answer);status('回答を受け付けました。この画面には回答内容を残しません。');update();}catch(error){status(error.message);}}
$('answer-yes').addEventListener('click',()=>submit(true));
$('answer-no').addEventListener('click',()=>submit(false));
$('load-sample').addEventListener('click',()=>{
  if(survey.count!==0){status('架空の回答は、回答がまだないときに追加できます。');return;}
  for(const answer of [true,false,true])survey.submit(answer);
  status('３件の架空の回答を追加しました。');update();
});
$('show-organizer').addEventListener('click',()=>{$('answer-view').hidden=true;$('organizer-view').hidden=false;status('集計を確定すると、追加の回答は受け付けません。');});
$('show-answer').addEventListener('click',()=>{$('organizer-view').hidden=true;$('answer-view').hidden=false;status(survey.phase==='open'?'回答する画面です。':'集計は確定しています。');});
$('publish-result').addEventListener('click',async()=>{
  $('publish-result').disabled=true;
  try{
    const result=await survey.publish();
    $('result-count').textContent=`${result.count}件の回答`;
    $('yes-count').textContent=`${result.yes}件`;$('no-count').textContent=`${result.no}件`;
    $('yes-bar').style.width=`${result.yes/result.count*100}%`;
    $('no-bar').style.width=`${result.no/result.count*100}%`;
    $('results').hidden=false;status('集計を確定しました。以後の回答はできません。');
  }catch(error){status(error.message);}finally{update();}
});
$('new-demo').addEventListener('click',()=>{survey=createSurveyDemo();$('results').hidden=true;update();status('新しい架空デモを始めます。');});
update();
