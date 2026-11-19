import type { MapBox, Vec3, JailCandidate } from './map.ts';
import type { RobberState, Role } from './protocol.ts';
import { GAME_RULES, type GameRules } from './rules.ts';
import { checkLineOfSight } from './collision.ts';

export interface CaptureActor {
  id: string;
  role: Role;
  pos: Vec3;
  yaw: number;
  crouch: boolean;
}

export interface CaptureTarget {
  id: string;
  role: Role;
  pos: Vec3;
  crouch: boolean;
  state: RobberState; // 'FREE' | 'HIDDEN' | 'JAILED' | 'IMMUNE'
  slotIndex?: number | null;
}

export interface CaptureValidationResult {
  valid: boolean;
  target?: CaptureTarget;
  slotIndex?: number;
  jailPos?: Vec3;
  failReason?:
    | 'NOT_POLICE'
    | 'COOLDOWN'
    | 'NOT_PLAYING'
    | 'NO_VALID_TARGET'
    | 'NO_JAIL_SLOT'
    | 'NO_ACTIVE_JAIL';
}

/**
 * Checks if a police actor can capture a specific robber target based on distance, height, angle, and LOS.
 */
export function isRobberCapturable(
  police: CaptureActor,
  robber: CaptureTarget,
  colliders: MapBox[],
  customRules?: GameRules
): { capturable: boolean; horizontalDist: number; angleDeg: number; failReason?: string } {
  const r = customRules ?? GAME_RULES;

  // 1. Role & State checks: only non-jailed, non-immune robbers can be captured
  if (robber.role !== 'ROBBER') {
    return { capturable: false, horizontalDist: Infinity, angleDeg: 180, failReason: 'TARGET_NOT_ROBBER' };
  }
  if (robber.state === 'JAILED') {
    return { capturable: false, horizontalDist: Infinity, angleDeg: 180, failReason: 'TARGET_ALREADY_JAILED' };
  }
  if (robber.state === 'IMMUNE') {
    return { capturable: false, horizontalDist: Infinity, angleDeg: 180, failReason: 'TARGET_IMMUNE' };
  }

  // 2. Horizontal center distance check (<= 1.6m by default)
  const dx = robber.pos[0] - police.pos[0];
  const dz = robber.pos[2] - police.pos[2];
  const horizontalDist = Math.hypot(dx, dz);
  if (horizontalDist > r.CAPTURE_MAX_DISTANCE_M) {
    return { capturable: false, horizontalDist, angleDeg: 180, failReason: 'DISTANCE_EXCEEDED' };
  }

  // 3. Vertical height difference check (<= 1.0m by default)
  const heightDelta = Math.abs(robber.pos[1] - police.pos[1]);
  if (heightDelta > r.CAPTURE_MAX_HEIGHT_DELTA_M) {
    return { capturable: false, horizontalDist, angleDeg: 180, failReason: 'HEIGHT_DELTA_EXCEEDED' };
  }

  // 4. Horizontal facing angle check (+/- 55 degrees by default)
  // Forward unit vector where yaw = 0 points towards -Z
  const fx = -Math.sin(police.yaw);
  const fz = -Math.cos(police.yaw);

  let angleDeg = 0;
  if (horizontalDist > 1e-6) {
    const rx = dx / horizontalDist;
    const rz = dz / horizontalDist;
    const dot = fx * rx + fz * rz;
    const clampedDot = Math.max(-1, Math.min(1, dot));
    angleDeg = (Math.acos(clampedDot) * 180) / Math.PI;
  }

  if (angleDeg > r.CAPTURE_MAX_ANGLE_DEG) {
    return { capturable: false, horizontalDist, angleDeg, failReason: 'ANGLE_EXCEEDED' };
  }

  // 5. Line of sight check (no wall obstruction)
  const policeEyeY = police.pos[1] + (police.crouch ? r.CAMERA_HEIGHT_CROUCHING : r.CAMERA_HEIGHT_STANDING);
  const robberCenterY = robber.pos[1] + (robber.crouch ? r.CAPSULE_HEIGHT_CROUCHING : r.CAPSULE_HEIGHT_STANDING) / 2;
  const policeEye: Vec3 = [police.pos[0], policeEyeY, police.pos[2]];
  const robberCenter: Vec3 = [robber.pos[0], robberCenterY, robber.pos[2]];

  if (!checkLineOfSight(policeEye, robberCenter, colliders)) {
    return { capturable: false, horizontalDist, angleDeg, failReason: 'LINE_OF_SIGHT_BLOCKED' };
  }

  return { capturable: true, horizontalDist, angleDeg };
}

/**
 * Validates a capture intent and determines the best target and next jail slot.
 *
 * Rules:
 * - Only POLICE can capture.
 * - Chooses closest valid robber; if tied, picks lexicographically lowest ID.
 * - Places captured robber in first empty slot of active jail.
 */
export function validateCapture(
  police: CaptureActor,
  robbers: CaptureTarget[],
  colliders: MapBox[],
  activeJail: JailCandidate | undefined,
  occupiedSlotIndices: Set<number> = new Set(),
  customRules?: GameRules
): CaptureValidationResult {
  if (police.role !== 'POLICE') {
    return { valid: false, failReason: 'NOT_POLICE' };
  }

  if (!activeJail) {
    return { valid: false, failReason: 'NO_ACTIVE_JAIL' };
  }

  // Find all capturable candidates
  interface Candidate {
    target: CaptureTarget;
    dist: number;
  }
  const validCandidates: Candidate[] = [];

  for (const robber of robbers) {
    const result = isRobberCapturable(police, robber, colliders, customRules);
    if (result.capturable) {
      validCandidates.push({ target: robber, dist: result.horizontalDist });
    }
  }

  if (validCandidates.length === 0) {
    return { valid: false, failReason: 'NO_VALID_TARGET' };
  }

  // Sort by distance (closest first), tie-break by ID
  validCandidates.sort((a, b) => {
    if (Math.abs(a.dist - b.dist) > 1e-4) {
      return a.dist - b.dist;
    }
    return a.target.id.localeCompare(b.target.id);
  });

  const bestTarget = validCandidates[0]!.target;

  // Find first available jail slot (0..3)
  let slotIndex = -1;
  for (let i = 0; i < activeJail.slots.length; i++) {
    if (!occupiedSlotIndices.has(i)) {
      slotIndex = i;
      break;
    }
  }

  if (slotIndex === -1) {
    return { valid: false, failReason: 'NO_JAIL_SLOT' };
  }

  const slotPos = activeJail.slots[slotIndex]!;
  const jailPos: Vec3 = [slotPos[0], slotPos[1], slotPos[2]];

  return {
    valid: true,
    target: bestTarget,
    slotIndex,
    jailPos,
  };
}
