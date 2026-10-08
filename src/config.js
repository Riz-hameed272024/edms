'use strict';
// Configuration comes ONLY from environment variables (SR-14). No secrets in source.
const crypto = require('crypto');

const env = process.env.NODE_ENV || 'development';

function loadKeys() {
  const priv = process.env.JWT_PRIVATE_KEY;
  const pub = process.env.JWT_PUBLIC_KEY;
  if (priv && pub) {
    return { privateKey: priv.replace(/\\n/g, '\n'), publicKey: pub.replace(/\\n/g, '\n') };
  }
  if (env === 'production') {
    throw new Error('JWT_PRIVATE_KEY / JWT_PUBLIC_KEY must be provided in production');
  }
  // Development/test only: ephemeral key pair, never written to disk.
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

function loadHmacKey() {
  if (process.env.AUDIT_HMAC_KEY) return process.env.AUDIT_HMAC_KEY;
  if (env === 'production') throw new Error('AUDIT_HMAC_KEY must be provided in production');
  return crypto.randomBytes(32).toString('hex');
}

module.exports = Object.freeze({
  env,
  port: Number(process.env.PORT) || 8080,
  jwt: { ...loadKeys(), algorithm: 'RS256', expiresIn: '15m', issuer: 'edms' },
  hmacKey: loadHmacKey(),
  lockout: { maxFailures: 5, lockMinutes: 15 },
  reportLimit: { windowMs: 60 * 60 * 1000, max: Number(process.env.REPORT_LIMIT_MAX) || 5 },
});
