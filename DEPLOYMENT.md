# Folk Tag - Production Deployment & Operations Guide (v0.1.0)

This document provides complete instructions for deploying, configuring, monitoring, and tuning the **Folk Tag** authoritative multiplayer game server.

---

## 1. Architecture Overview

- **Authoritative Simulation Loop**: 30Hz server-side physics, collision resolution, capsule movement, capture mechanics, and rescue logic (`backend/apps/server/src/rooms/room.ts`).
- **Snapshot Broadcasting**: 15Hz client snapshots with stealth distance culling (hidden robbers >2m away are stripped from police snapshots).
- **Network Synchronization**: Client sequence acknowledgment, lag compensation, input deduplication, and 30s disconnect grace period for seamless reconnections.
- **Persistence Engine**: Native Node.js `node:sqlite` database in Write-Ahead Logging (`WAL`) mode with strict foreign key constraints, tracking room states, matches, player statistics, and audit game events.
- **Shared Contracts**: `@folk-tag/shared` contains universal definitions for protocol events, collision math, rules constants, and village map geometry (`village-v1.json`).

---

## 2. System Requirements

- **Operating System**: Linux (Ubuntu 22.04+ recommended), macOS, or Windows Server.
- **Node.js**: `24.21.0` (or Docker 24+).
- **npm**: `>= 11.0.0 < 12.0.0`.
- **Memory**: Minimum 512 MB RAM (1 GB recommended for 50+ concurrent rooms).
- **Storage**: Minimum 500 MB for Node modules and SQLite database storage.

---

## 3. Local Development Setup

### 3.1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd docuu
npm install
```

### 3.2. Build Packages
```bash
# Build shared package
npm --prefix packages/shared run build

# Build authoritative backend server
npm --prefix backend/apps/server run build
```

### 3.3. Run Server
```bash
# Production mode (dist)
npm --prefix backend/apps/server run start

# Development with mock server flag
npm --prefix backend/apps/server run dev:mock
```

### 3.4. Run Frontend Client
```bash
npm --prefix frontend run dev
# Access http://localhost:5173
```

---

## 4. Production Docker Deployment

A multi-stage Node 24 production Dockerfile is located at [backend/apps/server/Dockerfile](file:///D:/docuu/backend/apps/server/Dockerfile).

### 4.1. Build Docker Image
```bash
docker build -t folk-tag-server:0.1.0 -f backend/apps/server/Dockerfile .
```

### 4.2. Run Container with Persistent Volume
```bash
docker run -d \
  --name folk-tag-server \
  --restart unless-stopped \
  -p 3001:3001 \
  -v folk-tag-data:/app/backend/apps/server/data \
  -e PORT=3001 \
  -e CLIENT_ORIGIN="*" \
  -e NODE_ENV="production" \
  folk-tag-server:0.1.0
```

### 4.3. Docker Compose (Optional)
```yaml
version: '3.8'

services:
  game-server:
    image: folk-tag-server:0.1.0
    build:
      context: .
      dockerfile: backend/apps/server/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - CLIENT_ORIGIN=*
      - NODE_ENV=production
    volumes:
      - game-data:/app/backend/apps/server/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 3

volumes:
  game-data:
