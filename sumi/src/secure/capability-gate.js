import { canonical } from '../crypto.js';
import { signQuorum, verifyQuorum } from './signature-quorum.js';

// A signed order defines the maximum authority. Agent text is never used to
// increase it. This in-memory gate is a prototype, not a robot safety system.
const own = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const token = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const invalid = () => { throw new Error('注文、実行内容または信頼設定が不正です。'); };
const bytes = order => new TextEncoder().encode('sumi/capability-order/v1\n' + canonical(order));
function snapshot(input) {
  const o = structuredClone(input);
  if (!own(o, ['format','version','orderId','gateId','action','resource','maxQuantity','expiresAt']) || o.format !== 'sumi-capability-order' || o.version !== 1 || ![o.orderId,o.gateId,o.action,o.resource].every(token) || !Number.isSafeInteger(o.maxQuantity) || o.maxQuantity < 1 || o.maxQuantity > 1000 || !Number.isSafeInteger(o.expiresAt) || o.expiresAt < 0) invalid();
  return o;
}
export async function signCapabilityOrder(input, keys) {
  const order = snapshot(input);
  return {format:'sumi-signed-capability-order', version:1, order, signatures:await signQuorum(bytes(order), keys)};
}
export function createCapabilityGate({gateId, trust, execute, now = Date.now}) {
  const anchors = structuredClone(trust);
  if (!token(gateId) || !own(anchors,['format','version','threshold','publicKeys']) || anchors.format !== 'sumi-capability-order-trust' || anchors.version !== 1 || typeof execute !== 'function' || typeof now !== 'function') invalid();
  const consumed = new Set();
  return Object.freeze({
    async run(inputOrder, inputAction) {
      const signed = structuredClone(inputOrder), action = structuredClone(inputAction);
      if (!own(signed,['format','version','order','signatures']) || signed.format !== 'sumi-signed-capability-order' || signed.version !== 1 || !own(action,['action','resource','quantity']) || !token(action.action) || !token(action.resource) || !Number.isSafeInteger(action.quantity) || action.quantity < 1) invalid();
      const order = snapshot(signed.order);
      await verifyQuorum(bytes(order), signed.signatures, anchors);
      const time = now();
      if (!Number.isSafeInteger(time) || time < 0 || time >= order.expiresAt || order.gateId !== gateId || order.action !== action.action || order.resource !== action.resource || action.quantity > order.maxQuantity || consumed.has(order.orderId)) invalid();
      // Reserve synchronously before the callback, including on failure. This
      // prevents concurrent replay but requires durable storage in production.
      consumed.add(order.orderId);
      return execute(Object.freeze(action), Object.freeze(order));
    }
  });
}
