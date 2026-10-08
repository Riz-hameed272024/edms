'use strict';
// Append-only, hash-chained audit log (SR-10, mitigates T-10 / V-08).
const crypto = require('crypto');
const config = require('../config');

const chain = [];
const GENESIS = '0'.repeat(64);

function hashRecord(rec) {
  const body = JSON.stringify({ seq: rec.seq, ts: rec.ts, actor: rec.actor, action: rec.action, entity: rec.entity, data: rec.data, prevHash: rec.prevHash });
  return crypto.createHmac('sha256', config.hmacKey).update(body).digest('hex');
}

function record(actor, action, entity, data = {}) {
  const prevHash = chain.length ? chain.at(-1).hash : GENESIS;
  const rec = { seq: chain.length + 1, ts: new Date().toISOString(), actor: actor || 'anonymous', action, entity, data, prevHash };
  rec.hash = hashRecord(rec);
  chain.push(Object.freeze(rec));
  return rec;
}

function verify() {
  let prev = GENESIS;
  for (const rec of chain) {
    if (rec.prevHash !== prev || hashRecord(rec) !== rec.hash) return { valid: false, brokenAt: rec.seq };
    prev = rec.hash;
  }
  return { valid: true, length: chain.length };
}

function list({ action } = {}) {
  return action ? chain.filter((r) => r.action === action) : [...chain];
}

function _reset() { chain.length = 0; }
function _tamperForTest(seq, field, value) { chain[seq - 1] = { ...chain[seq - 1], [field]: value }; }

module.exports = { record, verify, list, _reset, _tamperForTest };
