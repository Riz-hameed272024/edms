'use strict';
const request = require('supertest');
const { authenticator } = require('otplib');
const { createApp } = require('../src/app');
const store = require('../src/lib/store');
const audit = require('../src/services/auditService');
const authService = require('../src/services/authService');

const PW = 'Str0ng!Passw0rd#2026';

async function setup() {
  store.reset();
  audit._reset();
  const app = createApp();
  const users = {};
  for (const [username, role] of [['admin1', 'ADMIN'], ['admin2', 'ADMIN'], ['coord1', 'COORDINATOR'], ['coord2', 'COORDINATOR'], ['rescue1', 'RESCUE'], ['vol1', 'VOLUNTEER']]) {
    users[username] = await authService.createUser({ username, password: PW, role });
  }
  const login = async (username) => {
    const u = users[username];
    const body = { username, password: PW };
    if (u.mfaSecret) body.totp = authenticator.generate(u.mfaSecret);
    const res = await request(app).post('/api/auth/login').send(body);
    return res.body.token;
  };
  return { app, users, login, PW };
}

async function reportIncident(app, overrides = {}) {
  const phone = overrides.phone || '+919876543210';
  const otp = (await request(app).post('/api/otp/request').send({ phone })).body.devCode;
  return request(app).post('/api/incidents').send({
    type: 'FLOOD', description: 'Water entering houses on 3rd street', location: { lat: 12.9791, lon: 80.2209 },
    peopleAffected: 12, phone, otp, ...overrides,
  });
}

module.exports = { setup, reportIncident, request };
