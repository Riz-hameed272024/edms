'use strict';
const express = require('express');
const helmet = require('helmet');
const api = require('./routes/api');
const errorHandler = require('./middleware/errorHandler');
const { metricsText } = require('./lib/logger');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // DEF-04 fix: only trust X-Forwarded-For from the number of proxies we actually run (ingress = 1).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
  app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true } }));
  app.use(express.json({ limit: '10kb' }));
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', (req, res) => res.json({ status: 'ready' }));
  app.get('/metrics', (req, res) => res.type('text/plain').send(metricsText()));
  app.use('/api', api);
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
