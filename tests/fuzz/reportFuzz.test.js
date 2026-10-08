jest.setTimeout(60000);
// Simple mutation/boundary fuzzing of the public input boundary POST /api/incidents (Phase 14).
// Deterministic PRNG so the run is reproducible. Writes observations to tests/fuzz/fuzz-report.json.
process.env.REPORT_LIMIT_MAX = '100000';
const fs = require('fs');
const path = require('path');
const { setup, request } = require('../helpers');

let seed = 24401;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a.at(Math.floor(rnd() * a.length));

const STRINGS = ['', ' ', 'a', 'x'.repeat(4), 'x'.repeat(5), 'x'.repeat(500), 'x'.repeat(501), 'x'.repeat(10000),
  "' OR 1=1 --", '<script>alert(1)</script>', '\u0000\u0001\u0002', '😀'.repeat(300), '../../etc/passwd', '{{7*7}}', '%00', null, 12345, true, [], {}];
const NUMS = [0, -1, 1, 12.97, -90, 90, -90.0001, 90.0001, 180, -180, 180.5, 1e308, -1e308, NaN, 'abc', null, '12.9', [], {}];
const TYPES = ['FLOOD', 'FIRE', 'flood', 'NUKE', '', null, 1, ['FLOOD'], 'FLOOD\u0000'];

function mutated() {
  return {
    type: pick(TYPES),
    description: pick(STRINGS),
    location: rnd() < 0.15 ? pick(STRINGS) : { lat: pick(NUMS), lon: pick(NUMS) },
    peopleAffected: pick([1, 0, -5, 10000, 10001, 2.5, 'ten', null]),
    phone: pick(['+919876543210', '123', '+91987654321012345', "'; DROP TABLE users;--", null]),
    otp: pick(['123456', '12345', 'abcdef', '', null, 123456]),
    [pick(['priority', 'status', '__proto__', 'role'])]: pick(['P1', 'VERIFIED', { admin: true }, 'ADMIN']),
  };
}

test('fuzzing POST /api/incidents: no 5xx, no stack traces, invalid input rejected', async () => {
  const ctx = await setup();
  const N = 600;
  const statusCounts = {};
  const failures = [];
  for (let i = 0; i < N; i += 1) {
    const body = mutated();
    const raw = i % 50 === 0;
    const res = raw
      ? await request(ctx.app).post('/api/incidents').set('Content-Type', 'application/json').send('{"type": "FLOOD", "description": ')
      : await request(ctx.app).post('/api/incidents').send(body);
    statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
    const text = JSON.stringify(res.body);
    if (res.status >= 500 || /at .*\.js:\d+/.test(text) || /Error:/.test(text)) failures.push({ i, status: res.status, body: text.slice(0, 200) });
  }
  // oversize payload (> 10 kb) boundary
  const big = await request(ctx.app).post('/api/incidents').send({ description: 'x'.repeat(20000) });
  statusCounts[`oversize_${big.status}`] = 1;

  const report = { target: 'POST /api/incidents', cases: N + 1, seed: 24401, statusCounts, failures, ranAt: new Date().toISOString() };
  fs.writeFileSync(path.join(__dirname, 'fuzz-report.json'), JSON.stringify(report, null, 2));
  expect(failures).toEqual([]);
  expect(big.status).toBe(413);
  expect(statusCounts['201'] || 0).toBe(0); // none of the mutated inputs had a valid OTP, so nothing is accepted
});
