// Integration: role escalation defences (SR-02, SR-03, V-02, T-04)
const { setup, request } = require('../helpers');

describe('Role administration', () => {
  let ctx, a1, a2, c1;
  beforeAll(async () => {
    ctx = await setup();
    [a1, a2, c1] = await Promise.all([ctx.login('admin1'), ctx.login('admin2'), ctx.login('coord1')]);
  });

  test('mass assignment of role via profile update is ignored (V-02 fix)', async () => {
    const r = await request(ctx.app).patch(`/api/users/${ctx.users.coord1.id}`).set('Authorization', `Bearer ${c1}`)
      .send({ name: 'R Kumar', role: 'ADMIN' });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe('COORDINATOR');
    expect(r.body.passwordHash).toBeUndefined();
  });

  test('coordinator cannot call the role endpoint', async () => {
    const r = await request(ctx.app).patch(`/api/users/${ctx.users.coord1.id}/role`).set('Authorization', `Bearer ${c1}`)
      .send({ role: 'ADMIN', reason: 'self promotion' });
    expect(r.status).toBe(403);
  });

  test('admin cannot change own role', async () => {
    const r = await request(ctx.app).patch(`/api/users/${ctx.users.admin1.id}/role`).set('Authorization', `Bearer ${a1}`)
      .send({ role: 'COORDINATOR', reason: 'test' });
    expect(r.status).toBe(403);
  });

  test('ADMIN grant needs a second admin', async () => {
    const r = await request(ctx.app).patch(`/api/users/${ctx.users.rescue1.id}/role`).set('Authorization', `Bearer ${a1}`)
      .send({ role: 'ADMIN', reason: 'new district admin' });
    expect(r.status).toBe(202);
    const self = await request(ctx.app).post(`/api/approvals/${r.body.requestId}/approve`).set('Authorization', `Bearer ${a1}`);
    expect(self.status).toBe(403);
    const ok = await request(ctx.app).post(`/api/approvals/${r.body.requestId}/approve`).set('Authorization', `Bearer ${a2}`);
    expect(ok.status).toBe(200);
    expect(ok.body.result.role).toBe('ADMIN');
  });

  test('tampered / missing tokens are rejected', async () => {
    expect((await request(ctx.app).get('/api/audit')).status).toBe(401);
    const bad = `${a1.slice(0, -4)}AAAA`;
    expect((await request(ctx.app).get('/api/audit').set('Authorization', `Bearer ${bad}`)).status).toBe(401);
  });
});
