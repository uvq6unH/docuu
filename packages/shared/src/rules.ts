export interface MovementRoleProfile {
  walk: number;
  sprint: number;
  drainPerSecond: number;
}

export interface MovementRules {
  tickHz: number;
  maxCatchUpTicks: number;
  maxSubstep: number;
  radius: number;
  standingHeight: number;
  crouchHeight: number;
  eyeHeight: number;
  crouchEyeHeight: number;
  gravity: number;
  jumpSpeed: number;
  crouchSpeed: number;
  maxStamina: number;
  resumeStamina: number;
  regenPerSecond: number;
  regenDelaySeconds: number;
  roles: {
    POLICE: MovementRoleProfile;
    ROBBER: MovementRoleProfile;
  };
}

export const movementRules: MovementRules = {
  tickHz: 30,
  maxCatchUpTicks: 5,
  maxSubstep: 0.15,
  radius: 0.35,
  standingHeight: 1.7,
  crouchHeight: 1.1,
  eyeHeight: 1.55,
  crouchEyeHeight: 0.95,
  gravity: 18,
  jumpSpeed: 5.8,
  crouchSpeed: 2.5,
  maxStamina: 100,
  resumeStamina: 20,
  regenPerSecond: 16,
  regenDelaySeconds: 1.2,
  roles: {
    POLICE: { walk: 5.2, sprint: 7, drainPerSecond: 20 },
    ROBBER: { walk: 4.8, sprint: 7.5, drainPerSecond: 16 },
  },
};

export const RULES_VERSION = 1;

export interface GameRules {
  // Tick & Timing
  SIMULATION_TICK_RATE_HZ: number;
  SIMULATION_TIMESTEP_SEC: number;
  SIMULATION_TIMESTEP_MS: number;
  SNAPSHOT_BROADCAST_RATE_HZ: number;
  SNAPSHOT_BROADCAST_INTERVAL_MS: number;
  /**
   * Client-side accumulator clamping limit (maxCatchUpTicks = 5, equivalent to 166ms)
   * used by the client simulation loop when tab loses focus or frames hitch, preventing lag spirals.
   * On the authoritative server, catch-up is governed strictly by real-time simulationStepBudget (max burst = 2).
   */
  MAX_CATCHUP_STEPS: number;
  INPUT_STALE_TIMEOUT_MS: number;
  REQUEST_DEDUPLICATION_TTL_MS: number;
  IDLE_LOBBY_TIMEOUT_MS: number;
  DISCONNECT_GRACE_TIMEOUT_MS: number;

  // Phases duration
  PHASE_DURATION_JAIL_SELECTION_MS: number;
  PHASE_DURATION_HEAD_START_MS: number;
  PHASE_DURATION_PLAYING_MS: number;
  PHASE_DURATION_RESULT_MS: number;

  // Team requirements
  REQUIRED_PLAYERS: number;
  POLICE_COUNT: number;
  ROBBER_COUNT: number;

  // Map Bounds
  MAP_SIZE: number;
  MAP_MIN_COORD: number;
  MAP_MAX_COORD: number;
  MAP_GROUND_Y: number;

  // Physical Capsule
  CAPSULE_RADIUS: number;
  CAPSULE_HEIGHT_STANDING: number;
  CAPSULE_HEIGHT_CROUCHING: number;
  CAMERA_HEIGHT_STANDING: number;
  CAMERA_HEIGHT_CROUCHING: number;
  COLLISION_MAX_SUBSTEP_M: number;

  // Physics
  GRAVITY: number;
  JUMP_VELOCITY: number;
  JUMPABLE_FENCE_HEIGHT: number;

  // Movement & Stamina: Police
  POLICE_WALK_SPEED: number;
  POLICE_SPRINT_SPEED: number;
  POLICE_CROUCH_SPEED: number;
  POLICE_STAMINA_MAX: number;
  POLICE_STAMINA_DRAIN_PER_SEC: number;
  POLICE_STAMINA_REGEN_PER_SEC: number;

  // Movement & Stamina: Robber
  ROBBER_WALK_SPEED: number;
  ROBBER_SPRINT_SPEED: number;
  ROBBER_CROUCH_SPEED: number;
  ROBBER_STAMINA_MAX: number;
  ROBBER_STAMINA_DRAIN_PER_SEC: number;
  ROBBER_STAMINA_REGEN_PER_SEC: number;

