import { Vec3 } from './protocol.js';
import { GAME_RULES } from './rules.js';
import type { ColliderType } from './map.js';

/**
 * Axis-Aligned Bounding Box (AABB) in 3D world space.
 */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

/**
 * Generic box collider representing static map geometry (houses, fences, trees, jail shell).
 * Supports both min/max and center/size representation.
 */
export interface BoxCollider {
  id?: string | undefined;
  center?: Vec3 | undefined;
  size?: Vec3 | undefined;
  min?: Vec3 | undefined;
  max?: Vec3 | undefined;
  type?: (ColliderType | string) | undefined;
}

/**
 * Capsule collider geometry representing a player character.
 * `pos` is the feet position on ground [x, y, z] (y >= 0).
 */
export interface Capsule {
  radius: number; // default 0.35m
  height: number; // default 1.7m standing, 1.1m crouching
  pos: Vec3;      // feet coordinate
}

export type CapsuleCollider = Capsule;

/**
 * Result of a swept or discrete capsule collision query.
 */
export interface CollisionResult {
  collided: boolean;
  resolvedPos: Vec3;
  grounded: boolean;
  hitCeiling: boolean;
  normal?: Vec3 | undefined;
}

/**
 * Converts any BoxCollider (either center+size or min+max) to an AABB.
 */
export function getAABB(box: BoxCollider): AABB {
  if (box.min && box.max) {
    return {
      min: [box.min[0], box.min[1], box.min[2]],
      max: [box.max[0], box.max[1], box.max[2]],
    };
  }
  if (box.center && box.size) {
    const halfX = box.size[0] / 2;
    const halfY = box.size[1] / 2;
    const halfZ = box.size[2] / 2;
    return {
      min: [box.center[0] - halfX, box.center[1] - halfY, box.center[2] - halfZ],
      max: [box.center[0] + halfX, box.center[1] + halfY, box.center[2] + halfZ],
    };
  }
  throw new Error('Invalid BoxCollider: must provide either (min, max) or (center, size)');
}

/**
 * Clamps a 3D position within map boundaries [-40, 40] in X and Z, and >= 0 in Y.
 * Capsule center is clamped to [-39.65, 39.65] when radius is 0.35m.
 */
export function clampToBounds(
  pos: Vec3,
  radius: number = GAME_RULES.CAPSULE_RADIUS,
  bounds: [number, number, number, number] = [
    GAME_RULES.MAP_MIN_COORD,
    GAME_RULES.MAP_MAX_COORD,
    GAME_RULES.MAP_MIN_COORD,
    GAME_RULES.MAP_MAX_COORD,
  ]
): { pos: Vec3; clamped: boolean } {
  const minX = bounds[0] + radius; // -39.65
  const maxX = bounds[1] - radius; //  39.65
  const minZ = bounds[2] + radius; // -39.65
  const maxZ = bounds[3] - radius; //  39.65

  let clamped = false;
  let x = pos[0];
  let y = pos[1];
  let z = pos[2];

  if (x < minX) {
    x = minX;
    clamped = true;
  } else if (x > maxX) {
    x = maxX;
    clamped = true;
  }

  if (z < minZ) {
    z = minZ;
    clamped = true;
  } else if (z > maxZ) {
    z = maxZ;
    clamped = true;
  }

  if (y < GAME_RULES.MAP_GROUND_Y) {
    y = GAME_RULES.MAP_GROUND_Y;
    clamped = true;
  }

  return { pos: [x, y, z], clamped };
}

/**
 * Tests if a capsule intersects an AABB.
 * Capsule extends from feet `pos[1]` to `pos[1] + height` with horizontal radius `radius`.
 */
