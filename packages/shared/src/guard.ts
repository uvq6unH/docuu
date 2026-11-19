import type { Vec3 } from './map.ts';
import { GAME_RULES } from './rules.ts';

/**
 * Calculates horizontal distance (XZ plane) from player position to jail center.
 */
export function getDistanceToJailCenter(pos: Vec3, jailCenter: Vec3): number {
  return Math.hypot(pos[0] - jailCenter[0], pos[2] - jailCenter[2]);
}

/**
 * Checks whether a position is inside the 5m guard zone of the active jail.
 */
export function isInsideGuardZone(
  pos: Vec3,
  jailCenter: Vec3,
  radius = GAME_RULES.GUARD_ZONE_RADIUS_M
): boolean {
  return getDistanceToJailCenter(pos, jailCenter) <= radius;
}

/**
 * Clamps a police position that attempted to enter the guard zone without holding the guard token.
 * Pushes them back to the 5.001m boundary along the radial direction.
 */
export function clampPositionOutsideGuardZone(
  pos: Vec3,
  jailCenter: Vec3,
  radius = GAME_RULES.GUARD_ZONE_RADIUS_M
): Vec3 {
  const dx = pos[0] - jailCenter[0];
  const dz = pos[2] - jailCenter[2];
  const dist = Math.hypot(dx, dz);

  if (dist >= radius) {
    return [pos[0], pos[1], pos[2]];
  }

  // If directly at center (dist == 0), push outwards along +Z
  if (dist < 1e-6) {
    return [jailCenter[0], pos[1], jailCenter[2] + (radius + 0.005)];
  }

  const nx = dx / dist;
  const nz = dz / dist;
  const boundaryRadius = radius + 0.005;

  return [
    jailCenter[0] + nx * boundaryRadius,
    pos[1],
    jailCenter[2] + nz * boundaryRadius,
  ];
}
