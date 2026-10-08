# EDMS – Emergency Disaster Management System (secure API)

24CYS401 Secure Software Engineering – end-semester lab. Node.js 20 / Express REST API implementing the
security-critical modules: authentication + MFA, RBAC, incident reporting with OTP and rate limits,
dual-approval priority changes and resource allocation, location privacy, and a hash-chained audit log.

## Layout
```
src/            API (routes -> middleware -> services -> store)
tests/          unit, integration, system (end-to-end), fuzz
docs/before/    insecure first draft (refactoring evidence, NOT executed)
db/schema.sql   PostgreSQL schema with separation-of-duties CHECK constraints
k8s/            namespace, secret template, service account, deployment, service, network policy, HPA, quota
.github/        CI/CD pipeline, CODEOWNERS
evidence/       test, coverage, npm audit (before/after), Semgrep (before/after), ESLint outputs
```

## YOUR STEPS (run on your laptop; take a screenshot after each ★)

### 1. Run and test locally
```bash
npm ci
npm test                       # ★ 29 tests pass
npm run lint                   # ★ 0 errors
npm audit --omit=dev           # ★ found 0 vulnerabilities
```

### 2. Git + GitHub (secure repository)
```bash
git init && git checkout -b main
git add . && git commit -m "EDMS secure API v1.0.0"
git checkout -b develop
# create an EMPTY private repo named edms on github.com, then:
git remote add origin https://github.com/<your-user>/edms.git
git push -u origin main develop
git log --oneline              # ★
```
On GitHub: Settings → Branches → add rule for `main`: require PR, 1 approval, status checks (all CI jobs),
block force push ★. Settings → Code security: enable secret scanning + Dependabot ★.
Settings → Secrets → Actions: add `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `AUDIT_HMAC_KEY` (generate below) ★.
Settings → Environments: create `staging` with yourself as required reviewer.
Branch strategy: feature/* → PR → develop → PR → main (release).

Generate secrets (never commit them):
```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_private.pem
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
openssl rand -hex 32           # AUDIT_HMAC_KEY
```

### 3. CI/CD
Push to `main` (or open a PR) → Actions tab shows 4 jobs: build-test → security → package → deploy ★.

### 4. Docker
```bash
docker build -t edms-api:1.0.0 .
docker images edms-api                          # ★ small alpine image
docker run -d --name edms -p 8080:8080 \
  -e NODE_ENV=development --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges edms-api:1.0.0
docker ps                                       # ★
docker exec edms whoami                         # ★ prints: node  (non-root)
curl http://localhost:8080/healthz              # ★ {"status":"ok"}
```

### 5. Kubernetes (Minikube)
```bash
minikube start
eval $(minikube docker-env) && docker build -t edms-api:1.0.0 .     # Windows PowerShell: & minikube -p minikube docker-env --shell powershell | Invoke-Expression
kubectl apply -f k8s/00-namespace.yaml
kubectl -n edms create secret generic edms-secrets \
  --from-file=JWT_PRIVATE_KEY=jwt_private.pem --from-file=JWT_PUBLIC_KEY=jwt_public.pem \
  --from-literal=AUDIT_HMAC_KEY=$(openssl rand -hex 32)
kubectl apply -f k8s/02-serviceaccount.yaml -f k8s/03-deployment.yaml -f k8s/04-service.yaml \
  -f k8s/05-networkpolicy.yaml -f k8s/06-hpa.yaml -f k8s/07-resourcequota.yaml
kubectl -n edms get pods,svc,hpa,networkpolicy                        # ★
kubectl -n edms get pod -l app=edms-api -o jsonpath='{.items[0].spec.containers[0].securityContext}'   # ★
kubectl -n edms exec deploy/edms-api -- id                            # ★ uid=1000
kubectl -n edms port-forward svc/edms-api 8080:80 & curl localhost:8080/healthz   # ★
kubectl get secret -n edms edms-secrets -o jsonpath='{.data}' | head -c 80        # shows only base64, not in git
```
