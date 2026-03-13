# Build Container Setup Guide

## Overview

The **Freedom World build container** is a single shared Railway service (ID: `60ce125a-d23e-4751-8205-21ff937fdd18`) that compiles merchant Next.js apps into static exports. It is **not** a per-merchant container — all merchant builds run sequentially inside this one container.

### Pipeline Summary

```
API Server (Railway)
  │
  ├─ SSH → Build Container
  │         ├─ git clone <merchant-repo>    (GitHub, token-authed)
  │         ├─ npm install
  │         ├─ Write vault/context files    (merchant spec, brand data)
  │         ├─ claude -p "<prompt>"         (Claude Code generates/customizes app)
  │         ├─ npm run build                (Next.js → static export in /out)
  │         ├─ git add -A && git commit && git push   (→ GitHub)
  │         └─ rm -rf /workspace/builds/<merchantId>  (cleanup)
  │
  └─ Vercel picks up the git push and auto-deploys
```

The API communicates with the build container via **Railway CLI SSH** (`railway ssh --project <id> --service <id> -- sh -c "<cmd>"`), with a fallback to Railway's HTTP exec API if the CLI is unavailable.

---

## Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20 LTS | Next.js build runtime |
| npm | ≥10 | Package install + `npm run build` |
| Git | ≥2.40 | Clone repos, commit, push |
| Claude Code CLI (`claude`) | latest | AI-driven app generation (`@anthropic/claude-code`) |
| base64 | (coreutils) | File writing via SSH (`sshWriteFile` uses base64 pipe) |
| bash / sh | any | Command execution shell |

**Working directory layout inside the container:**

```
/workspace/
  builds/
    <merchantId>/    ← cloned repo, built here, then deleted
    <merchantId>/    ← next merchant build (sequential)
```

---

## Environment Variables

These must be set in the build container's Railway environment:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ | Claude Code API key (used by `claude` CLI) |
| `GITHUB_TOKEN` | ✅ | GitHub PAT for authenticated git clone + push (needs `repo` scope) |
| `NODE_ENV` | optional | Set to `production` for builds |

> **Note:** `BUILD_SERVICE_PROJECT_ID` and `BUILD_SERVICE_ID` are set on the **API service**, not the build container. The build container itself doesn't need to know its own Railway IDs.

---

## Communication Protocol

The API server connects to the build container using the **Railway CLI SSH primitive**:

```bash
railway ssh \
  --project <BUILD_SERVICE_PROJECT_ID> \
  --service <BUILD_SERVICE_ID> \
  -- sh -c "<command>"
```

This is called from `lib/app-builder/railway.ts → sshExecCommand()`. The API server must have:
- `railway` CLI installed (`npm install -g @railway/cli`)
- `RAILWAY_TEAM_TOKEN` or `RAILWAY_API_TOKEN` env var set

File writes use base64 encoding to avoid shell-escaping issues:
```bash
echo '<base64>' | base64 -d > "/workspace/builds/<merchantId>/path/to/file"
```

---

## Step-by-Step Setup

### 1. Build the Docker image

```bash
cd /clawd/bd/freedom-api
docker build -f Dockerfile.build-container -t freedom-build-container .
```

### 2. Push to a container registry

```bash
docker tag freedom-build-container <your-registry>/freedom-build-container:latest
docker push <your-registry>/freedom-build-container:latest
```

### 3. Configure the Railway service

In Railway dashboard for service `60ce125a-d23e-4751-8205-21ff937fdd18`:

1. Set **Source** to your container image (or use the Dockerfile from this repo)
2. Set **Start command** to: `sleep infinity`  
   _(The container stays alive; all work is triggered via SSH exec)_
3. Add environment variables:
   - `ANTHROPIC_API_KEY=sk-ant-...`
   - `GITHUB_TOKEN=ghp_...`
   - `NODE_ENV=production`

### 4. Verify the container is running

From the API service (which has `railway` CLI + token):

```bash
railway ssh \
  --project $BUILD_SERVICE_PROJECT_ID \
  --service $BUILD_SERVICE_ID \
  -- sh -c "node --version && git --version && claude --version && echo OK"
```

Expected output:
```
v20.x.x
git version 2.x.x
1.x.x (or similar)
OK
```

### 5. Verify workspace write access

```bash
railway ssh \
  --project $BUILD_SERVICE_PROJECT_ID \
  --service $BUILD_SERVICE_ID \
  -- sh -c "mkdir -p /workspace/builds && touch /workspace/builds/.ok && echo write-ok"
```

### 6. Set API service env vars

On the **Freedom API** service (not the build container), ensure these are set:

```
BUILD_SERVICE_PROJECT_ID=<railway-project-id>
BUILD_SERVICE_ID=60ce125a-d23e-4751-8205-21ff937fdd18
RAILWAY_TEAM_TOKEN=<railway-api-token>
GITHUB_TOKEN=<github-pat>
```

---

## Notes & Gotchas

- **Concurrent builds:** The current architecture runs builds sequentially in one container. Parallel builds for different merchants will clobber `/workspace/builds/` if not properly namespaced. The code namespaces by `merchantId` but there's no build queue — parallel API calls will overlap.
- **Timeout:** SSH exec has a 10-minute timeout (`600_000ms`). Claude Code builds can be slow. If builds exceed this, increase the timeout in `railway.ts`.
- **Claude Code permissions:** The `claude` CLI is invoked with `--dangerously-skip-permissions` — this is intentional for automated, sandboxed builds. The container should not have access to production secrets beyond what's listed above.
- **Git auth:** The GitHub token is embedded in the clone URL (`https://<token>@github.com/...`). The container's git config should not have `credential.helper` set to avoid token caching conflicts.
- **Disk:** Each build is cleaned up after completion (`rm -rf /workspace/builds/<merchantId>`). Ensure the container has at least **5GB** of free disk space for in-progress builds.