```

---

## 5. Environment Variables

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Number | `3001` | TCP port for HTTP and Socket.IO server. |
| `CLIENT_ORIGIN` | String | `*` | Allowed CORS origins for HTTP API and WebSocket handshakes. |
| `DB_PATH` | String | `./data/game.db` | Absolute or relative file path to the SQLite persistent database. |
| `NODE_ENV` | String | `production` | Execution environment (`production` or `development`). |

---

## 6. Operational REST Endpoints

### 6.1. Health Check (`GET /healthz`)
Deep health probe verifying Node process health, memory footprint, uptime, protocol version, and live SQLite database connectivity (`SELECT 1`).
```json
{
  "status": "ok",
  "db": "sqlite",
  "version": 1,
  "uptimeSeconds": 1420,
  "memory": {
    "heapUsedMb": 38.4,
    "heapTotalMb": 54.2,
    "rssMb": 82.1
  },
  "timestamp": 1732014000000
}
```

### 6.2. Simulation Metrics & Profiler (`GET /api/metrics`)
High-resolution simulation performance monitoring per room and globally, tracking rolling 300-tick performance:
```json
{
  "uptimeSeconds": 1420,
  "memory": { "heapUsedMb": 38.4, "heapTotalMb": 54.2, "rssMb": 82.1 },
  "rooms": {
    "activeCount": 2,
    "totalPlayers": 12,
    "details": [
      {
        "roomCode": "ABC123",
        "totalTicks": 4500,
        "lastTickMs": 0.42,
        "avgTickMs": 0.51,
        "maxTickMs": 2.15,
        "p95TickMs": 1.10,
        "p99TickMs": 1.80,
        "phase": "PLAYING",
        "playerCount": 6
      }
    ]
  },
  "simulation": {
    "targetHz": 30,
    "avgTickMs": 0.51,
    "maxTickMs": 2.15,
    "p95TickMs": 1.10
  }
}
```

### 6.3. Configurable Game Rules & Tuning (`GET /api/rules`, `POST /api/rules/tune`, `POST /api/rules/reset`)
- `GET /api/rules`: Returns current runtime rules version (`RULES_VERSION = 1`) and all physics/gameplay constants.
- `POST /api/rules/tune`: Overrides specific gameplay parameters on the fly without server restart:
  ```json
  {
    "CAPTURE_MAX_DISTANCE_M": 1.45,
    "CAPTURE_COOLDOWN_MS": 1300
  }
  ```
- `POST /api/rules/reset`: Resets active rules to canon default values.

### 6.4. Playtest Telemetry & Balance Analytics (`GET /api/stats/balance`)
Aggregates match telemetry against `GAMEPLAY.md:78` balance targets:
```json
{
  "sampleSize": 25,
  "completedMatches": 25,
  "abortedMatches": 0,
  "policeWins": 13,
  "robberWins": 12,
  "policeWinRate": 52.0,
  "robberWinRate": 48.0,
  "avgDurationSeconds": 184.2,
  "avgCapturesPerMatch": 3.4,
  "avgRescuesPerMatch": 1.6,
  "matchesWithRescuePercent": 64.0,
  "avgFirstCaptureTimeSeconds": 48.2,
  "byJail": {
    "J1": { "totalMatches": 9, "policeWinRate": 55.5, "robberWinRate": 44.5 },
    "J2": { "totalMatches": 8, "policeWinRate": 50.0, "robberWinRate": 50.0 },
    "J3": { "totalMatches": 8, "policeWinRate": 50.0, "robberWinRate": 50.0 }
  },
  "evaluation": {
    "targetWinRateMet": true,
    "firstCaptureTargetMet": true,
    "rescueTargetMet": true,
    "isBalanced": true,
    "recommendations": [
      "Tỷ lệ thắng cân bằng trong mục tiêu 45–55%.",
      "Thời gian bắt đầu tiên đạt chuẩn 30–90s.",
      "Tỷ lệ trận có giải cứu đạt chuẩn (≥50%)."
    ]
  }
}
```

---

## 7. Socket.IO Protocol Reference

### Client Events
- `room:create`: `{ requestId, name, protocolVersion: 1 }`
- `room:join`: `{ requestId, roomCode, name, protocolVersion: 1 }`
- `room:ready`: `{ ready: boolean }`
- `room:select_jail`: `{ jailId: 'J1' | 'J2' | 'J3' }` (Police captain only)
- `room:restart`: `{ requestId }` (Host only, only when phase is `RESULT`)
- `room:leave`: `{}`
- `game:input`: `{ seq, moveX, moveZ, sprint, crouch, rescueHeld, yaw, pitch, jumpId, captureId }`

### Server Events
- `room:state`: Complete lobby and player roster view (`RoomState`).
- `game:snapshot`: 15Hz authoritative game state (`Snapshot`).
- `game:event`: Discrete timeline event (`GameEvent`: `PHASE`, `CAPTURE`, `RESCUE`, `GUARD_CHANGED`, `RESULT`).

---

## 8. Verification & Test Execution

Run the complete test suite:
```bash
# 1. Run all unit & integration tests
npm --prefix backend/apps/server test

# 2. Run automated playtest balance simulation (25 matches)
npm --prefix backend/apps/server run test:playtests

# 3. Run multi-room concurrent stress test (5 rooms, 30 clients at 30Hz)
npm --prefix backend/apps/server run test:load
```
