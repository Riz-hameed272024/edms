# Security policy (EDMS)
- Report vulnerabilities privately to the security champion; do not open public issues.
- Secrets are never committed. Use `.env` locally (git-ignored) and Kubernetes Secrets / GitHub Actions secrets elsewhere.
- Every PR to `main` needs 1 approving review, passing CI (tests, ESLint, npm audit, Semgrep, Gitleaks, Trivy) and signed commits.