  // Shared Stamina Rules
  STAMINA_REGEN_DELAY_MS: number;
  STAMINA_SPRINT_RESTART_THRESHOLD: number;

  // Capture
  CAPTURE_MAX_DISTANCE_M: number;
  CAPTURE_NETWORK_TOLERANCE_MARGIN_M: number;
  CAPTURE_MAX_HEIGHT_DELTA_M: number;
  CAPTURE_MAX_ANGLE_DEG: number;
  CAPTURE_NETWORK_TOLERANCE_MARGIN_DEG: number;
  CAPTURE_COOLDOWN_MS: number;

  // Jail & Rescue
  RESCUE_RADIUS_M: number;
  RESCUE_NETWORK_TOLERANCE_MARGIN_M: number;
  RESCUE_REQUIRED_HOLD_MS: number;
  RESCUE_IMMUNITY_DURATION_MS: number;
  GUARD_ZONE_RADIUS_M: number;
  MAX_GUARDS_ALLOWED: number;

  // Stealth / Hide
  HIDE_CROUCH_TRIGGER_MS: number;
  HIDDEN_VISIBILITY_PROXIMITY_M: number;
}

export const DEFAULT_GAME_RULES: GameRules = {
  // Tick & Timing
  SIMULATION_TICK_RATE_HZ: movementRules.tickHz,
  SIMULATION_TIMESTEP_SEC: 1 / movementRules.tickHz,
  SIMULATION_TIMESTEP_MS: 1000 / movementRules.tickHz,
  SNAPSHOT_BROADCAST_RATE_HZ: 15,
  SNAPSHOT_BROADCAST_INTERVAL_MS: 1000 / 15,
  MAX_CATCHUP_STEPS: movementRules.maxCatchUpTicks,
  INPUT_STALE_TIMEOUT_MS: 600,
  REQUEST_DEDUPLICATION_TTL_MS: 60_000,
  IDLE_LOBBY_TIMEOUT_MS: 15 * 60_000,
  DISCONNECT_GRACE_TIMEOUT_MS: 30_000,

  // Phases duration
  PHASE_DURATION_JAIL_SELECTION_MS: 20_000,
  PHASE_DURATION_HEAD_START_MS: 15_000,
  PHASE_DURATION_PLAYING_MS: 300_000,
  PHASE_DURATION_RESULT_MS: 15_000,

  // Team requirements
  REQUIRED_PLAYERS: 6,
  POLICE_COUNT: 2,
  ROBBER_COUNT: 4,

  // Map Bounds
  MAP_SIZE: 80.0,
  MAP_MIN_COORD: -40.0,
  MAP_MAX_COORD: 40.0,
  MAP_GROUND_Y: 0.0,

  // Physical Capsule
  CAPSULE_RADIUS: movementRules.radius,
  CAPSULE_HEIGHT_STANDING: movementRules.standingHeight,
  CAPSULE_HEIGHT_CROUCHING: movementRules.crouchHeight,
  CAMERA_HEIGHT_STANDING: movementRules.eyeHeight,
  CAMERA_HEIGHT_CROUCHING: movementRules.crouchEyeHeight,
  COLLISION_MAX_SUBSTEP_M: movementRules.maxSubstep,

  // Physics
  GRAVITY: movementRules.gravity,
  JUMP_VELOCITY: movementRules.jumpSpeed,
  JUMPABLE_FENCE_HEIGHT: 0.65,

  // Movement & Stamina: Police
  POLICE_WALK_SPEED: movementRules.roles.POLICE.walk,
  POLICE_SPRINT_SPEED: movementRules.roles.POLICE.sprint,
  POLICE_CROUCH_SPEED: movementRules.crouchSpeed,
  POLICE_STAMINA_MAX: movementRules.maxStamina,
  POLICE_STAMINA_DRAIN_PER_SEC: movementRules.roles.POLICE.drainPerSecond,
  POLICE_STAMINA_REGEN_PER_SEC: movementRules.regenPerSecond,

  // Movement & Stamina: Robber
  ROBBER_WALK_SPEED: movementRules.roles.ROBBER.walk,
  ROBBER_SPRINT_SPEED: movementRules.roles.ROBBER.sprint,
  ROBBER_CROUCH_SPEED: movementRules.crouchSpeed,
  ROBBER_STAMINA_MAX: movementRules.maxStamina,
  ROBBER_STAMINA_DRAIN_PER_SEC: movementRules.roles.ROBBER.drainPerSecond,
  ROBBER_STAMINA_REGEN_PER_SEC: movementRules.regenPerSecond,

  // Shared Stamina Rules
  STAMINA_REGEN_DELAY_MS: movementRules.regenDelaySeconds * 1000,
  STAMINA_SPRINT_RESTART_THRESHOLD: movementRules.resumeStamina,

  // Capture
  CAPTURE_MAX_DISTANCE_M: 1.6,
  CAPTURE_NETWORK_TOLERANCE_MARGIN_M: 0.4,
  CAPTURE_MAX_HEIGHT_DELTA_M: 1.0,
  CAPTURE_MAX_ANGLE_DEG: 55.0, // ±55 degrees horizontally
  CAPTURE_NETWORK_TOLERANCE_MARGIN_DEG: 10.0,
  CAPTURE_COOLDOWN_MS: 1100,

  // Jail & Rescue
  RESCUE_RADIUS_M: 1.25,
  RESCUE_NETWORK_TOLERANCE_MARGIN_M: 0.5,
  RESCUE_REQUIRED_HOLD_MS: 2000, // Exactly 2 seconds
  RESCUE_IMMUNITY_DURATION_MS: 3000, // Exactly 3 seconds
  GUARD_ZONE_RADIUS_M: 5.0,
  MAX_GUARDS_ALLOWED: 1,

  // Stealth / Hide
  HIDE_CROUCH_TRIGGER_MS: 400,
  HIDDEN_VISIBILITY_PROXIMITY_M: 2.0,
};