export function capsuleIntersectsAABB(capsule: Capsule, aabb: AABB): boolean {
  const [x, y, z] = capsule.pos;
  const { radius, height } = capsule;

  // 1. Vertical range overlap check
  if (y >= aabb.max[1] || y + height <= aabb.min[1]) {
    return false;
  }

  // 2. Horizontal 2D circle vs rectangle distance check
  const closestX = Math.max(aabb.min[0], Math.min(x, aabb.max[0]));
  const closestZ = Math.max(aabb.min[2], Math.min(z, aabb.max[2]));

  const dx = x - closestX;
  const dz = z - closestZ;
  const distSq = dx * dx + dz * dz;

  return distSq < radius * radius;
}

/**
 * Resolves horizontal penetration of a capsule against an AABB box.
 * Returns the resolved position, contact normal, and collision flags.
 */
export function resolveCapsuleBoxCollision(
  capsule: Capsule,
  aabb: AABB
): {
  pos: Vec3;
  collided: boolean;
  normal?: Vec3 | undefined;
  hitCeiling?: boolean | undefined;
  landed?: boolean | undefined;
} {
  const [x, y, z] = capsule.pos;
  const { radius, height } = capsule;

  // Vertical overlap check
  if (y >= aabb.max[1] || y + height <= aabb.min[1]) {
    return { pos: [x, y, z], collided: false };
  }

  // Find closest point on horizontal 2D AABB
  const closestX = Math.max(aabb.min[0], Math.min(x, aabb.max[0]));
  const closestZ = Math.max(aabb.min[2], Math.min(z, aabb.max[2]));

  const dx = x - closestX;
  const dz = z - closestZ;
  const distSq = dx * dx + dz * dz;

  // If outside horizontal box and distance >= radius, no collision
  if (distSq >= radius * radius) {
    return { pos: [x, y, z], collided: false };
  }

  const dist = Math.sqrt(distSq);

  // If circle center is outside rectangle (0 < dist < radius)
  if (dist > 1e-6) {
    const nx = dx / dist;
    const nz = dz / dist;
    const pen = radius - dist;

    return {
      pos: [x + nx * pen, y, z + nz * pen],
      collided: true,
      normal: [nx, 0, nz],
    };
  }

  // Circle center is inside or on the boundary of the rectangle (dist <= 1e-6)
  // Push out along the shallowest axis among the 4 lateral faces
  const distMinX = x - aabb.min[0];
  const distMaxX = aabb.max[0] - x;
  const distMinZ = z - aabb.min[2];
  const distMaxZ = aabb.max[2] - z;

  let minDist = distMinX;
  let normal: Vec3 = [-1, 0, 0];
  let resolvedX = aabb.min[0] - radius;
  let resolvedZ = z;

  if (distMaxX < minDist) {
    minDist = distMaxX;
    normal = [1, 0, 0];
    resolvedX = aabb.max[0] + radius;
    resolvedZ = z;
  }
  if (distMinZ < minDist) {
    minDist = distMinZ;
    normal = [0, 0, -1];
    resolvedX = x;
    resolvedZ = aabb.min[2] - radius;
  }
  if (distMaxZ < minDist) {
    normal = [0, 0, 1];
    resolvedX = x;
    resolvedZ = aabb.max[2] + radius;
  }

  return {
    pos: [resolvedX, y, resolvedZ],
    collided: true,
    normal,
  };
}

/**
 * Checks headroom clearance when character attempts to stand up from crouching.
 * Verifies if expanding the capsule volume from crouchHeight (1.1m) to standHeight (1.7m)
 * intersects any static colliders.
 * Returns `true` if headroom is CLEAR (safe to stand up), or `false` if OBSTRUCTED.
 */
