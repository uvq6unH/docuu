import type { Vec3, MapBox } from './map.ts';
import type { RobberState } from './protocol.ts';
import { GAME_RULES } from './rules.ts';

/**
 * Checks if a player's bounding box/capsule intersects a given hide box.
 * Player is positioned at pos [x, y, z] with given height (crouch height = 1.1m).
 */
export function isCapsuleInBox(pos: Vec3, height: number, box: MapBox): boolean {
  const minX = box.center[0] - box.size[0] / 2;
  const maxX = box.center[0] + box.size[0] / 2;
  const minY = box.center[1] - box.size[1] / 2;
  const maxY = box.center[1] + box.size[1] / 2;
  const minZ = box.center[2] - box.size[2] / 2;
  const maxZ = box.center[2] + box.size[2] / 2;

  // Horizontal position within box
  const inX = pos[0] >= minX && pos[0] <= maxX;
  const inZ = pos[2] >= minZ && pos[2] <= maxZ;
  // Vertical overlap
  const inY = pos[1] <= maxY && pos[1] + height >= minY;

  return inX && inZ && inY;
}

/**
 * Checks if a player is inside any hide zone on the map.
 */
export function isCapsuleInHideZone(
  pos: Vec3,
  height: number,
  hideZones: MapBox[]
): boolean {
  for (const zone of hideZones) {
    if (isCapsuleInBox(pos, height, zone)) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether a police officer can see a robber based on distance and stealth state.
 *
 * Rules:
 * - Non-hidden robbers (FREE, JAILED, IMMUNE) are always visible.
 * - HIDDEN robbers are only visible if the horizontal distance between police and robber <= proximity (default 2.0m).
 */
export function canPoliceSeeRobber(
  policePos: Vec3,
  robberPos: Vec3,
  robberState: RobberState,
  proximityM: number = GAME_RULES.HIDDEN_VISIBILITY_PROXIMITY_M
): boolean {
  if (robberState !== 'HIDDEN') {
    return true;
  }
  const dist = Math.hypot(policePos[0] - robberPos[0], policePos[2] - robberPos[2]);
  return dist <= proximityM;
}
