import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { PROTOCOL_VERSION } from '@folk-tag/shared';
import { setupMockServer } from './mock/mockServer.js';
import { RoomManager } from './rooms/roomManager.js';
import { initDatabase } from './db/index.js';

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

// 0. Initialize persistent SQLite database
const db = initDatabase();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const RUNTIME_ADMIN_TOKEN = ADMIN_TOKEN || crypto.randomBytes(24).toString('hex');
if (!ADMIN_TOKEN && process.env.NODE_ENV !== 'test') {
  console.log(`[Security] No ADMIN_TOKEN set in environment. Generated runtime admin token: ${RUNTIME_ADMIN_TOKEN}`);
}

function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function verifyAdmin(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers['authorization'];
  let provided = (req.headers['x-admin-token'] as string | undefined);
  if (!provided && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    provided = authHeader.slice(7).trim();
  }

  const expected = ADMIN_TOKEN || RUNTIME_ADMIN_TOKEN;
  if (!provided || !timingSafeCompare(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized: Valid Admin Token required (via X-Admin-Token or Authorization: Bearer)' });
    return;
  }
  next();
}

// Deep HTTP health probe endpoint
app.get('/healthz', (_req: Request, res: Response) => {
  try {
    const isDbAlive = db.checkHealth();
    if (!isDbAlive) {
      res.status(503).json({ status: 'error', message: 'Database health check failed' });
      return;
    }
    const mem = process.memoryUsage();
    res.status(200).json({
      status: 'ok',
      db: 'sqlite',
      version: PROTOCOL_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      },
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(503).json({ status: 'error', error: err?.message || 'Server error' });
  }
});

// Server and Tick Simulation Metrics Endpoint (A04)
app.get('/api/metrics', verifyAdmin, (_req: Request, res: Response) => {
  const metrics = roomManager.getMetrics();
  res.status(200).json(metrics);
});

// Configurable Rules & Versioning Endpoints (T02)
app.get('/api/rules', (_req: Request, res: Response) => {
  const rulesData = roomManager.getRules();
  res.status(200).json(rulesData);
});

app.post('/api/rules/tune', verifyAdmin, (req: Request, res: Response) => {
  const overrides = req.body?.rules || req.body;
  if (!overrides || typeof overrides !== 'object') {
    res.status(400).json({ error: 'Invalid rules object provided' });
    return;
  }
  const updatedRules = roomManager.tuneRules(overrides);
  res.status(200).json({ ok: true, rules: updatedRules });
});

app.post('/api/rules/reset', verifyAdmin, (_req: Request, res: Response) => {
  const resetRules = roomManager.resetRules();
  res.status(200).json({ ok: true, rules: resetRules });
});

// Balance Telemetry & Match Statistics Endpoint (T01)
app.get('/api/stats/balance', verifyAdmin, (_req: Request, res: Response) => {
  const stats = db.getBalanceStats();
  res.status(200).json(stats);
});

// REST Endpoints for match statistics and audit logs
app.get('/api/matches', verifyAdmin, (_req: Request, res: Response) => {
  const matches = db.getRecentMatches(20);
  res.status(200).json({ matches });
});

app.get('/api/matches/:id', verifyAdmin, (req: Request, res: Response) => {
  const match = db.getMatch(req.params.id as string);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }
  const stats = db.getMatchStats(req.params.id as string);
  const events = db.getMatchEvents(req.params.id as string);
  res.status(200).json({ match, stats, events });
});

app.get('/api/rooms', (_req: Request, res: Response) => {
  const rooms = roomManager.getPublicRooms();
  res.status(200).json({ ok: true, data: rooms, rooms });
});

app.get('/api/rooms/:code', (req: Request, res: Response) => {
  const code = (req.params.code as string).toUpperCase();
  const room = db.getRoom(code);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const rawPlayers = db.getRoomPlayers(code);
  // Security fix (Issue 2): Explicitly return only public safe fields (id, name, ready, isHost)
  const players = rawPlayers.map((p: any) => ({
    id: p.id,
    name: p.name,
    ready: Boolean(p.ready),
    isHost: Boolean(p.is_host ?? p.isHost),
  }));
  res.status(200).json({ room, players });
});

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// 1. Initialize Mock snapshot server on dedicated /mock namespace
const isMockEnabled =
  process.env.NODE_ENV !== 'production' &&
  (process.env.ENABLE_MOCK_SERVER === 'true' || process.env.ENABLE_MOCK === 'true' || process.argv.includes('--mock'));
const isMockOnly = process.argv.includes('--mock') || process.env.MOCK_SERVER === 'true';
const mockServer = isMockEnabled ? setupMockServer(isMockOnly ? io : (io.of('/mock') as any)) : null;

// 2. Initialize Real Room Manager on default root namespace (/) for real multiplayer lobby & authoritative simulation
const roomManager = new RoomManager(io, db);

// 3. Serve Frontend Static Production Assets if built (Unified Single-Port Deployment)
const frontendDistCandidates = [
  path.resolve(process.cwd(), '../../frontend/dist'),
  path.resolve(process.cwd(), '../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
];
const distPath = frontendDistCandidates.find(p => fs.existsSync(p));
if (distPath) {
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path === '/healthz') {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[Server] Serving frontend static assets from: ${distPath}`);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Server listening on http://0.0.0.0:${PORT} (all LAN interfaces)`);
  console.log(`[Server] Health check available at http://localhost:${PORT}/healthz`);
  console.log(`[Server] Metrics available at http://localhost:${PORT}/api/metrics`);
  console.log(`[Server] CORS configured for origin: ${CLIENT_ORIGIN}`);
  if (process.send) {
    process.send('ready');
  }
});

function gracefulShutdown(signal: string) {
  console.log(`[Server] ${signal} received. Shutting down gracefully...`);
  if (mockServer) mockServer.stop();
  roomManager.destroy();
  db.close();
  server.close(() => {
    console.log('[Server] HTTP and Socket.IO servers closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[Server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
