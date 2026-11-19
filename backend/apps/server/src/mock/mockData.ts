import type { PlayerView, SelfPlayerView, Role, RobberState, Vec3 } from '@folk-tag/shared';

export interface MockBotState {
  id: string;
  role: Role;
  pos: Vec3;
  yaw: number;
  vel: Vec3;
  crouch: boolean;
  grounded: boolean;
  state?: RobberState;
  guard?: boolean;
  connected: boolean;
  stamina: number;
  // Patrol waypoints for realistic simulation
  baseCenter: Vec3;
  patrolRadius: number;
  patrolSpeed: number;
  patrolAngle: number;
}

export const INITIAL_MOCK_BOTS: MockBotState[] = [
  {
    id: 'police-1',
    role: 'POLICE',
    pos: [-2.0, 0.0, -18.0],
    yaw: 0.0,
    vel: [0.0, 0.0, 0.0],
    crouch: false,
    grounded: true,
    guard: false,
    connected: true,
    stamina: 100.0,
    baseCenter: [-2.0, 0.0, -18.0],
    patrolRadius: 3.0,
    patrolSpeed: 0.8,
    patrolAngle: 0.0,
  },
  {
    id: 'police-2',
    role: 'POLICE',
    pos: [2.0, 0.0, -18.0],
    yaw: 0.0,
    vel: [0.0, 0.0, 0.0],
    crouch: false,
    grounded: true,
    guard: false,
    connected: true,
    stamina: 100.0,
    baseCenter: [2.0, 0.0, -18.0],
    patrolRadius: 3.5,
    patrolSpeed: 0.6,
    patrolAngle: Math.PI / 2,
  },
  {
    id: 'robber-1',
    role: 'ROBBER',
    pos: [-23.0, 0.0, 0.0],
    yaw: 0.0,
    vel: [0.0, 0.0, 0.0],
    crouch: false,
    grounded: true,
    state: 'FREE',
    connected: true,
    stamina: 100.0,
    baseCenter: [-23.0, 0.0, 0.0],
    patrolRadius: 4.0,
    patrolSpeed: 1.0,
    patrolAngle: Math.PI,
  },
  {
    id: 'robber-2',
    role: 'ROBBER',
    pos: [25.0, 0.0, 0.0],
    yaw: 0.0,
    vel: [0.0, 0.0, 0.0],
    crouch: false,
    grounded: true,
    state: 'FREE',
    connected: true,
    stamina: 100.0,
    baseCenter: [25.0, 0.0, 0.0],
    patrolRadius: 4.0,
    patrolSpeed: 0.9,
    patrolAngle: (3 * Math.PI) / 2,
  },
  {
    id: 'robber-3',
    role: 'ROBBER',
    pos: [-10.0, 0.0, 20.0],
    yaw: 0.0,
    vel: [0.0, 0.0, 0.0],
    crouch: false,
    grounded: true,
    state: 'FREE',
    connected: true,
    stamina: 100.0,
    baseCenter: [-10.0, 0.0, 20.0],
    patrolRadius: 3.0,
    patrolSpeed: 0.7,
    patrolAngle: Math.PI / 4,
  },
  {
    id: 'robber-4',
    role: 'ROBBER',
    pos: [10.0, 0.0, 25.0],
    yaw: 0.0,
    vel: [0.0, 0.0, 0.0],
    crouch: false,
    grounded: true,
    state: 'FREE',
    connected: true,
    stamina: 100.0,
    baseCenter: [10.0, 0.0, 25.0],
    patrolRadius: 3.5,
    patrolSpeed: 0.85,
    patrolAngle: (5 * Math.PI) / 4,
  },
];

/**
 * Advances the simulation state of mock bots by dt seconds.
 */
export function updateMockBots(bots: MockBotState[], dt: number): void {
  for (const bot of bots) {
    bot.patrolAngle += bot.patrolSpeed * dt;
    if (bot.patrolAngle > Math.PI * 2) {
      bot.patrolAngle -= Math.PI * 2;
    }

    // Circular/elliptical patrol path around baseCenter
    const targetX = bot.baseCenter[0] + Math.cos(bot.patrolAngle) * bot.patrolRadius;
    const targetZ = bot.baseCenter[2] + Math.sin(bot.patrolAngle) * bot.patrolRadius;

    const dx = targetX - bot.pos[0];
    const dz = targetZ - bot.pos[2];

    const currentVelX = dt > 0 ? dx / dt : 0;
    const currentVelZ = dt > 0 ? dz / dt : 0;

    bot.vel = [currentVelX, 0, currentVelZ];
    bot.pos = [targetX, bot.pos[1], targetZ];

    // Face movement direction
    if (Math.hypot(dx, dz) > 0.001) {
      bot.yaw = Math.atan2(dx, -dz);
    }
  }
}

export function toPlayerView(bot: MockBotState): PlayerView {
  const view: PlayerView = {
    id: bot.id,
    role: bot.role,
    pos: [...bot.pos],
    yaw: bot.yaw,
    vel: [...bot.vel],
    crouch: bot.crouch,
    grounded: bot.grounded,
    connected: bot.connected,
  };
  if (bot.role === 'ROBBER' && bot.state) {
    view.state = bot.state;
  }
  if (bot.role === 'POLICE' && bot.guard !== undefined) {
    view.guard = bot.guard;
  }
  return view;
}

export function toSelfPlayerView(
  bot: MockBotState,
  ackSeq = 0,
  ackJumpId = 0,
  ackCaptureId = 0
): SelfPlayerView {
  const base = toPlayerView(bot);
  return {
    ...base,
    stamina: bot.stamina,
    ackSeq,
    ackJumpId,
    ackCaptureId,
    immuneRemainingMs: 0,
    rescueProgressMs: 0,
  };
}
