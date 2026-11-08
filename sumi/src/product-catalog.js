export const PRODUCTS=Object.freeze([
  Object.freeze({id:'write',name:'Sumi Write',entry:'writer.html',role:'document authoring',privateBoundary:'private memo excluded from template and AI request'}),
  Object.freeze({id:'gate',name:'Sumi Gate',entry:'gate.html',role:'document release review',privateBoundary:'reviewed revision and selected destination required for plaintext export'}),
  Object.freeze({id:'prove',name:'Sumi Prove',entry:'proof-studio.html',role:'AI-assisted committed-sum proof planning',privateBoundary:'numeric witness excluded from AI request; one supported proof protocol'})
]);
