import { Vec3, Role, InputFrame } from './protocol.js';
import { GAME_RULES } from './rules.js';
import {
  BoxCollider,
  Capsule,
  checkHeadroom,
  clampToBounds,
  getAABB,
  resolveCapsuleBoxCollision,
} from './collision.js';

/**
 * Authoritative physical and stamina simulation state for a player character.
 * All fields are plain serializable values ensuring 100% deterministic replay.
 */
export interface PlayerSimState {
  id?: string | undefined;
  role: Role;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch?: number | undefined;
  stamina: number;
  exhausted: boolean;
  staminaDelay: number; // seconds remaining before stamina regeneration begins
  crouch: boolean;
  grounded: boolean;
  lastJumpId: number;   // edge-trigger tracker for client jumpId
}

/**
 * Factory creating initial PlayerSimState.
 */
export function createInitialPlayerSimState(
  role: Role,
  pos: Vec3,
  yaw = 0,
  id?: string
): PlayerSimState {
  return {
    id,
    role,
    pos: [pos[0], pos[1], pos[2]],
    vel: [0, 0, 0],
    yaw,
    pitch: 0,
    stamina: role === 'POLICE' ? GAME_RULES.POLICE_STAMINA_MAX : GAME_RULES.ROBBER_STAMINA_MAX,
    exhausted: false,
    staminaDelay: 0,
    crouch: false,
    grounded: pos[1] <= GAME_RULES.MAP_GROUND_Y,
    lastJumpId: 0,
  };
}

/**
 * Returns movement speed in m/s based on role, sprint state, and crouch state.
 * Police: Walk 5.2, Sprint 7.0, Crouch 2.5
 * Robber: Walk 4.8, Sprint 7.5, Crouch 2.5
 */
export function getMovementSpeed(
  role: Role,
  isSprinting: boolean,
  isCrouching: boolean
): number {
  if (isCrouching) {
    return role === 'POLICE' ? GAME_RULES.POLICE_CROUCH_SPEED : GAME_RULES.ROBBER_CROUCH_SPEED;
  }
  if (isSprinting) {
    return role === 'POLICE' ? GAME_RULES.POLICE_SPRINT_SPEED : GAME_RULES.ROBBER_SPRINT_SPEED;
  }
  return role === 'POLICE' ? GAME_RULES.POLICE_WALK_SPEED : GAME_RULES.ROBBER_WALK_SPEED;
}

/**
 * Normalizes input direction vector and transforms it relative to camera yaw.
 * Yaw = 0 faces -Z (North). Yaw increases counter-clockwise (+yaw turns left, -yaw turns right).
 * Clamps diagonal magnitude to 1.0 to prevent diagonal speed boosting.
 */
export function normalizeDirection(
  moveX: number,
  moveZ: number,
  yaw: number
): { dirX: number; dirZ: number; magnitude: number } {
  if (moveX === 0 && moveZ === 0) {
    return { dirX: 0, dirZ: 0, magnitude: 0 };
  }

  const length = Math.hypot(moveX, moveZ);
  const normX = length > 1.0 ? moveX / length : moveX;
  const normZ = length > 1.0 ? moveZ / length : moveZ;

  // Forward vector: F = [-sin(yaw), 0, -cos(yaw)]
  // Right vector:   R = [ cos(yaw), 0, -sin(yaw)]
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);

  const dirX = -sinY * normZ + cosY * normX;
  const dirZ = -cosY * normZ - sinY * normX;
  const magnitude = Math.hypot(dirX, dirZ);

  return { dirX, dirZ, magnitude };
}

/**
 * Authoritative discrete fixed-step movement loop (dt = 1/30s, 30Hz).
 * Pure deterministic function computing the next PlayerSimState from input frame and colliders.
 *
 * Implements:
 * - Crouch mechanics & headroom clearance check
 * - Stamina state machine (drain, 1.2s delay, regen, exhaustion lockout at 0, threshold 20)
 * - Single edge-triggered jump & Semi-Implicit Euler vertical integration
 * - Diagonal input normalization
 * - Swept capsule collision with conservative substepping (<= 0.15m) preventing tunneling
 * - Tangential wall sliding
 * - Map boundary [-39.65, 39.65] and ground clamping
 */
