// System / validation test: one complete disaster-response scenario through the public API,
// validating the business goal (a genuine report becomes a P1 incident that receives approved supplies)
// and the security goal (no step can be completed by a single actor; audit chain intact).
process.env.REPORT_LIMIT_MAX = '100';
const { setup, reportIncident, request } = require('../helpers');

test('E2E: report -> verify -> P1 (dual approval) -> allocation (dual approval) -> audit verified', async () => {
  const ctx = await setup();
  const [c1, c2, admin] = await Promise.all([ctx.login('coord1'), ctx.login('coord2'), ctx.login('admin1')]);
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  const health = await request(ctx.app).get('/healthz');
  expect(health.body.status).toBe('ok');

  const rep = await reportIncident(ctx.app, { type: 'CYCLONE', description: 'Roof collapsed, 4 people inside, Adyar' });
  expect(rep.status).toBe(201);
  expect(rep.body.ref).toMatch(/^EDMS-\d{5}$/);

  const v = await request(ctx.app).post(`/api/incidents/${rep.body.id}/verify`).set(auth(c1)).send({ decision: 'GENUINE', reason: 'Field team confirmed' });
  const p = await request(ctx.app).post(`/api/incidents/${rep.body.id}/priority-requests`).set(auth(c1)).send({ priority: 'P1', reason: 'Life at risk', version: v.body.version });
  await request(ctx.app).post(`/api/approvals/${p.body.requestId}/approve`).set(auth(c2)).expect(200);

  const resrc = await request(ctx.app).post('/api/resources').set(auth(c1)).send({ type: 'RESCUE_BOAT', unit: 'boat', qtyAvailable: 5, warehouse: 'WH-Adyar' });
  const alloc = await request(ctx.app).post('/api/allocations').set(auth(c1)).send({ resourceId: resrc.body.id, quantity: 2, targetType: 'INCIDENT', targetId: rep.body.id });
  expect(alloc.status).toBe(202);
  await request(ctx.app).post(`/api/approvals/${alloc.body.approvalId}/approve`).set(auth(c1)).expect(403);
  const ap = await request(ctx.app).post(`/api/approvals/${alloc.body.approvalId}/approve`).set(auth(c2)).expect(200);
  expect(ap.body.result.stockAfter).toBe(3);

  const inc = await request(ctx.app).get(`/api/incidents/${rep.body.id}`).set(auth(c2));
  expect(inc.body).toMatchObject({ status: 'VERIFIED', priority: 'P1' });

  const chain = await request(ctx.app).get('/api/audit/verify').set(auth(admin));
  expect(chain.body.valid).toBe(true);
  const actions = (await request(ctx.app).get('/api/audit').set(auth(admin))).body.map((r) => r.action);
  expect(actions).toEqual(expect.arrayContaining(['INCIDENT_REPORTED', 'INCIDENT_VERIFIED', 'PRIORITY_CHANGED', 'SELF_APPROVAL_BLOCKED', 'ALLOCATION_APPROVED']));

  const metrics = await request(ctx.app).get('/metrics');
  expect(metrics.text).toContain('SELF_APPROVAL_BLOCKED');
});