export const GAME_RULES: GameRules = DEFAULT_GAME_RULES;

/**
 * Whitelist of gameplay balance knobs that are safe to hot-apply to running rooms
 * during live admin tuning. Structural and match-lifecycle keys (e.g. REQUIRED_PLAYERS,
 * POLICE_COUNT, ROBBER_COUNT, PHASE_DURATION_*, MAP_*, MAX_GUARDS_ALLOWED) remain locked
 * per room at creation time to prevent breaking active match invariants.
 */
export const HOT_APPLY_BALANCE_RULE_KEYS: ReadonlySet<keyof GameRules> = new Set<keyof GameRules>([
  // Movement & Stamina: Police
  'POLICE_WALK_SPEED',
  'POLICE_SPRINT_SPEED',
  'POLICE_CROUCH_SPEED',
  'POLICE_STAMINA_MAX',
  'POLICE_STAMINA_DRAIN_PER_SEC',
  'POLICE_STAMINA_REGEN_PER_SEC',

  // Movement & Stamina: Robber
  'ROBBER_WALK_SPEED',
  'ROBBER_SPRINT_SPEED',
  'ROBBER_CROUCH_SPEED',
  'ROBBER_STAMINA_MAX',
  'ROBBER_STAMINA_DRAIN_PER_SEC',
  'ROBBER_STAMINA_REGEN_PER_SEC',

  // Shared Stamina Rules
  'STAMINA_REGEN_DELAY_MS',
  'STAMINA_SPRINT_RESTART_THRESHOLD',

  // Capture
  'CAPTURE_MAX_DISTANCE_M',
  'CAPTURE_NETWORK_TOLERANCE_MARGIN_M',
  'CAPTURE_MAX_HEIGHT_DELTA_M',
  'CAPTURE_MAX_ANGLE_DEG',
  'CAPTURE_NETWORK_TOLERANCE_MARGIN_DEG',
  'CAPTURE_COOLDOWN_MS',

  // Jail & Rescue
  'RESCUE_RADIUS_M',
  'RESCUE_NETWORK_TOLERANCE_MARGIN_M',
  'RESCUE_REQUIRED_HOLD_MS',
  'RESCUE_IMMUNITY_DURATION_MS',
  'GUARD_ZONE_RADIUS_M',

  // Stealth / Hide
  'HIDE_CROUCH_TRIGGER_MS',
  'HIDDEN_VISIBILITY_PROXIMITY_M',

  // Physics Forces & Jumping (dynamic movement forces, safe to hot-apply)
  'GRAVITY',
  'JUMP_VELOCITY',
  'JUMPABLE_FENCE_HEIGHT',

  // Network / Snapshot
  'SNAPSHOT_BROADCAST_RATE_HZ',
  'SNAPSHOT_BROADCAST_INTERVAL_MS',
  'INPUT_STALE_TIMEOUT_MS',
]);