export function stepMovement(
  state: PlayerSimState,
  input: InputFrame,
  colliders: BoxCollider[],
  dt: number = GAME_RULES.SIMULATION_TIMESTEP_SEC
): PlayerSimState {
  const currentYaw = input.yaw;
  const currentPitch = input.pitch;

  // 1. Crouch & Headroom check
  let newCrouch = state.crouch;
  if (state.crouch && !input.crouch) {
    // Attempting to stand up from crouch: test if overhead clearance is available
    const clear = checkHeadroom(
      state.pos,
      GAME_RULES.CAPSULE_RADIUS,
      GAME_RULES.CAPSULE_HEIGHT_CROUCHING,
      GAME_RULES.CAPSULE_HEIGHT_STANDING,
      colliders
    );
    if (clear) {
      newCrouch = false;
    } else {
      newCrouch = true; // Headroom obstructed: remain crouching
    }
  } else if (input.crouch) {
    newCrouch = true;
  } else {
    newCrouch = false;
  }

  const capsuleHeight = newCrouch
    ? GAME_RULES.CAPSULE_HEIGHT_CROUCHING
    : GAME_RULES.CAPSULE_HEIGHT_STANDING;

  // 2. Jump Handling (Single jump only, edge-triggered on jumpId)
  let velY = state.vel[1];
  let grounded = state.grounded;
  let lastJumpId = state.lastJumpId;

  const isNewJump = input.jumpId > 0 && input.jumpId !== state.lastJumpId;
  if (isNewJump) {
    lastJumpId = input.jumpId;
    if (grounded) {
      velY = GAME_RULES.JUMP_VELOCITY; // 5.8 m/s
      grounded = false;
    }
  }

  // 3. Stamina State Machine
  const isMovingHorizontally = input.moveX !== 0 || input.moveZ !== 0;
  let stamina = state.stamina;
  let exhausted = state.exhausted;
  let staminaDelay = state.staminaDelay;

  // Sprinting requires horizontal motion, not crouching, not exhausted, and stamina > 0
  const wantsSprint = Boolean(input.sprint && isMovingHorizontally && !newCrouch);
  const canSprint = wantsSprint && !exhausted && stamina > 0;

  let isSprinting = false;

  if (canSprint) {
    const drainRate = state.role === 'POLICE'
      ? GAME_RULES.POLICE_STAMINA_DRAIN_PER_SEC
      : GAME_RULES.ROBBER_STAMINA_DRAIN_PER_SEC;

    stamina = Math.max(0, stamina - drainRate * dt);
    staminaDelay = GAME_RULES.STAMINA_REGEN_DELAY_MS / 1000; // 1.2 seconds delay

    if (stamina <= 0) {
      stamina = 0;
      exhausted = true;
      isSprinting = false; // Immediately drop to walk speed when depleted
    } else {
      isSprinting = true;
    }
  } else {
    isSprinting = false;

    if (staminaDelay > 0) {
      staminaDelay = Math.max(0, staminaDelay - dt);
    } else {
      const regenRate = state.role === 'POLICE'
        ? GAME_RULES.POLICE_STAMINA_REGEN_PER_SEC
        : GAME_RULES.ROBBER_STAMINA_REGEN_PER_SEC;

      stamina = Math.min(100.0, stamina + regenRate * dt);

      // Re-enable sprinting once recovered to threshold (20.0)
      if (exhausted && stamina >= GAME_RULES.STAMINA_SPRINT_RESTART_THRESHOLD) {
        exhausted = false;
      }
    }
  }

  // 4. Horizontal Desired Velocity & Diagonal Normalization
  const speed = isMovingHorizontally
    ? getMovementSpeed(state.role, isSprinting, newCrouch)
    : 0;

  const { dirX, dirZ } = normalizeDirection(input.moveX, input.moveZ, currentYaw);
  let targetVelX = dirX * speed;
  let targetVelZ = dirZ * speed;

  // 5. Vertical Velocity Integration (Semi-Implicit Euler)
  if (!grounded) {
    velY -= GAME_RULES.GRAVITY * dt; // gravity = 18.0 m/s^2
  } else {
    velY = 0;
  }

  // 6. Swept Capsule Substepping Simulation
  const totalDispX = targetVelX * dt;
  const totalDispY = velY * dt;
  const totalDispZ = targetVelZ * dt;

  const maxSubstep = GAME_RULES.COLLISION_MAX_SUBSTEP_M; // 0.15m
  const horizontalDist = Math.hypot(totalDispX, totalDispZ);
  const totalDist = Math.hypot(totalDispX, totalDispY, totalDispZ);
  const maxTravelDist = Math.max(horizontalDist, totalDist);

  const numSubsteps = Math.max(1, Math.ceil(maxTravelDist / maxSubstep));
  const stepDispX = totalDispX / numSubsteps;
  const stepDispY = totalDispY / numSubsteps;
  const stepDispZ = totalDispZ / numSubsteps;

  let currX = state.pos[0];
  let currY = state.pos[1];
  let currZ = state.pos[2];

  const solidAABBs = colliders
    .filter((c) => c.type !== 'bush')
    .map(getAABB);

  for (let step = 0; step < numSubsteps; step++) {
    currX += stepDispX;
    currY += stepDispY;
    currZ += stepDispZ;

    // Check ground collision during substep
    if (currY <= GAME_RULES.MAP_GROUND_Y) {
      currY = GAME_RULES.MAP_GROUND_Y;
      velY = 0;
      grounded = true;
    }

    // Resolve static box collisions (3 relaxation iterations)
    for (let iter = 0; iter < 3; iter++) {
      for (const aabb of solidAABBs) {
        const capsule: Capsule = {
          pos: [currX, currY, currZ],
          radius: GAME_RULES.CAPSULE_RADIUS,
          height: capsuleHeight,
        };

        const res = resolveCapsuleBoxCollision(capsule, aabb);
        if (res.collided) {
          currX = res.pos[0];
          currY = res.pos[1];
          currZ = res.pos[2];

          // Sliding resolution: remove velocity component into the collision normal
          if (res.normal) {
            const [nx, , nz] = res.normal;
            const dot = targetVelX * nx + targetVelZ * nz;
            if (dot < 0) {
              targetVelX -= dot * nx;
              targetVelZ -= dot * nz;
            }
          }
        }
      }
    }

    // Clamp within map bounds [-39.65, 39.65] and ground >= 0
    const clamped = clampToBounds([currX, currY, currZ], GAME_RULES.CAPSULE_RADIUS);
    currX = clamped.pos[0];
    currY = clamped.pos[1];
    currZ = clamped.pos[2];

    if (clamped.clamped) {
      // Zero horizontal velocity if pushed against outer map fence
      const minBound = GAME_RULES.MAP_MIN_COORD + GAME_RULES.CAPSULE_RADIUS;
      const maxBound = GAME_RULES.MAP_MAX_COORD - GAME_RULES.CAPSULE_RADIUS;
      if ((currX <= minBound && targetVelX < 0) || (currX >= maxBound && targetVelX > 0)) {
        targetVelX = 0;
      }
      if ((currZ <= minBound && targetVelZ < 0) || (currZ >= maxBound && targetVelZ > 0)) {
        targetVelZ = 0;
      }
    }

    if (currY <= GAME_RULES.MAP_GROUND_Y) {
      currY = GAME_RULES.MAP_GROUND_Y;
      velY = 0;
      grounded = true;
    }
  }

  // Final velocity calculation
  const finalVelX = (currX - state.pos[0]) / dt;
  const finalVelZ = (currZ - state.pos[2]) / dt;
  const finalVelY = grounded ? 0 : velY;

  return {
    id: state.id,
    role: state.role,
    pos: [currX, currY, currZ],
    vel: [finalVelX, finalVelY, finalVelZ],
    yaw: currentYaw,
    pitch: currentPitch,
    stamina,
    exhausted,
    staminaDelay,
    crouch: newCrouch,
    grounded,
    lastJumpId,
  };
}