export function checkHeadroom(
  pos: Vec3,
  radiusOrColliders: number | BoxCollider[],
  crouchHeight?: number,
  standHeight?: number,
  collidersList?: BoxCollider[]
): boolean {
  let radius: number;
  let standH: number;
  let colliders: BoxCollider[];

  if (Array.isArray(radiusOrColliders)) {
    colliders = radiusOrColliders;
    radius = GAME_RULES.CAPSULE_RADIUS;
    standH = GAME_RULES.CAPSULE_HEIGHT_STANDING;
  } else {
    radius = radiusOrColliders;
    standH = standHeight ?? GAME_RULES.CAPSULE_HEIGHT_STANDING;
    colliders = collidersList ?? [];
  }

  const standingCapsule: Capsule = {
    pos: [pos[0], pos[1], pos[2]],
    radius,
    height: standH,
  };

  for (const col of colliders) {
    if (col.type === 'bush') continue;
    const aabb = getAABB(col);
    if (capsuleIntersectsAABB(standingCapsule, aabb)) {
      return false; // Obstructed by overhead obstacle
    }
  }

  return true; // Clear headroom
}

/**
 * Convenience alias for checkHeadroom.
 */
export function canStandUp(
  pos: Vec3,
  colliders: BoxCollider[],
  radius: number = GAME_RULES.CAPSULE_RADIUS,
  crouchHeight: number = GAME_RULES.CAPSULE_HEIGHT_CROUCHING,
  standHeight: number = GAME_RULES.CAPSULE_HEIGHT_STANDING
): boolean {
  return checkHeadroom(pos, radius, crouchHeight, standHeight, colliders);
}

/**
 * Tests ray intersection against an AABB using the Slab Method.
 * Ray segment goes from `from` (t=0) to `to` (t=1).
 * Returns `true` if the ray hits the AABB between t=0 and t=1.
 */
