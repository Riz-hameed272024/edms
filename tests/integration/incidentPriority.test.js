// Integration: routes + middleware + services + audit working together (UC-02, UC-03, SR-05)
process.env.REPORT_LIMIT_MAX = '100';
const { setup, reportIncident, request } = require('../helpers');

describe('Incident report -> verify -> P1 dual approval', () => {
  let ctx, c1, c2, vol;
  beforeAll(async () => {
    ctx = await setup();
    [c1, c2, vol] = await Promise.all([ctx.login('coord1'), ctx.login('coord2'), ctx.login('vol1')]);
  });

  test('full priority workflow with separation of duties', async () => {
    const rep = await reportIncident(ctx.app);
    expect(rep.status).toBe(201);
    const id = rep.body.id;

    const v = await request(ctx.app).post(`/api/incidents/${id}/verify`).set('Authorization', `Bearer ${c1}`)
      .send({ decision: 'GENUINE', reason: 'Confirmed by phone call-back' });
    expect(v.status).toBe(200);
    expect(v.body.status).toBe('VERIFIED');

    const pr = await request(ctx.app).post(`/api/incidents/${id}/priority-requests`).set('Authorization', `Bearer ${c1}`)
      .send({ priority: 'P1', reason: 'Elderly people trapped', version: v.body.version });
    expect(pr.status).toBe(202);

    const self = await request(ctx.app).post(`/api/approvals/${pr.body.requestId}/approve`).set('Authorization', `Bearer ${c1}`);
    expect(self.status).toBe(403);

    const ok = await request(ctx.app).post(`/api/approvals/${pr.body.requestId}/approve`).set('Authorization', `Bearer ${c2}`);
    expect(ok.status).toBe(200);
    expect(ok.body.result.priority).toBe('P1');

    const stale = await request(ctx.app).post(`/api/incidents/${id}/priority-requests`).set('Authorization', `Bearer ${c1}`)
      .send({ priority: 'P2', reason: 'stale', version: 1 });
    expect(stale.status).toBe(409);
  });

  test('volunteer cannot verify or prioritise (RBAC, T-06)', async () => {
    const rep = await reportIncident(ctx.app, { phone: '+919000000001' });
    const r = await request(ctx.app).post(`/api/incidents/${rep.body.id}/verify`).set('Authorization', `Bearer ${vol}`)
      .send({ decision: 'GENUINE', reason: 'trying' });
    expect(r.status).toBe(403);
  });

  test('exact location hidden from volunteers, visible to coordinators (V-01, SR-07)', async () => {
    const rep = await reportIncident(ctx.app, { phone: '+919000000002', location: { lat: 12.97915, lon: 80.22094 } });
    const asVol = await request(ctx.app).get(`/api/incidents/${rep.body.id}`).set('Authorization', `Bearer ${vol}`);
    const asCo = await request(ctx.app).get(`/api/incidents/${rep.body.id}`).set('Authorization', `Bearer ${c1}`);
    expect(asVol.body.location).toEqual({ lat: 12.98, lon: 80.22, precision: '~1km' });
    expect(asVol.body.description).toBeUndefined();
    expect(asCo.body.location).toEqual({ lat: 12.97915, lon: 80.22094 });
  });

  test('client-supplied priority in a public report is ignored (information-flow endorsement)', async () => {
    const rep = await reportIncident(ctx.app, { phone: '+919000000003', priority: 'P1' });
    expect(rep.status).toBe(201);
    const asCo = await request(ctx.app).get(`/api/incidents/${rep.body.id}`).set('Authorization', `Bearer ${c1}`);
    expect(asCo.body.priority).toBeNull();
  });

  test('every step is in a valid audit chain', async () => {
    const admin = await ctx.login('admin1');
    const v = await request(ctx.app).get('/api/audit/verify').set('Authorization', `Bearer ${admin}`);
    expect(v.body.valid).toBe(true);
    const log = await request(ctx.app).get('/api/audit?action=SELF_APPROVAL_BLOCKED').set('Authorization', `Bearer ${admin}`);
    expect(log.body.length).toBeGreaterThanOrEqual(1);
  });
});
