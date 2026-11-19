export const movementRules = {
  tickHz: 30, maxCatchUpTicks: 5, maxSubstep: 0.15,
  radius: 0.35, standingHeight: 1.7, crouchHeight: 1.1,
  eyeHeight: 1.55, crouchEyeHeight: 0.95,
  gravity: 18, jumpSpeed: 5.8, crouchSpeed: 2.5,
  maxStamina: 100, resumeStamina: 20, regenPerSecond: 16, regenDelaySeconds: 1.2,
  roles: {
    POLICE: { walk: 5.2, sprint: 7, drainPerSecond: 20 },
    ROBBER: { walk: 4.8, sprint: 7.5, drainPerSecond: 16 },
  },
} as const;

export const GAME_RULES = {
  // Tick & Timing
  SIMULATION_TICK_RATE_HZ: movementRules.tickHz,
  SIMULATION_TIMESTEP_SEC: 1 / movementRules.tickHz,
  SIMULATION_TIMESTEP_MS: 1000 / movementRules.tickHz,
  SNAPSHOT_BROADCAST_RATE_HZ: 15,
  SNAPSHOT_BROADCAST_INTERVAL_MS: 1000 / 15,
  MAX_CATCHUP_STEPS: movementRules.maxCatchUpTicks,
  INPUT_STALE_TIMEOUT_MS: 250,
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
  CAPTURE_MAX_HEIGHT_DELTA_M: 1.0,
  CAPTURE_MAX_ANGLE_DEG: 55.0, // ±55 degrees horizontally
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
} as const;

export type GameRules = typeof GAME_RULES;
