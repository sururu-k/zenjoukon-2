import { splitContribution, aggregateParty, combinePartyTotals } from './mpc.js';

const LIMIT=100,MINIMUM=3,P=(1n<<61n)-1n;
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(value);

// A ballot has two independently routed shares. This does not establish who
// submitted it or prove that an untrusted sender encoded a valid 0/1 answer.
export function createSurveyBallot(answer,campaign){
  if(typeof answer!=='boolean')throw new Error('回答を選んでください。');
  return splitContribution([answer?1:0],campaign);
}

// A collector is given only one party's shares by its caller. Isolation,
// secure transport, authenticated voters and durable one-time publication
// must be provided by the surrounding deployment.
export function createSurveyCollector(party,campaign){
  if(!['A','B'].includes(party)||!validId(campaign))throw new Error('集計担当または集計IDが不正です。');
  const packets=[],batches=new Set();let phase='open',received=0;
  return Object.freeze({
    get count(){return received;},get phase(){return phase;},
    receive(input){
      if(phase!=='open')throw new Error('集計は確定しています。');
      if(!input||typeof input!=='object')throw new Error('回答シェアの形式が不正です。');
      const {protocol,campaign:receivedCampaign,batch,party:receivedParty,count,share}=input;
      if(protocol!=='sumi-mpc-sum-v1'||receivedCampaign!==campaign||receivedParty!==party||!validId(batch)||batches.has(batch)||count!==1||typeof share!=='string'||!/^\d{1,19}$/.test(share)||BigInt(share)>=P||packets.length>=LIMIT)throw new Error('回答シェアの形式・担当・集計IDが不正か、重複しています。');
      packets.push(Object.freeze({protocol,campaign:receivedCampaign,batch,party:receivedParty,count,share}));batches.add(batch);received++;
      return received;
    },
    async publish(){
      if(phase!=='open')throw new Error('集計は確定しています。');
      if(packets.length<MINIMUM)throw new Error('３件以上の回答が必要です。');
      phase='closing';
      try{const total=await aggregateParty(packets,party);packets.length=0;phase='published';return Object.freeze(total);}
      catch(error){phase='closed';throw error;}
    }
  });
}

export function combineSurveyTotals(a,b){
  const result=combinePartyTotals(a,b);
  if(result.contributors<MINIMUM||result.count!==result.contributors||result.sum>result.count)throw new Error('回答数または合計がアンケートの条件を満たしません。');
  return Object.freeze({count:result.count,yes:result.sum,no:result.count-result.sum});
}
