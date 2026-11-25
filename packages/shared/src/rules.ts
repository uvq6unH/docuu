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
  CAPTURE_NETWORK_TOLERANCE_DISTANCE_M: number;
  CAPTURE_MAX_HEIGHT_DELTA_M: number;
  CAPTURE_MAX_ANGLE_DEG: number;
  CAPTURE_NETWORK_TOLERANCE_ANGLE_DEG: number;
  CAPTURE_COOLDOWN_MS: number;

  // Jail & Rescue
  RESCUE_RADIUS_M: number;
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
  CAPTURE_NETWORK_TOLERANCE_DISTANCE_M: 2.0,
  CAPTURE_MAX_HEIGHT_DELTA_M: 1.0,
  CAPTURE_MAX_ANGLE_DEG: 55.0, // ±55 degrees horizontally
  CAPTURE_NETWORK_TOLERANCE_ANGLE_DEG: 65.0, // ±65 degrees network compensation
  CAPTURE_COOLDOWN_MS: 1100,

  // Jail & Rescue
  RESCUE_RADIUS_M: 1.25,
  RESCUE_REQUIRED_HOLD_MS: 2000, // Exactly 2 seconds
  RESCUE_IMMUNITY_DURATION_MS: 3000, // Exactly 3 seconds
  GUARD_ZONE_RADIUS_M: 5.0,
  MAX_GUARDS_ALLOWED: 1,

  // Stealth / Hide
  HIDE_CROUCH_TRIGGER_MS: 400,
  HIDDEN_VISIBILITY_PROXIMITY_M: 2.0,
};

export const GAME_RULES: GameRules = DEFAULT_GAME_RULES;

export function createGameRules(overrides?: Partial<GameRules>): GameRules {
  return {
    ...DEFAULT_GAME_RULES,
    ...overrides,
  };
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
