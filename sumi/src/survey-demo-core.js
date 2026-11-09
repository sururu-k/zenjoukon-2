import { splitContribution, aggregateParty, combinePartyTotals } from './secure/mpc.js';

// Single-process simulation only: both share sets exist on this device.
// Separate, independent collectors are required for the MPC privacy premise.
export function createSurveyDemo(){
  const sharesA=[],sharesB=[];let phase='open',count=0;
  return Object.freeze({
    get count(){return count;},get phase(){return phase;},
    submit(answer){
      if(phase!=='open')throw new Error('集計を確定したため回答できません。');
      if(typeof answer!=='boolean'||count>=100)throw new Error('回答を確認してください。');
      const shares=splitContribution([answer?1:0],'sumi-survey-demo');
      sharesA.push(shares.A);sharesB.push(shares.B);count++;
      return count;
    },
    async publish(){
      if(phase!=='open')throw new Error('この集計は既に確定しています。');
      if(count<3)throw new Error('３件以上の回答が必要です。');
      phase='closing';
      try{
        const a=await aggregateParty(sharesA,'A'),b=await aggregateParty(sharesB,'B');
        const total=combinePartyTotals(a,b);
        const result=Object.freeze({count:total.count,yes:total.sum,no:total.count-total.sum});
        sharesA.length=0;sharesB.length=0;phase='published';return result;
      }catch(error){phase='closed';throw error;}
    }
  });
}
