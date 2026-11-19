import http from 'node:http';
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
app.get('/api/metrics', (_req: Request, res: Response) => {
  const metrics = roomManager.getMetrics();
  res.status(200).json(metrics);
});

// Configurable Rules & Versioning Endpoints (T02)
app.get('/api/rules', (_req: Request, res: Response) => {
  const rulesData = roomManager.getRules();
  res.status(200).json(rulesData);
});

app.post('/api/rules/tune', (req: Request, res: Response) => {
  const overrides = req.body?.rules || req.body;
  if (!overrides || typeof overrides !== 'object') {
    res.status(400).json({ error: 'Invalid rules object provided' });
    return;
  }
  const updatedRules = roomManager.tuneRules(overrides);
  res.status(200).json({ ok: true, rules: updatedRules });
});

app.post('/api/rules/reset', (_req: Request, res: Response) => {
  const resetRules = roomManager.resetRules();
  res.status(200).json({ ok: true, rules: resetRules });
});

// Balance Telemetry & Match Statistics Endpoint (T01)
app.get('/api/stats/balance', (_req: Request, res: Response) => {
  const stats = db.getBalanceStats();
  res.status(200).json(stats);
});

// REST Endpoints for match statistics and audit logs
app.get('/api/matches', (_req: Request, res: Response) => {
  const matches = db.getRecentMatches(20);
  res.status(200).json({ matches });
});

app.get('/api/matches/:id', (req: Request, res: Response) => {
  const match = db.getMatch(req.params.id as string);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }
  const stats = db.getMatchStats(req.params.id as string);
  const events = db.getMatchEvents(req.params.id as string);
  res.status(200).json({ match, stats, events });
});

app.get('/api/rooms/:code', (req: Request, res: Response) => {
  const code = (req.params.code as string).toUpperCase();
  const room = db.getRoom(code);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const players = db.getRoomPlayers(code);
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

// 1. Initialize Mock snapshot server for independent client / regression development
const mockServer = setupMockServer(io);

// 2. Initialize Real Room Manager for Lobby (N01) & Tick Simulation (N02) with Database
const roomManager = new RoomManager(io, db);

server.listen(PORT, () => {
  console.log(`[Server] Server listening on http://localhost:${PORT}`);
  console.log(`[Server] Health check available at http://localhost:${PORT}/healthz`);
  console.log(`[Server] Metrics available at http://localhost:${PORT}/api/metrics`);
  console.log(`[Server] CORS configured for origin: ${CLIENT_ORIGIN}`);
});

function gracefulShutdown(signal: string) {
  console.log(`[Server] ${signal} received. Shutting down gracefully...`);
  mockServer.stop();
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
