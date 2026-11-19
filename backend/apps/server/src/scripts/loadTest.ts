import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { DatabaseManager } from '../db/database.js';
import { RoomManager, OFFICIAL_MAP_HASH } from '../rooms/roomManager.js';
import { CLIENT_EVENTS } from '@folk-tag/shared';

interface RoomSession {
  roomCode: string;
  clients: ClientSocket[];
  hostClient: ClientSocket;
}

export async function runLoadTest(
  numRooms = 5,
  playersPerRoom = 6,
  durationSeconds = 4
): Promise<{
  ok: boolean;
  totalRooms: number;
  totalPlayers: number;
  totalPacketsSent: number;
  avgTickMs: number;
  p95TickMs: number;
  maxTickMs: number;
}> {
  console.log(`[LoadTest] Starting stress test: ${numRooms} rooms, ${numRooms * playersPerRoom} clients, duration: ${durationSeconds}s...`);

  const app = http.createServer((_req, res) => res.end('ok'));
  const io = new SocketIOServer(app, { cors: { origin: '*' } });
  const db = new DatabaseManager(':memory:');
  const roomManager = new RoomManager(io, db);

  await new Promise<void>((resolve) => app.listen(0, resolve));
  const port = (app.address() as any).port;
  const serverUrl = `http://127.0.0.1:${port}`;

  const createClient = (): ClientSocket =>
    ClientIO(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

  const rooms: RoomSession[] = [];
  let totalPacketsSent = 0;

  try {
    // 1. Create and populate rooms
    for (let r = 0; r < numRooms; r++) {
      const hostClient = createClient();
      const hostName = `Host-R${r}`;

      const createRes = await new Promise<any>((resolve) => {
        hostClient.emit(
          CLIENT_EVENTS.ROOM_CREATE,
          { name: hostName, protocolVersion: 1 },
          (ack: any) => resolve(ack)
        );
      });

      if (!createRes.ok) {
        throw new Error(`Failed to create room ${r}: ${createRes.message}`);
      }

      const roomCode = createRes.roomCode;
      const clients: ClientSocket[] = [hostClient];

      // Join remaining 5 players
      for (let p = 1; p < playersPerRoom; p++) {
        const client = createClient();
        const joinRes = await new Promise<any>((resolve) => {
          client.emit(
            CLIENT_EVENTS.ROOM_JOIN,
            { roomCode, name: `Player-R${r}-P${p}`, protocolVersion: 1 },
            (ack: any) => resolve(ack)
          );
        });
        if (!joinRes.ok) {
          throw new Error(`Failed to join room ${roomCode}: ${joinRes.message}`);
        }
        clients.push(client);
      }

      // Ready up all players
      for (const client of clients) {
        await new Promise<any>((resolve) => {
          client.emit(
            CLIENT_EVENTS.ROOM_READY,
            { ready: true, mapHash: OFFICIAL_MAP_HASH },
            (ack: any) => resolve(ack)
          );
        });
      }

      // Host starts match
      const startRes = await new Promise<any>((resolve) => {
        hostClient.emit(CLIENT_EVENTS.ROOM_START, {}, (ack: any) => resolve(ack));
      });
      if (!startRes.ok) {
        throw new Error(`Failed to start match in room ${roomCode}: ${startRes.message}`);
      }

      // Captain selects jail J1
      await new Promise<any>((resolve) => {
        hostClient.emit(CLIENT_EVENTS.JAIL_SELECT, { jailId: 'J1' }, (ack: any) => resolve(ack));
      });

      // Fast-forward to PLAYING phase in memory
      const roomInstance = roomManager.getRoom(roomCode);
      if (roomInstance) {
        roomInstance.phase = 'PLAYING';
      }

      rooms.push({ roomCode, clients, hostClient });
    }

    console.log(`[LoadTest] All ${numRooms} rooms started in PLAYING phase. Simulating 30Hz inputs...`);

    // 2. Stream inputs at 30Hz for durationSeconds
    const totalTicks = durationSeconds * 30;
    const intervalMs = 1000 / 30;

    for (let tick = 1; tick <= totalTicks; tick++) {
      for (const room of rooms) {
        for (let idx = 0; idx < room.clients.length; idx++) {
          const client = room.clients[idx]!;
          client.emit(CLIENT_EVENTS.GAME_INPUT, {
            seq: tick,
            moveX: (tick % 2 === 0 ? 1 : -1) as -1 | 1,
            moveZ: 1 as const,
            yaw: ((tick * 0.05) % (Math.PI * 2)) - Math.PI,
            pitch: 0,
            sprint: tick % 3 === 0,
            crouch: false,
            rescueHeld: false,
            jumpId: tick % 20 === 0 ? 1 : 0,
            captureId: 0,
          });
          totalPacketsSent++;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    // 3. Test rate-limiting & malicious packet handling
    const malformedClient = createClient();
    malformedClient.emit(CLIENT_EVENTS.GAME_INPUT, {
      seq: -999, // invalid seq
      yaw: NaN, // invalid yaw
    });
    totalPacketsSent++;

    // Burst spam 60 packets immediately to trigger rate limiter
    for (let i = 0; i < 60; i++) {
      malformedClient.emit(CLIENT_EVENTS.GAME_INPUT, {
        seq: i + 1,
        moveX: 0,
        moveZ: 0,
        yaw: 0,
        pitch: 0,
        sprint: false,
        crouch: false,
        rescueHeld: false,
        jumpId: 0,
        captureId: 0,
      });
      totalPacketsSent++;
    }
    malformedClient.disconnect();

    // 4. Gather server metrics
    const metrics = roomManager.getMetrics();
    console.log('[LoadTest] Stress test completed. Server Metrics:', JSON.stringify(metrics, null, 2));

    return {
      ok: metrics.rooms.activeCount === numRooms,
      totalRooms: metrics.rooms.activeCount,
      totalPlayers: metrics.rooms.totalPlayers,
      totalPacketsSent,
      avgTickMs: metrics.simulation.avgTickMs,
      p95TickMs: metrics.simulation.p95TickMs,
      maxTickMs: metrics.simulation.maxTickMs,
    };
  } finally {
    for (const r of rooms) {
      for (const c of r.clients) {
        c.disconnect();
      }
    }
    roomManager.destroy();
    db.close();
    await new Promise((resolve) => app.close(resolve));
  }
}

// Direct CLI runner
if (process.argv[1]?.endsWith('loadTest.js') || process.argv[1]?.endsWith('loadTest.ts')) {
  runLoadTest(5, 6, 3)
    .then((result) => {
      console.log('[LoadTest] Result:', result);
      if (!result.ok || result.p95TickMs > 15) {
        console.error('[LoadTest] Performance check failed!');
        process.exit(1);
      }
      console.log('[LoadTest] Performance test PASSED!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[LoadTest] Error:', err);
      process.exit(1);
    });
}
