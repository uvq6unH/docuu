import http from 'node:http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { setupMockServer } from './mock/mockServer.js';
import { RoomManager } from './rooms/roomManager.js';

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

// Lightweight HTTP health probe endpoint
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
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

// 2. Initialize Real Room Manager for Lobby (N01) & Tick Simulation (N02)
const roomManager = new RoomManager(io);

server.listen(PORT, () => {
  console.log(`[Server] Server listening on http://localhost:${PORT}`);
  console.log(`[Server] Health check available at http://localhost:${PORT}/healthz`);
  console.log(`[Server] CORS configured for origin: ${CLIENT_ORIGIN}`);
});

process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down gracefully...');
  mockServer.stop();
  server.close(() => {
    process.exit(0);
  });
});
