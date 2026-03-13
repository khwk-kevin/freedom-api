import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import chatRouter from './routes/chat';
import scrapeRouter from './routes/scrape';
import provisionRouter from './routes/provision';
import buildAppRouter from './routes/build-app';
import deployRouter from './routes/deploy';
import buildStatusRouter from './routes/build-status';
import vmStatusRouter from './routes/vm-status';
import stopVmRouter from './routes/stop-vm';
import startIterationRouter from './routes/start-iteration';
import buildRouter from './routes/build';
import syncFreedomRouter from './routes/sync-freedom';
import tokenBalanceRouter from './routes/token-balance';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow *.freedom.world, localhost:3000, or no origin (server-to-server)
      if (
        !origin ||
        origin.endsWith('.freedom.world') ||
        origin === 'https://freedom.world' ||
        origin.startsWith('http://localhost:')
      ) {
        cb(null, true);
      } else {
        cb(new Error(`CORS policy: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── API routes — all under /apps/ prefix ──────────────────────────────────────
app.use('/apps/chat', chatRouter);
app.use('/apps/scrape', scrapeRouter);
app.use('/apps/provision', provisionRouter);
app.use('/apps/build-app', buildAppRouter);
app.use('/apps/deploy', deployRouter);
app.use('/apps/build-status', buildStatusRouter);
app.use('/apps/vm-status', vmStatusRouter);
app.use('/apps/stop-vm', stopVmRouter);
app.use('/apps/start-iteration', startIterationRouter);
app.use('/apps/build', buildRouter);
app.use('/apps/sync-freedom', syncFreedomRouter);
app.use('/apps/token-balance', tokenBalanceRouter);

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[server] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
);

app.listen(PORT, () => {
  console.log(`[server] Freedom API listening on port ${PORT}`);
});

export default app;
