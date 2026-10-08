const audit = require('../../src/services/auditService');

describe('auditService (SR-10)', () => {
  beforeEach(() => audit._reset());

  test('builds a valid hash chain', () => {
    audit.record('u1', 'LOGIN_SUCCESS', 'user:u1');
    audit.record('u1', 'PRIORITY_CHANGED', 'incident:i1', { old: 'P2', new: 'P1' });
    expect(audit.verify()).toEqual({ valid: true, length: 2 });
    expect(audit.list().at(1).prevHash).toBe(audit.list().at(0).hash);
  });

  test('detects tampering with an earlier record', () => {
    audit.record('u1', 'PRIORITY_CHANGED', 'incident:i1', { new: 'P3' });
    audit.record('u2', 'ALLOCATION_APPROVED', 'allocation:a1');
    audit._tamperForTest(1, 'data', { new: 'P1' });
    expect(audit.verify()).toEqual({ valid: false, brokenAt: 1 });
  });

  test('records are immutable', () => {
    const r = audit.record('u1', 'X', 'y');
    expect(() => { 'use strict'; r.action = 'Z'; }).toThrow();
  });
});
