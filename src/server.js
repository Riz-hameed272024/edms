'use strict';
const config = require('./config');
const { createApp } = require('./app');
const seed = require('./seed');

seed().then(() => {
  createApp().listen(config.port, () => {
    process.stdout.write(JSON.stringify({ level: 'info', msg: `EDMS API listening on ${config.port}`, env: config.env }) + '\n');
  });
});