export function createGameRules(overrides?: Partial<GameRules>): GameRules {
  return {
    ...DEFAULT_GAME_RULES,
    ...overrides,
  };
}

const IMMUTABLE_PROTOCOL_RULES = new Set([
  'SIMULATION_TICK_RATE_HZ',
  'SIMULATION_TIMESTEP_SEC',
  'SIMULATION_TIMESTEP_MS',
]);

const RULE_BOUNDS: Record<string, { min: number; max: number; integer?: boolean }> = {
  // Broadcast
  SNAPSHOT_BROADCAST_RATE_HZ: { min: 1, max: 30, integer: true },
  SNAPSHOT_BROADCAST_INTERVAL_MS: { min: 33, max: 1000 },
  MAX_CATCHUP_STEPS: { min: 1, max: 10, integer: true },
  INPUT_STALE_TIMEOUT_MS: { min: 200, max: 5_000 },
  REQUEST_DEDUPLICATION_TTL_MS: { min: 10_000, max: 300_000 },
  IDLE_LOBBY_TIMEOUT_MS: { min: 60_000, max: 3_600_000 },
  DISCONNECT_GRACE_TIMEOUT_MS: { min: 5_000, max: 120_000 },

  // Phases
  PHASE_DURATION_JAIL_SELECTION_MS: { min: 5_000, max: 120_000 },
  PHASE_DURATION_HEAD_START_MS: { min: 0, max: 60_000 },
  PHASE_DURATION_PLAYING_MS: { min: 30_000, max: 1_800_000 },
  PHASE_DURATION_RESULT_MS: { min: 5_000, max: 60_000 },

  // Team
  REQUIRED_PLAYERS: { min: 2, max: 32, integer: true },
  POLICE_COUNT: { min: 1, max: 16, integer: true },
  ROBBER_COUNT: { min: 1, max: 16, integer: true },

  // Map Bounds
  MAP_SIZE: { min: 20.0, max: 500.0 },
  MAP_MIN_COORD: { min: -500.0, max: 0.0 },
  MAP_MAX_COORD: { min: 0.0, max: 500.0 },
  MAP_GROUND_Y: { min: -100.0, max: 100.0 },

  // Physical Capsule
  CAPSULE_RADIUS: { min: 0.1, max: 2.0 },
  CAPSULE_HEIGHT_STANDING: { min: 0.8, max: 3.0 },
  CAPSULE_HEIGHT_CROUCHING: { min: 0.4, max: 2.0 },
  CAMERA_HEIGHT_STANDING: { min: 0.6, max: 3.0 },
  CAMERA_HEIGHT_CROUCHING: { min: 0.3, max: 2.0 },
  COLLISION_MAX_SUBSTEP_M: { min: 0.05, max: 1.0 },

  // Physics
  GRAVITY: { min: 1.0, max: 50.0 },
  JUMP_VELOCITY: { min: 1.0, max: 20.0 },
  JUMPABLE_FENCE_HEIGHT: { min: 0.1, max: 2.0 },

  // Movement & Stamina: Police
  POLICE_WALK_SPEED: { min: 0.5, max: 30.0 },
  POLICE_SPRINT_SPEED: { min: 0.5, max: 30.0 },
  POLICE_CROUCH_SPEED: { min: 0.5, max: 30.0 },
  POLICE_STAMINA_MAX: { min: 10.0, max: 500.0 },
  POLICE_STAMINA_DRAIN_PER_SEC: { min: 1.0, max: 100.0 },
  POLICE_STAMINA_REGEN_PER_SEC: { min: 1.0, max: 100.0 },

  // Movement & Stamina: Robber
  ROBBER_WALK_SPEED: { min: 0.5, max: 30.0 },
  ROBBER_SPRINT_SPEED: { min: 0.5, max: 30.0 },
  ROBBER_CROUCH_SPEED: { min: 0.5, max: 30.0 },
  ROBBER_STAMINA_MAX: { min: 10.0, max: 500.0 },
  ROBBER_STAMINA_DRAIN_PER_SEC: { min: 1.0, max: 100.0 },
  ROBBER_STAMINA_REGEN_PER_SEC: { min: 1.0, max: 100.0 },

  // Shared Stamina
  STAMINA_REGEN_DELAY_MS: { min: 100, max: 10_000 },
  STAMINA_SPRINT_RESTART_THRESHOLD: { min: 5.0, max: 100.0 },

  // Capture
  CAPTURE_MAX_DISTANCE_M: { min: 0.5, max: 10.0 },
  CAPTURE_NETWORK_TOLERANCE_MARGIN_M: { min: 0.0, max: 5.0 },
  CAPTURE_MAX_HEIGHT_DELTA_M: { min: 0.2, max: 5.0 },
  CAPTURE_MAX_ANGLE_DEG: { min: 10.0, max: 180.0 },
  CAPTURE_NETWORK_TOLERANCE_MARGIN_DEG: { min: 0.0, max: 90.0 },
  CAPTURE_COOLDOWN_MS: { min: 200, max: 10_000 },

  // Jail & Rescue
  RESCUE_RADIUS_M: { min: 0.5, max: 10.0 },
  RESCUE_NETWORK_TOLERANCE_MARGIN_M: { min: 0.0, max: 5.0 },
  RESCUE_REQUIRED_HOLD_MS: { min: 500, max: 10_000 },
  RESCUE_IMMUNITY_DURATION_MS: { min: 500, max: 10_000 },
  GUARD_ZONE_RADIUS_M: { min: 1.0, max: 20.0 },
  MAX_GUARDS_ALLOWED: { min: 1, max: 5, integer: true },

  // Stealth
  HIDE_CROUCH_TRIGGER_MS: { min: 50, max: 2_000 },
  HIDDEN_VISIBILITY_PROXIMITY_M: { min: 0.5, max: 10.0 },
};

