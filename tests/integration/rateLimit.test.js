// Integration: report flooding is throttled (SR-06, T-01/T-02, V-03)
const { setup, request } = require('../helpers');

test('6th OTP/report request from one client within an hour gets 429', async () => {
  const ctx = await setup();
  const codes = [];
  for (let i = 0; i < 6; i += 1) {
    codes.push((await request(ctx.app).post('/api/otp/request').send({ phone: `+91900000001${i}` })).status);
  }
  expect(codes.slice(0, 5).every((c) => c === 202)).toBe(true);
  expect(codes[5]).toBe(429);
});

test('spoofed X-Forwarded-For does not reset the limit (DEF-04 retest)', async () => {
  const ctx = await setup();
  let last;
  for (let i = 0; i < 6; i += 1) {
    last = await request(ctx.app).post('/api/otp/request').set('X-Forwarded-For', `10.0.0.${i}`).send({ phone: `+91910000001${i}` });
  }
  expect(last.status).toBe(429);
});
