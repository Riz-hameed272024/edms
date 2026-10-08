'use strict';
// Central error handler (fix for V-07 / DEF-03): never leak stack traces to clients.
const crypto = require('crypto');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  const ref = crypto.randomUUID();
  if (process.env.NODE_ENV !== 'test') {
    process.stderr.write(JSON.stringify({ level: 'error', ref, msg: err.message, stack: err.stack }) + '\n');
  }
  return res.status(500).json({ error: 'Internal error', ref });
};
