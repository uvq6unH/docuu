import type { MapBox, Vec3, VillageMap } from './map.ts';
import { movementRules as rules } from './rules.ts';
import { terrainHeight, surfaceHeight, VILLAGE_INTERACTION } from './terrain.ts';

export type StaticWorld = Pick<VillageMap, 'colliders' | 'size' | 'terrain'>;

// Reusable scratch object to eliminate per-step heap allocations
const tempRange = { low: 0, high: 0 };

function getForbiddenFeet(x: number, z: number, height: number, box: MapBox): boolean {
  const xx = x - box.center[0], zz = z - box.center[2], yaw = box.yaw ?? 0;
  const dx = Math.max(0, Math.abs(xx * Math.cos(yaw) - zz * Math.sin(yaw)) - box.size[0] / 2);
  const dz = Math.max(0, Math.abs(xx * Math.sin(yaw) + zz * Math.cos(yaw)) - box.size[2] / 2);
  const squared = rules.radius ** 2 - dx ** 2 - dz ** 2;
  if (squared <= 0) return false;
  const inset = rules.radius - Math.sqrt(squared);
  tempRange.low = box.center[1] - box.size[1] / 2 - height + inset;
  tempRange.high = box.center[1] + box.size[1] / 2 - inset;
  return true;
}

export function forbiddenFeet(x: number, z: number, height: number, box: MapBox) {
  if (!getForbiddenFeet(x, z, height, box)) return;
  return { low: tempRange.low, high: tempRange.high };
}

export function fitsAt([x,y,z]: Vec3, height: number, world: StaticWorld) {
  if (y < terrainHeight(x, z, world) - .001 || Math.abs(x) + rules.radius > world.size[0]/2 ||
      Math.abs(z) + rules.radius > world.size[1]/2) return false;
  const colliders = world.colliders;
  for (let i = 0; i < colliders.length; i++) {
    if (getForbiddenFeet(x, z, height, colliders[i]!)) {
      if (y > tempRange.low && y < tempRange.high) return false;
    }
  }
  return true;
}

export function moveCapsule(start: Vec3, delta: Vec3, height: number, world: StaticWorld) {
  const steps = Math.max(1, Math.ceil(Math.hypot(delta[0], delta[1], delta[2]) / rules.maxSubstep));
  const dx = delta[0] / steps;
  const dy = delta[1] / steps;
  const dz = delta[2] / steps;
  const pos: Vec3 = [start[0], start[1], start[2]];
  let ceiling = false, grounded = false;
  const limitX = world.size[0]/2 - rules.radius;
  const limitZ = world.size[1]/2 - rules.radius;
  const colliders = world.colliders;
  const collidersLen = colliders.length;

  for (let i = 0; i < steps; i++) {
    const x = Math.min(limitX, Math.max(-limitX, pos[0] + dx));
    const z = Math.min(limitZ, Math.max(-limitZ, pos[2] + dz));
    if (world.terrain && dy <= 0) {
      const support = Math.max(pos[1], surfaceHeight(x, z, pos[1], world),
        surfaceHeight(x, pos[2], pos[1], world), surfaceHeight(pos[0], z, pos[1], world));
      const rise = terrainHeight(x, z, world) - terrainHeight(pos[0], pos[2], world);
      if (rise <= Math.hypot(dx, dz) * VILLAGE_INTERACTION.maxSlope + .001 &&
          Math.abs(support - pos[1]) <= VILLAGE_INTERACTION.stepHeight) pos[1] = support;
    }
    if (fitsAt([x,pos[1],pos[2]],height,world)) pos[0] = x;
    if (fitsAt([pos[0],pos[1],z],height,world)) pos[2] = z;
    const nextY = pos[1] + dy;
    const ground = terrainHeight(pos[0], pos[2], world);
    grounded = dy <= 0 && nextY <= ground;
    let y = Math.max(ground,nextY);
    if (world.terrain && dy <= 0) {
      const support = surfaceHeight(pos[0], pos[2], pos[1], world);
      if (Math.abs(support - pos[1]) <= VILLAGE_INTERACTION.stepHeight) {
        y = support;
        grounded = true;
      }
    }
    for (let j = 0; j < collidersLen; j++) {
      if (!getForbiddenFeet(pos[0], pos[2], height, colliders[j]!)) continue;
      if (dy <= 0 && pos[1] >= tempRange.high && nextY <= tempRange.high) {
        y = Math.max(y, tempRange.high);
        grounded = true;
      } else if (dy > 0 && pos[1] <= tempRange.low && nextY >= tempRange.low) {
        y = Math.min(y, tempRange.low);
        ceiling = true;
      }
    }
    pos[1] = y;
  }
  return { pos, grounded, ceiling };
}

/**
 * Tests ray intersection against a box using the Slab Method.
 */
export function rayIntersectsBox(from: Vec3, to: Vec3, box: MapBox): boolean {
  if (box.yaw) {
    const local = (point: Vec3): Vec3 => {
      const x = point[0] - box.center[0], z = point[2] - box.center[2];
      return [x * Math.cos(box.yaw!) - z * Math.sin(box.yaw!), point[1] - box.center[1],
        x * Math.sin(box.yaw!) + z * Math.cos(box.yaw!)];
    };
    return rayIntersectsBox(local(from), local(to), { id: box.id, center: [0, 0, 0], size: box.size });
  }
  let tMin = 0.0;
  let tMax = 1.0;

  for (let i = 0; i < 3; i++) {
    const boxMin = box.center[i]! - box.size[i]! / 2;
    const boxMax = box.center[i]! + box.size[i]! / 2;
    const p1 = from[i]!;
    const p2 = to[i]!;
    const d = p2 - p1;

    if (Math.abs(d) < 1e-9) {
      if (p1 < boxMin || p1 > boxMax) return false;
    } else {
      const invD = 1.0 / d;
      let t1 = (boxMin - p1) * invD;
      let t2 = (boxMax - p1) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
  }
  return true;
}

/**
 * Line of Sight (LOS) raycast against static colliders.
 * Bushes and hide zones do not block line of sight.
 */
export function checkLineOfSight(from: Vec3, to: Vec3, colliders: MapBox[]): boolean {
  for (const box of colliders) {
    if (box.id.toLowerCase().includes('bush') || box.id.toLowerCase().includes('_hide')) continue;
    if (rayIntersectsBox(from, to, box)) return false;
  }
  return true;
}
