import { createEngine, verifyOpening } from './proof.js';
let engine;
self.onmessage = async ({data: {id, action, data}}) => {
  try {
    if (!engine) {
      const response = await fetch('./circuit.json');
      if (!response.ok) throw new Error('証明回路を読み込めませんでした。');
      engine = await createEngine(await response.json());
    }
    let result;
    if (action === 'prove') result = await engine.prove(data.text, data.terms);
    else if (action === 'verify') result = await engine.verify(data.proof, data.expected);
    else if (action === 'opening') result = verifyOpening(data.text, data.opening, data.expected);
    else throw new Error('未対応の操作です。');
    self.postMessage({id, result});
  } catch (error) { self.postMessage({id, error:error.message || '処理に失敗しました。'}); }
};
