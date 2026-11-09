import { createEngine, verifyOpening } from './proof.js';

// Test-only fixture: no real document is requested or transmitted.
window.runExperiment = async () => {
  const circuit = await (await fetch('/circuit.json')).json();
  const input = await (await fetch('/sample-input.json')).json();
  const documentBytes = new Uint8Array(input.document_bytes.slice(0, input.document_length));
  const text = new TextDecoder().decode(documentBytes);
  const terms = input.forbidden.slice(0, input.forbidden_count).map((bytes, i) => new TextDecoder().decode(new Uint8Array(bytes.slice(0, input.forbidden_lengths[i]))));
  const engine = await createEngine(circuit);
  try {
    const {proof, opening} = await engine.prove(text, terms);
    const expected = JSON.parse(JSON.stringify(proof.statement));
    const valid = await engine.verify(proof, expected);
    const openingValid = verifyOpening(text, opening, expected);
    const wrongOpeningRejected = !verifyOpening(text + "x", opening, expected);
    let proofTamperRejected = false;
    const alteredBytes = Uint8Array.from(atob(proof.proof), c => c.charCodeAt(0));
    alteredBytes[alteredBytes.length - 1] ^= 1;
    let alteredBinary = ''; for (const byte of alteredBytes) alteredBinary += String.fromCharCode(byte);
    try { proofTamperRejected = !await engine.verify({...proof, proof: btoa(alteredBinary)}, expected); } catch { proofTamperRejected = true; }
    const mutations = [
      {...expected, documentLength: expected.documentLength + 1},
      {...expected, forbidden: ['鈴木', ...expected.forbidden.slice(1)]},
      {...expected, commitment: (expected.commitment[0] === '0' ? '1' : '0') + expected.commitment.slice(1)},
    ];
    let forgedStatementsRejected = true;
    for (const statement of mutations) {
      try { if (await engine.verify({...proof, statement}, statement)) forgedStatementsRejected = false; }
      catch { /* A rejected verification is also a rejection. */ }
    }
    const nulAliasRejected = !verifyOpening(text + '\u0000', {...opening, documentLength: opening.documentLength + 1}, expected);
    let tamperedRejected = false;
    try { await engine.verify(proof, {...expected, documentLength: expected.documentLength + 1}); } catch { tamperedRejected = true; }
    let badWitnessRejected = false;
    try { await engine.prove(terms[0] + text, terms); } catch { badWitnessRejected = true; }
    let malformedDocumentRejected = false, malformedTermRejected = false, malformedExpectedRejected = false, malformedOpeningRejected = false;
    try { await engine.prove('\ud800',terms); } catch { malformedDocumentRejected = true; }
    try { await engine.prove(text,['\udc00']); } catch { malformedTermRejected = true; }
    try { await engine.verify(proof,{...expected,forbidden:['\ud800']}); } catch { malformedExpectedRejected = true; }
    try { verifyOpening('\ud800',opening,expected); } catch { malformedOpeningRejected = true; }
    return {valid, openingValid, wrongOpeningRejected, proofTamperRejected, forgedStatementsRejected, nulAliasRejected, tamperedRejected, badWitnessRejected, malformedDocumentRejected, malformedTermRejected, malformedExpectedRejected, malformedOpeningRejected, crossOriginIsolated: self.crossOriginIsolated};
  } finally { await engine.destroy(); }
};
