import { Noir } from '@noir-lang/noir_js';
import { Barretenberg, BackendType, UltraHonkBackend } from '@aztec-foundation/bb.js';

// Test-only fixture: no real document is requested or transmitted.
window.runExperiment = async () => {
  const circuit = await (await fetch('/circuit.json')).json();
  const input = await (await fetch('/sample-input.json')).json();
  const noir = new Noir(circuit);
  const { witness } = await noir.execute(input);
  const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });
  try {
    const backend = new UltraHonkBackend(circuit.bytecode, api);
    const options = { verifierTarget: 'noir-recursive' };
    const proof = await backend.generateProof(witness, options);
    const valid = await backend.verifyProof(proof, options);
    const altered = { ...proof, publicInputs: [...proof.publicInputs] };
    altered.publicInputs[0] = '0x' + (BigInt(altered.publicInputs[0]) + 1n).toString(16).padStart(64, '0');
    const tamperedRejected = !await backend.verifyProof(altered, options);
    const badInput = await (await fetch('/bad-input.json')).json();
    let badWitnessRejected = false;
    try { await noir.execute(badInput); } catch { badWitnessRejected = true; }
    return { valid, tamperedRejected, badWitnessRejected, crossOriginIsolated: self.crossOriginIsolated };
  } finally { await api.destroy(); }
};
