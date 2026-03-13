/**
 * Build Container Exec Server
 *
 * Lightweight HTTP server that runs inside the Railway build container,
 * providing a secure API for executing commands and writing files.
 * Replaces the Railway CLI SSH approach which requires user session tokens.
 */

import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

const app = express();
app.use(express.json({ limit: '100mb' }));

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const EXEC_SECRET = process.env.EXEC_SECRET ?? '';
const DEFAULT_TIMEOUT = 600_000; // 10 minutes for Claude Code builds
const MAX_BUFFER = 50 * 1024 * 1024; // 50MB

// ============================================================
// AUTH HELPER
// ============================================================

function checkAuth(secret: unknown): boolean {
  if (!EXEC_SECRET) {
    console.warn('[exec-server] WARNING: EXEC_SECRET not set — all requests allowed');
    return true;
  }
  return secret === EXEC_SECRET;
}

// ============================================================
// GET /health
// ============================================================

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// ============================================================
// POST /exec
// ============================================================

interface ExecBody {
  secret?: string;
  cmd?: string;
  timeout?: number;
  cwd?: string;
}

app.post('/exec', (req: Request, res: Response) => {
  const { secret, cmd, timeout, cwd } = req.body as ExecBody;

  if (!checkAuth(secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!cmd || typeof cmd !== 'string') {
    res.status(400).json({ error: 'cmd is required' });
    return;
  }

  const timeoutMs = typeof timeout === 'number' ? timeout : DEFAULT_TIMEOUT;

  exec(
    cmd,
    {
      timeout: timeoutMs,
      maxBuffer: MAX_BUFFER,
      cwd: cwd ?? undefined,
      env: process.env,
    },
    (error, stdout, stderr) => {
      let exitCode = 0;

      if (error) {
        // error.code is the exit code when available
        exitCode = (error as NodeJS.ErrnoException & { code?: number }).code ?? 1;
        // If killed by timeout, signal will be set
        if (error.killed) {
          exitCode = 124; // same as timeout(1) convention
        }
      }

      res.json({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode,
      });
    }
  );
});

// ============================================================
// POST /write-file
// ============================================================

interface WriteFileBody {
  secret?: string;
  path?: string;
  content?: string; // base64-encoded
}

app.post('/write-file', async (req: Request, res: Response) => {
  const { secret, path, content } = req.body as WriteFileBody;

  if (!checkAuth(secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!path || typeof path !== 'string') {
    res.status(400).json({ error: 'path is required' });
    return;
  }

  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content is required (base64 string)' });
    return;
  }

  try {
    const buf = Buffer.from(content, 'base64');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buf);
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ============================================================
// START
// ============================================================

app.listen(PORT, () => {
  console.log(`[exec-server] Listening on port ${PORT}`);
  if (!EXEC_SECRET) {
    console.warn('[exec-server] WARNING: EXEC_SECRET env var not set!');
  }
});
