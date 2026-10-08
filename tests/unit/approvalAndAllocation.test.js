const store = require('../../src/lib/store');
const audit = require('../../src/services/auditService');
const allocations = require('../../src/services/allocationService');
const approvals = require('../../src/services/approvalService');

const coord1 = { id: 'c1', role: 'COORDINATOR' };
const coord2 = { id: 'c2', role: 'COORDINATOR' };
const volunteer = { id: 'v1', role: 'VOLUNTEER' };

describe('allocation separation of duties (SR-04, V-06)', () => {
  let res, shelterId;
  beforeEach(() => {
    store.reset(); audit._reset();
    res = allocations.addResource({ type: 'FOOD_KIT', unit: 'kit', qtyAvailable: 100, warehouse: 'WH-Chennai-1' });
    shelterId = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
  });

  test('requester cannot approve own allocation', () => {
    const a = allocations.request(coord1, { resourceId: res.id, quantity: 10, targetType: 'SHELTER', targetId: shelterId });
    expect(() => approvals.approve(a.approvalId, coord1)).toThrow('You cannot approve your own request');
    expect(store.state.resources.get(res.id).qtyAvailable).toBe(100);
    expect(audit.list({ action: 'SELF_APPROVAL_BLOCKED' })).toHaveLength(1);
  });

  test('a different coordinator can approve and stock is reserved', () => {
    const a = allocations.request(coord1, { resourceId: res.id, quantity: 30, targetType: 'SHELTER', targetId: shelterId });
    const out = approvals.approve(a.approvalId, coord2);
    expect(out.result).toMatchObject({ status: 'APPROVED', stockAfter: 70 });
  });

  test('non-coordinator approver is rejected', () => {
    const a = allocations.request(coord1, { resourceId: res.id, quantity: 5, targetType: 'SHELTER', targetId: shelterId });
    expect(() => approvals.approve(a.approvalId, volunteer)).toThrow('Forbidden');
  });

  test('over-allocation by concurrent approvals is prevented', () => {
    const a1 = allocations.request(coord1, { resourceId: res.id, quantity: 60, targetType: 'SHELTER', targetId: shelterId });
    const a2 = allocations.request(coord1, { resourceId: res.id, quantity: 60, targetType: 'SHELTER', targetId: shelterId });
    approvals.approve(a1.approvalId, coord2);
    expect(() => approvals.approve(a2.approvalId, coord2)).toThrow('Insufficient stock');
    expect(store.state.resources.get(res.id).qtyAvailable).toBe(40);
  });

  test('a request cannot be approved twice', () => {
    const a = allocations.request(coord1, { resourceId: res.id, quantity: 5, targetType: 'SHELTER', targetId: shelterId });
    approvals.approve(a.approvalId, coord2);
    expect(() => approvals.approve(a.approvalId, coord2)).toThrow('Request already decided');
  });
});
