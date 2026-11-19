import http from 'node:http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
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

// Lightweight HTTP health probe endpoint including database status
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', db: 'sqlite', timestamp: Date.now() });
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
  console.log(`[Server] CORS configured for origin: ${CLIENT_ORIGIN}`);
});

process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down gracefully...');
  mockServer.stop();
  db.close();
  server.close(() => {
    process.exit(0);
  });
});
