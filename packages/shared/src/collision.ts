import type { MapBox, Vec3, VillageMap } from './map.ts';
import { movementRules as rules } from './rules.ts';

export type StaticWorld = Pick<VillageMap, 'colliders' | 'size'>;

// For this X/Z, find the open interval of foot heights where the vertical
// capsule intersects the box. Its segment ends one radius above/below the tips.
function forbiddenFeet(x: number, z: number, height: number, box: MapBox) {
  const dx = Math.max(0, Math.abs(x - box.center[0]) - box.size[0] / 2);
  const dz = Math.max(0, Math.abs(z - box.center[2]) - box.size[2] / 2);
  const squared = rules.radius ** 2 - dx ** 2 - dz ** 2;
  if (squared <= 0) return;
  const inset = rules.radius - Math.sqrt(squared);
  return {
    low: box.center[1] - box.size[1] / 2 - height + inset,
    high: box.center[1] + box.size[1] / 2 - inset,
  };
}

export function fitsAt([x,y,z]: Vec3, height: number, world: StaticWorld) {
  if (y < 0 || Math.abs(x) + rules.radius > world.size[0]/2 ||
      Math.abs(z) + rules.radius > world.size[1]/2) return false;
  return world.colliders.every(box => {
    const range = forbiddenFeet(x,z,height,box);
    return !range || y <= range.low || y >= range.high;
  });
}

export function moveCapsule(start: Vec3, delta: Vec3, height: number, world: StaticWorld) {
  const steps = Math.max(1, Math.ceil(Math.hypot(...delta) / rules.maxSubstep));
  const [dx,dy,dz] = delta.map(n => n / steps) as Vec3;
  const pos: Vec3 = [...start];
  let ceiling = false, grounded = false;
  for (let i = 0; i < steps; i++) {
    const limitX = world.size[0]/2 - rules.radius, limitZ = world.size[1]/2 - rules.radius;
    const x = Math.min(limitX, Math.max(-limitX, pos[0] + dx));
    const z = Math.min(limitZ, Math.max(-limitZ, pos[2] + dz));
    if (fitsAt([x,pos[1],pos[2]],height,world)) pos[0] = x;
    if (fitsAt([pos[0],pos[1],z],height,world)) pos[2] = z;
    const nextY = pos[1] + dy;
    grounded = dy <= 0 && nextY <= 0;
    let y = Math.max(0,nextY);
    for (const box of world.colliders) {
      const range = forbiddenFeet(pos[0],pos[2],height,box);
      if (!range) continue;
      if (dy <= 0 && pos[1] >= range.high && nextY <= range.high) {
        y = Math.max(y,range.high);
        grounded = true;
      } else if (dy > 0 && pos[1] <= range.low && nextY >= range.low) {
        y = Math.min(y,range.low);
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
