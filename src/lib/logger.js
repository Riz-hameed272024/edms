'use strict';
// Structured JSON security logger. Sensitive fields are redacted before writing (SR-07, SR-10).
const REDACT = new Set(['password', 'totp', 'otp', 'token', 'location', 'lat', 'lon', 'authorization', 'mfasecret']);

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT.has(k.toLowerCase()) ? '[REDACTED]' : (v && typeof v === 'object' ? redact(v) : v);
  }
  return out;
}

const counters = {};
function securityEvent(event, details = {}) {
  counters[event] = (counters[event] || 0) + 1;
  if (process.env.NODE_ENV === 'test') return;
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: 'security', event, ...redact(details) }) + '\n');
}

function metricsText() {
  return Object.entries(counters)
    .map(([k, v]) => `edms_security_events_total{event="${k}"} ${v}`)
    .join('\n') + '\n';
}

module.exports = { securityEvent, redact, metricsText, counters };
