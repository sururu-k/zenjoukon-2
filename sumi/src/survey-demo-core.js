import { createSurveyBallot, createSurveyCollector, combineSurveyTotals } from './secure/survey.js';

// Single-process simulation only: both share sets exist on this device.
// Separate, independent collectors are required for the MPC privacy premise.
export function createSurveyDemo(){
  const collectorA=createSurveyCollector('A','sumi-survey-demo'),collectorB=createSurveyCollector('B','sumi-survey-demo');let phase='open',count=0;
  return Object.freeze({
    get count(){return count;},get phase(){return phase;},
    submit(answer){
      if(phase!=='open')throw new Error('集計を確定したため回答できません。');
      if(typeof answer!=='boolean'||count>=100)throw new Error('回答を確認してください。');
      const shares=createSurveyBallot(answer,'sumi-survey-demo');
      collectorA.receive(shares.A);collectorB.receive(shares.B);count++;
      return count;
    },
    async publish(){
      if(phase!=='open')throw new Error('この集計は既に確定しています。');
      if(count<3)throw new Error('３件以上の回答が必要です。');
      phase='closing';
      try{
        const a=await collectorA.publish(),b=await collectorB.publish();
        const result=combineSurveyTotals(a,b);
        phase='published';return result;
      }catch(error){phase='closed';throw error;}
    }
  });
}
