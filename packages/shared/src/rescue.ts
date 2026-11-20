import type { Vec3, MapBox, JailCandidate } from './map.ts';
import type { RobberState } from './protocol.ts';
import { GAME_RULES, type GameRules } from './rules.ts';
import { checkLineOfSight } from './collision.ts';
import { fitsAt, type StaticWorld } from './collision.ts';

export interface RescuerActor {
  id: string;
  role: 'ROBBER';
  pos: Vec3;
  yaw: number;
  crouch: boolean;
  state: RobberState;
}

export interface JailedRobberTarget {
  id: string;
  role: 'ROBBER';
  pos: Vec3;
  state: RobberState;
  timeJailedMs: number;
  jailSlotIndex?: number | undefined;
}

export interface RescueEligibilityResult {
  eligible: boolean;
  anchorIndex?: number;
  anchorPos?: Vec3;
  failReason?:
    | 'NOT_ROBBER'
    | 'JAILED'
    | 'IMMUNE'
    | 'OUT_OF_RANGE'
    | 'NOT_FACING_JAIL'
    | 'NO_LINE_OF_SIGHT';
}

/**
 * Checks if a robber is eligible to accumulate rescue progress at the active jail.
 *
 * Rules:
 * - Must be a ROBBER in FREE (or HIDDEN) state. Cannot be JAILED or IMMUNE.
 * - Must be within 1.25m horizontal distance of one of the jail's 2 rescueAnchors.
 * - Must face towards the jail (angle between yaw direction and vector to jail center <= 90 deg).
 * - Must have clear Line of Sight (LOS) to the rescue anchor.
 */
export function checkRescueEligibility(
  rescuer: RescuerActor,
  jail: JailCandidate,
  colliders: MapBox[],
  customRules?: GameRules
): RescueEligibilityResult {
  const r = customRules ?? GAME_RULES;

  if (rescuer.role !== 'ROBBER') {
    return { eligible: false, failReason: 'NOT_ROBBER' };
  }
  if (rescuer.state === 'JAILED') {
    return { eligible: false, failReason: 'JAILED' };
  }
  if (rescuer.state === 'IMMUNE') {
    return { eligible: false, failReason: 'IMMUNE' };
  }

  // 1. Find the nearest rescue anchor
  let bestAnchorIndex = -1;
  let bestDist = Infinity;

  for (let i = 0; i < jail.rescueAnchors.length; i++) {
    const anchor = jail.rescueAnchors[i]!;
    const dist = Math.hypot(rescuer.pos[0] - anchor[0], rescuer.pos[2] - anchor[2]);
    if (dist <= r.RESCUE_RADIUS_M && dist < bestDist) {
      bestDist = dist;
      bestAnchorIndex = i;
    }
  }

  if (bestAnchorIndex === -1) {
    return { eligible: false, failReason: 'OUT_OF_RANGE' };
  }

  const chosenAnchor = jail.rescueAnchors[bestAnchorIndex]!;

  // 2. Facing direction check: looking towards jail (dot >= 0)
  const toJailX = jail.center[0] - rescuer.pos[0];
  const toJailZ = jail.center[2] - rescuer.pos[2];
  const jailDist = Math.hypot(toJailX, toJailZ);

  if (jailDist > 1e-6) {
    const forwardX = -Math.sin(rescuer.yaw);
    const forwardZ = -Math.cos(rescuer.yaw);
    const dot = (forwardX * toJailX + forwardZ * toJailZ) / jailDist;
    if (dot < 0) {
      return { eligible: false, failReason: 'NOT_FACING_JAIL' };
    }
  }

  // 3. Line of sight check to the anchor
  const rescuerEyeY = rescuer.pos[1] + (rescuer.crouch ? r.CAMERA_HEIGHT_CROUCHING : r.CAMERA_HEIGHT_STANDING);
  const rescuerEye: Vec3 = [rescuer.pos[0], rescuerEyeY, rescuer.pos[2]];
  const targetPoint: Vec3 = [chosenAnchor[0], chosenAnchor[1] + 0.5, chosenAnchor[2]];

  if (!checkLineOfSight(rescuerEye, targetPoint, colliders)) {
    return { eligible: false, failReason: 'NO_LINE_OF_SIGHT' };
  }

  return {
    eligible: true,
    anchorIndex: bestAnchorIndex,
    anchorPos: chosenAnchor,
  };
}

/**
 * Selects 1 robber to be rescued among all jailed robbers.
 *
 * Rules:
 * - Rescues the robber who has been jailed the longest (highest timeJailedMs).
 * - If tied, breaks tie by lexicographically lowest player ID.
 */
export function selectRobberToRescue(
  jailedRobbers: JailedRobberTarget[]
): JailedRobberTarget | null {
  const eligible = jailedRobbers.filter((r) => r.state === 'JAILED');
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    if (Math.abs(a.timeJailedMs - b.timeJailedMs) > 1) {
      return b.timeJailedMs - a.timeJailedMs; // Highest time jailed first
    }
    return a.id.localeCompare(b.id);
  });

  return eligible[0]!;
}

/**
 * Determines the spawn position for the released robber.
 *
 * Rules:
 * - Spawns at the releaseAnchor on the SAME SIDE as the rescueAnchor.
 * - If that position is obstructed (collides with world), uses the opposite releaseAnchor.
 */
export function determineReleasePosition(
  anchorIndex: number,
  jail: JailCandidate,
  world: StaticWorld
): Vec3 {
  const primaryAnchor = jail.releaseAnchors[anchorIndex] || jail.releaseAnchors[0]!;
  if (fitsAt(primaryAnchor, GAME_RULES.CAPSULE_HEIGHT_STANDING, world)) {
    return [primaryAnchor[0], primaryAnchor[1], primaryAnchor[2]];
  }

  const secondaryIndex = anchorIndex === 0 ? 1 : 0;
  const secondaryAnchor = jail.releaseAnchors[secondaryIndex] || primaryAnchor;
  return [secondaryAnchor[0], secondaryAnchor[1], secondaryAnchor[2]];
}
