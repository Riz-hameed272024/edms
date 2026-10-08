// PHASE 1 REFACTORING R1 - BEFORE (not executed; evidence only)
// Problem: every route repeats its own role check. One forgotten or wrong
// check = privilege escalation (T-04, T-06). Loose != and a missing ADMIN role.
app.post('/api/allocations', (req, res) => {
  if (req.user.role !== 'COORDINATOR' && req.user.role !== 'ADMIN') return res.status(403).end();
  // ...allocate
});
app.post('/api/incidents/:id/priority-requests', (req, res) => {
  if (req.user.role != 'COORDINATOR') return res.status(403).end();
  // ...prioritise
});
app.patch('/api/users/:id/role', (req, res) => {
  // role check FORGOTTEN here -> any logged-in user can change roles
  // ...change role
});