export function validateGameRulesOverrides(
  overrides: unknown,
  baseRules: GameRules = DEFAULT_GAME_RULES
): {
  valid: boolean;
  error?: string;
  cleanOverrides?: Partial<GameRules>;
} {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return { valid: false, error: 'Rule overrides must be a non-null object' };
  }

  const entries = Object.entries(overrides as Record<string, unknown>);
  if (entries.length === 0) {
    return { valid: false, error: 'Empty rule overrides provided' };
  }

  const clean: Partial<GameRules> = {};

  for (const [key, val] of entries) {
    if (IMMUTABLE_PROTOCOL_RULES.has(key)) {
      return { valid: false, error: `Rule "${key}" is fixed by protocol and cannot be tuned at runtime` };
    }

    if (!Object.prototype.hasOwnProperty.call(DEFAULT_GAME_RULES, key)) {
      return { valid: false, error: `Invalid or unknown rule key: "${key}"` };
    }

    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return { valid: false, error: `Rule "${key}" must be a finite number` };
    }

    const bounds = RULE_BOUNDS[key];
    if (bounds) {
      if (bounds.integer && !Number.isInteger(val)) {
        return { valid: false, error: `Rule "${key}" must be an integer` };
      }
      if (val < bounds.min || val > bounds.max) {
        return { valid: false, error: `Rule "${key}" must be between ${bounds.min} and ${bounds.max}` };
      }
    } else {
      if (val <= 0) {
        return { valid: false, error: `Rule "${key}" must be greater than 0` };
      }
    }

    (clean as any)[key] = val;
  }

  // Cross-field consistency checks evaluated against the active baseRules:
  const standingH = clean.CAPSULE_HEIGHT_STANDING ?? baseRules.CAPSULE_HEIGHT_STANDING;
  const crouchH = clean.CAPSULE_HEIGHT_CROUCHING ?? baseRules.CAPSULE_HEIGHT_CROUCHING;
  if (crouchH >= standingH) {
    return { valid: false, error: `CAPSULE_HEIGHT_CROUCHING (${crouchH}) must be strictly less than CAPSULE_HEIGHT_STANDING (${standingH})` };
  }

  const standingEye = clean.CAMERA_HEIGHT_STANDING ?? baseRules.CAMERA_HEIGHT_STANDING;
  const crouchEye = clean.CAMERA_HEIGHT_CROUCHING ?? baseRules.CAMERA_HEIGHT_CROUCHING;
  if (crouchEye >= standingEye) {
    return { valid: false, error: `CAMERA_HEIGHT_CROUCHING (${crouchEye}) must be strictly less than CAMERA_HEIGHT_STANDING (${standingEye})` };
  }

  const polWalk = clean.POLICE_WALK_SPEED ?? baseRules.POLICE_WALK_SPEED;
  const polSprint = clean.POLICE_SPRINT_SPEED ?? baseRules.POLICE_SPRINT_SPEED;
  if (polWalk >= polSprint) {
    return { valid: false, error: `POLICE_WALK_SPEED (${polWalk}) must be strictly less than POLICE_SPRINT_SPEED (${polSprint})` };
  }

  const robWalk = clean.ROBBER_WALK_SPEED ?? baseRules.ROBBER_WALK_SPEED;
  const robSprint = clean.ROBBER_SPRINT_SPEED ?? baseRules.ROBBER_SPRINT_SPEED;
  if (robWalk >= robSprint) {
    return { valid: false, error: `ROBBER_WALK_SPEED (${robWalk}) must be strictly less than ROBBER_SPRINT_SPEED (${robSprint})` };
  }

  const reqPlayers = clean.REQUIRED_PLAYERS ?? baseRules.REQUIRED_PLAYERS;
  const polCount = clean.POLICE_COUNT ?? baseRules.POLICE_COUNT;
  const robCount = clean.ROBBER_COUNT ?? baseRules.ROBBER_COUNT;
  if (polCount + robCount !== reqPlayers) {
    return { valid: false, error: `POLICE_COUNT (${polCount}) + ROBBER_COUNT (${robCount}) must equal REQUIRED_PLAYERS (${reqPlayers})` };
  }

  const minCoord = clean.MAP_MIN_COORD ?? baseRules.MAP_MIN_COORD;
  const maxCoord = clean.MAP_MAX_COORD ?? baseRules.MAP_MAX_COORD;
  if (minCoord >= maxCoord) {
    return { valid: false, error: `MAP_MIN_COORD (${minCoord}) must be strictly less than MAP_MAX_COORD (${maxCoord})` };
  }

  if (clean.MAP_SIZE !== undefined) {
    if (Math.abs(clean.MAP_SIZE - (maxCoord - minCoord)) > 0.001) {
      return { valid: false, error: `MAP_SIZE (${clean.MAP_SIZE}) must equal MAP_MAX_COORD - MAP_MIN_COORD (${maxCoord - minCoord})` };
    }
  } else if (clean.MAP_MIN_COORD !== undefined || clean.MAP_MAX_COORD !== undefined) {
    clean.MAP_SIZE = maxCoord - minCoord;
  }

  // Sync SNAPSHOT_BROADCAST_INTERVAL_MS and SNAPSHOT_BROADCAST_RATE_HZ if either was tuned,
  // taking into account discrete simulation tick quantization (SIMULATION_TICK_RATE_HZ = 30Hz)
  const simTickHz = (clean.SIMULATION_TICK_RATE_HZ ?? baseRules.SIMULATION_TICK_RATE_HZ) || 30;
  if (clean.SNAPSHOT_BROADCAST_RATE_HZ !== undefined && clean.SNAPSHOT_BROADCAST_INTERVAL_MS !== undefined) {
    const ticksFromRate = Math.max(1, Math.round(simTickHz / clean.SNAPSHOT_BROADCAST_RATE_HZ));
    const rawHzFromInterval = Math.max(1, Math.round(1000 / clean.SNAPSHOT_BROADCAST_INTERVAL_MS));
    const ticksFromInterval = Math.max(1, Math.round(simTickHz / rawHzFromInterval));
    if (ticksFromRate !== ticksFromInterval) {
      return {
        valid: false,
        error: `Conflicting snapshot broadcast settings: SNAPSHOT_BROADCAST_RATE_HZ (${clean.SNAPSHOT_BROADCAST_RATE_HZ}Hz -> ${Math.round(simTickHz / ticksFromRate)}Hz effective) conflicts with SNAPSHOT_BROADCAST_INTERVAL_MS (${clean.SNAPSHOT_BROADCAST_INTERVAL_MS}ms -> ${Math.round(simTickHz / ticksFromInterval)}Hz effective)`,
      };
    }
    clean.SNAPSHOT_BROADCAST_RATE_HZ = Math.round(simTickHz / ticksFromRate);
    clean.SNAPSHOT_BROADCAST_INTERVAL_MS = (ticksFromRate / simTickHz) * 1000;
  } else if (clean.SNAPSHOT_BROADCAST_INTERVAL_MS !== undefined && clean.SNAPSHOT_BROADCAST_RATE_HZ === undefined) {
    const rawHz = Math.max(1, Math.round(1000 / clean.SNAPSHOT_BROADCAST_INTERVAL_MS));
    const ticks = Math.max(1, Math.round(simTickHz / rawHz));
    clean.SNAPSHOT_BROADCAST_RATE_HZ = Math.round(simTickHz / ticks);
    clean.SNAPSHOT_BROADCAST_INTERVAL_MS = (ticks / simTickHz) * 1000;
  } else if (clean.SNAPSHOT_BROADCAST_RATE_HZ !== undefined && clean.SNAPSHOT_BROADCAST_INTERVAL_MS === undefined) {
    const ticks = Math.max(1, Math.round(simTickHz / clean.SNAPSHOT_BROADCAST_RATE_HZ));
    clean.SNAPSHOT_BROADCAST_RATE_HZ = Math.round(simTickHz / ticks);
    clean.SNAPSHOT_BROADCAST_INTERVAL_MS = (ticks / simTickHz) * 1000;
  }

  return { valid: true, cleanOverrides: clean };
}