export function rayIntersectsAABB(from: Vec3, to: Vec3, aabb: AABB): boolean {
  let tMin = 0.0;
  let tMax = 1.0;

  const slabs: Array<[number, number, number, number]> = [
    [from[0], to[0], aabb.min[0], aabb.max[0]],
    [from[1], to[1], aabb.min[1], aabb.max[1]],
    [from[2], to[2], aabb.min[2], aabb.max[2]],
  ];

  for (const [p1, p2, boxMin, boxMax] of slabs) {
    const d = p2 - p1;

    if (Math.abs(d) < 1e-9) {
      // Ray is parallel to the slab. Hit occurs only if origin is inside slab.
      if (p1 < boxMin || p1 > boxMax) {
        return false;
      }
    } else {
      const invD = 1.0 / d;
      let t1 = (boxMin - p1) * invD;
      let t2 = (boxMax - p1) * invD;

      if (t1 > t2) {
        const temp = t1;
        t1 = t2;
        t2 = temp;
      }

      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);

      if (tMin > tMax) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Line of Sight (LOS) raycast using the Slab Method against static colliders.
 * Returns `true` if ray from `from` to `to` has clear line of sight.
 * Solid obstacles (houses, trees, active jail shell, fences) block LOS.
 * Bushes do NOT block LOS.
 */
export function checkLineOfSight(
  from: Vec3,
  to: Vec3,
  colliders: BoxCollider[]
): boolean {
  for (const col of colliders) {
    // Bushes are non-solid and walkthrough, do not block LOS
    if (col.type === 'bush') continue;
    if (col.id && (col.id.toLowerCase().includes('bush') || col.id.toLowerCase().includes('bui'))) {
      continue;
    }

    const aabb = getAABB(col);
    if (rayIntersectsAABB(from, to, aabb)) {
      return false; // Ray obstructed by collider
    }
  }

  return true; // Clear line of sight
}

/**
 * Swept capsule simulation with conservative substepping (<= 0.15m per substep)
 * to prevent tunneling through thin colliders (e.g. 0.15m fences) even at max sprint speed.
 * Resolves horizontal sliding and clamps position to [-40, 40] map bounds.
 */
export function checkCollision(
  capsule: Capsule,
  displacement: Vec3,
  colliders: BoxCollider[]
): CollisionResult {
  const maxSubstep = GAME_RULES.COLLISION_MAX_SUBSTEP_M; // 0.15m
  const horizontalDist = Math.hypot(displacement[0], displacement[2]);
  const totalDist = Math.hypot(displacement[0], displacement[1], displacement[2]);
  const maxTravelDist = Math.max(horizontalDist, totalDist);

  const numSubsteps = Math.max(1, Math.ceil(maxTravelDist / maxSubstep));
  const stepDisp: Vec3 = [
    displacement[0] / numSubsteps,
    displacement[1] / numSubsteps,
    displacement[2] / numSubsteps,
  ];

  let currPos: Vec3 = [capsule.pos[0], capsule.pos[1], capsule.pos[2]];
  let collided = false;
  let lastNormal: Vec3 | undefined;
  const hitCeiling = false;

  const aabbs = colliders
    .filter((c) => c.type !== 'bush')
    .map(getAABB);

  for (let step = 0; step < numSubsteps; step++) {
    currPos[0] += stepDisp[0];
    currPos[1] += stepDisp[1];
    currPos[2] += stepDisp[2];

    // Iterative resolution over colliders (3 iterations for robust multi-contact resolution)
    for (let iter = 0; iter < 3; iter++) {
      for (const aabb of aabbs) {
        const testCapsule: Capsule = {
          pos: currPos,
          radius: capsule.radius,
          height: capsule.height,
        };

        const res = resolveCapsuleBoxCollision(testCapsule, aabb);
        if (res.collided) {
          collided = true;
          currPos = res.pos;
          if (res.normal) {
            lastNormal = res.normal;
          }
        }
      }
    }

    // Clamp to map boundary [-39.65, 39.65] and ground y >= 0
    const clamped = clampToBounds(currPos, capsule.radius);
    currPos = clamped.pos;
    if (clamped.clamped) {
      collided = true;
    }
  }

  const grounded = currPos[1] <= GAME_RULES.MAP_GROUND_Y;
  if (grounded) {
    currPos[1] = GAME_RULES.MAP_GROUND_Y;
  }

  return {
    collided,
    resolvedPos: currPos,
    grounded,
    hitCeiling,
    normal: lastNormal,
  };
}

/**
 * Convenience swept capsule movement function.
 */
export function moveCapsule(
  startPos: Vec3,
  displacement: Vec3,
  height: number,
  colliders: BoxCollider[],
  radius: number = GAME_RULES.CAPSULE_RADIUS
): CollisionResult {
  const capsule: Capsule = {
    pos: [startPos[0], startPos[1], startPos[2]],
    radius,
    height,
  };
  return checkCollision(capsule, displacement, colliders);
}

/**
 * Enforces dynamic guard boundary constraint around active jail center.
 * Maximum 1 police officer is allowed inside the 5.0m radius of the active jail center.
 * If a police officer without the guard token attempts to enter (or is inside),
 * pushes them back outward to radius 5.0m.
 */
export function resolveGuardBoundary(
  playerPos: Vec3,
  jailCenter: Vec3,
  guardRadius: number = GAME_RULES.GUARD_ZONE_RADIUS_M,
  isGuard: boolean = false
): Vec3 {
  if (isGuard) {
    return [playerPos[0], playerPos[1], playerPos[2]];
  }

  const dx = playerPos[0] - jailCenter[0];
  const dz = playerPos[2] - jailCenter[2];
  const dist = Math.hypot(dx, dz);

  if (dist < guardRadius) {
    if (dist < 1e-4) {
      // Degenerate center case: push outward along +X
      return [jailCenter[0] + guardRadius, playerPos[1], jailCenter[2]];
    }
    const scale = guardRadius / dist;
    return [jailCenter[0] + dx * scale, playerPos[1], jailCenter[2] + dz * scale];
  }

  return [playerPos[0], playerPos[1], playerPos[2]];
}

/**
 * Checks whether a 3D position is within the circular guard zone around a jail center.
 */
export function isInGuardZone(
  pos: Vec3,
  jailCenter: Vec3,
  guardRadius: number = GAME_RULES.GUARD_ZONE_RADIUS_M
): boolean {
  const dx = pos[0] - jailCenter[0];
  const dz = pos[2] - jailCenter[2];
  return Math.hypot(dx, dz) <= guardRadius;
}