export function movementRulesFromGameRules(gameRules: GameRules): MovementRules {
  return {
    tickHz: gameRules.SIMULATION_TICK_RATE_HZ,
    maxCatchUpTicks: gameRules.MAX_CATCHUP_STEPS,
    maxSubstep: gameRules.COLLISION_MAX_SUBSTEP_M,
    radius: gameRules.CAPSULE_RADIUS,
    standingHeight: gameRules.CAPSULE_HEIGHT_STANDING,
    crouchHeight: gameRules.CAPSULE_HEIGHT_CROUCHING,
    eyeHeight: gameRules.CAMERA_HEIGHT_STANDING,
    crouchEyeHeight: gameRules.CAMERA_HEIGHT_CROUCHING,
    gravity: gameRules.GRAVITY,
    jumpSpeed: gameRules.JUMP_VELOCITY,
    crouchSpeed: gameRules.POLICE_CROUCH_SPEED,
    maxStamina: gameRules.POLICE_STAMINA_MAX,
    resumeStamina: gameRules.STAMINA_SPRINT_RESTART_THRESHOLD,
    regenPerSecond: gameRules.POLICE_STAMINA_REGEN_PER_SEC,
    regenDelaySeconds: gameRules.STAMINA_REGEN_DELAY_MS / 1000,
    roles: {
      POLICE: {
        walk: gameRules.POLICE_WALK_SPEED,
        sprint: gameRules.POLICE_SPRINT_SPEED,
        drainPerSecond: gameRules.POLICE_STAMINA_DRAIN_PER_SEC,
      },
      ROBBER: {
        walk: gameRules.ROBBER_WALK_SPEED,
        sprint: gameRules.ROBBER_SPRINT_SPEED,
        drainPerSecond: gameRules.ROBBER_STAMINA_DRAIN_PER_SEC,
      },
    },
  };
}
/** Village geometry/controller tunables, shared by authoritative server and prediction. */
export const VILLAGE_INTERACTION = Object.freeze({
  stepHeight: .2,
  maxSlope: .7,
  doorReach: 1.5,
  doorDurationMs: 400,
  doorAngle: 95 * Math.PI / 180,
  doorSweepStep: .025,
});
