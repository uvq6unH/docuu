import {
  fitsAt,
  surfaceHeight,
  isCapsuleInHideZone,
  canPoliceSeeRobber,
  getDistanceToJailCenter,
  stepMovement,
  type MovementIntent,
  type MovementRole,
  type MovementRules,
  type StaticWorld,
  type Vec3,
  type VillageMap,
} from '@folk-tag/shared';
import type { PlayerSession } from './room.js';

export interface BotAiContext {
  bot: PlayerSession;
  allPlayers: Iterable<PlayerSession>;
  phase: string;
  activeJail: VillageMap['jails'][0];
  guardId: string | null;
  map: VillageMap;
  movementRules: MovementRules;
  capsuleHeight: number;
  capsuleHeightCrouch: number;
  captureRadius: number;
  captureAttempts: { policeId: string; yaw: number }[];
}

/**
 * Searches for a clear, unobstructed yaw direction towards (targetX, targetZ)
 * using radial feelers and fitsAt queries against the static world.
 */
export function findNavigableYaw(
  pos: Vec3,
  targetX: number,
  targetZ: number,
  capsuleHeight: number,
  world: StaticWorld
): { yaw: number; shouldJump: boolean } {
  const dx = targetX - pos[0];
  const dz = targetZ - pos[2];
  const desiredYaw = Math.atan2(-dx, -dz);

  // Probes in angular offsets around desired yaw (in radians)
  const angleOffsets = [
    0,
    Math.PI / 8,      // +22.5 deg
    -Math.PI / 8,     // -22.5 deg
    Math.PI / 4,      // +45 deg
    -Math.PI / 4,     // -45 deg
    (3 * Math.PI) / 8, // +67.5 deg
    -(3 * Math.PI) / 8, // -67.5 deg
    Math.PI / 2,      // +90 deg
    -Math.PI / 2,     // -90 deg
    (5 * Math.PI) / 8, // +112.5 deg
    -(5 * Math.PI) / 8, // -112.5 deg
  ];

  const probeDistance = 0.85;

  for (const offset of angleOffsets) {
    const testYaw = desiredYaw + offset;
    const testX = pos[0] - Math.sin(testYaw) * probeDistance;
    const testZ = pos[2] - Math.cos(testYaw) * probeDistance;
    const testY = world.terrain ? surfaceHeight(testX, testZ, pos[1], world) : pos[1];

    // Check direct passage at current ground height
    if (fitsAt([testX, testY, testZ], capsuleHeight, world)) {
      return { yaw: testYaw, shouldJump: false };
    }

    // Check if obstacle is low (e.g. fence 0.65m) and jumpable
    if (
      !fitsAt([testX, testY, testZ], capsuleHeight, world) &&
      fitsAt([testX, pos[1] + 0.75, testZ], capsuleHeight, world)
    ) {
      return { yaw: testYaw, shouldJump: true };
    }
  }

  // If all forward probes blocked, turn 90 deg away
  return { yaw: desiredYaw + Math.PI / 2, shouldJump: true };
}

/**
 * Advanced Bot AI Routine for Police and Robbers.
 * Respects stealth line-of-sight, coordinates rescue flanks, and avoids wall collisions.
 */
export function executeBotBehavior(ctx: BotAiContext): void {
  const {
    bot,
    allPlayers,
    phase,
    activeJail,
    guardId,
    map,
    movementRules,
    capsuleHeight,
    capsuleHeightCrouch,
    captureRadius,
    captureAttempts,
  } = ctx;

  if (!bot.role) return;

  // ---------------------------------------------------------------------------
  // POLICE BOT BEHAVIOR
  // ---------------------------------------------------------------------------
  if (bot.role === 'POLICE') {
    if (phase === 'HEAD_START') {
      bot.movementState.sprinting = false;
      bot.movementState.verticalSpeed = 0;
      return;
    }
    if (phase !== 'PLAYING') return;

    // 1. Detect unjailed, non-immune robbers that are visible
    let closestRobber: PlayerSession | null = null;
    let minDistance = Infinity;

    for (const other of allPlayers) {
      if (
        other.role === 'ROBBER' &&
        other.state !== 'JAILED' &&
        other.state !== 'IMMUNE'
      ) {
        // Obey stealth rule: hidden robbers >2m away are invisible to police AI
        const canSee = canPoliceSeeRobber(
          bot.movementState.pos,
          other.movementState.pos,
          other.state
        );
        if (!canSee) continue;

        const dx = other.movementState.pos[0] - bot.movementState.pos[0];
        const dz = other.movementState.pos[2] - bot.movementState.pos[2];
        const dist = Math.hypot(dx, dz);
        if (dist < minDistance) {
          minDistance = dist;
          closestRobber = other;
        }
      }
    }

    // 2. Determine target position
    let targetX = activeJail.center[0];
    let targetZ = activeJail.center[2];
    let isChasingRobber = false;

    if (closestRobber) {
      targetX = closestRobber.movementState.pos[0];
      targetZ = closestRobber.movementState.pos[2];
      isChasingRobber = true;
    } else if (bot.distractionTarget && (bot.distractionRemainingMs ?? 0) > 0) {
      // Investigating pebble distraction noise!
      targetX = bot.distractionTarget[0];
      targetZ = bot.distractionTarget[1];
    } else {
      // If no robbers visible, patrol around known hide zones or active jail perimeter
      const hideZones = map.hideZones;
      if (hideZones.length > 0) {
        // Pick a hide zone deterministically based on bot ID and current position
        const zoneIndex = Math.abs(bot.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % hideZones.length;
        const zone = hideZones[zoneIndex]!;
        const distToZone = Math.hypot(zone.center[0] - bot.movementState.pos[0], zone.center[2] - bot.movementState.pos[2]);
        if (distToZone > 2.5) {
          targetX = zone.center[0];
          targetZ = zone.center[2];
        } else {
          // If already at hide zone, patrol jail perimeter (6m away)
          targetX = activeJail.center[0] + 6.0;
          targetZ = activeJail.center[2];
        }
      }
    }

    // Avoid entering guard zone if another police is already the guard
    const isOtherGuard = guardId !== null && guardId !== bot.id;
    if (isOtherGuard) {
      const distToJail = getDistanceToJailCenter(bot.movementState.pos, activeJail.center);
      if (distToJail <= 5.5) {
        // Move away from jail center to avoid guard violation
        const awayDx = bot.movementState.pos[0] - activeJail.center[0];
        const awayDz = bot.movementState.pos[2] - activeJail.center[2];
        const awayAngle = Math.atan2(-awayDx, -awayDz);
        targetX = activeJail.center[0] + (awayDx / (distToJail || 1)) * 6.0;
        targetZ = activeJail.center[2] + (awayDz / (distToJail || 1)) * 6.0;
      }
    }

    // 3. Navigate with obstacle avoidance
    const nav = findNavigableYaw(bot.movementState.pos, targetX, targetZ, capsuleHeight, map);
    bot.lastYaw = nav.yaw;

    const shouldSprint = isChasingRobber && minDistance > 2.5 && bot.movementState.stamina > 20;

    const intent: MovementIntent = {
      moveX: 0,
      moveZ: 1,
      yaw: nav.yaw,
      sprint: shouldSprint,
      crouch: false,
      jumpPressed: nav.shouldJump && bot.movementState.grounded,
    };

    bot.movementState = stepMovement(
      bot.movementState,
      intent,
      'POLICE',
      map,
      movementRules
    );

    // 4. Trigger capture attempt if in range
    if (isChasingRobber && minDistance <= captureRadius + 0.3) {
      captureAttempts.push({ policeId: bot.id, yaw: nav.yaw });
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // ROBBER BOT BEHAVIOR
  // ---------------------------------------------------------------------------
  if (bot.role === 'ROBBER') {
    if (bot.state === 'JAILED') {
      if (bot.jailSlotIndex !== undefined && activeJail.slots[bot.jailSlotIndex]) {
        bot.movementState.pos = [...activeJail.slots[bot.jailSlotIndex]!];
        bot.movementState.verticalSpeed = 0;
        bot.movementState.crouched = false;
        bot.movementState.sprinting = false;
      }
      return;
    }

    if (phase !== 'HEAD_START' && phase !== 'PLAYING') return;

    // Head start phase: sprint away from police spawns into hiding
    if (phase === 'HEAD_START') {
      const hideZone = map.hideZones[0] || { center: [-16, 0.75, -16] };
      const nav = findNavigableYaw(bot.movementState.pos, hideZone.center[0], hideZone.center[2], capsuleHeight, map);
      bot.lastYaw = nav.yaw;
      bot.movementState = stepMovement(
        bot.movementState,
        { moveX: 0, moveZ: 1, yaw: nav.yaw, sprint: bot.movementState.stamina > 30, crouch: false, jumpPressed: nav.shouldJump },
        'ROBBER',
        map,
        movementRules
      );
      return;
    }

    const jailedTeammates = Array.from(allPlayers).filter(
      (p) => p.role === 'ROBBER' && p.state === 'JAILED'
    );

    // Tactical Decision: Rescue vs Hide vs Flee
    if (jailedTeammates.length > 0) {
      // Find police guard position if any
      let guardPos: Vec3 | null = null;
      for (const p of allPlayers) {
        if (p.role === 'POLICE' && p.guard) {
          guardPos = p.movementState.pos;
          break;
        }
      }

      // Pick the rescue anchor furthest from the guard (Tactical Flank)
      const anchors = activeJail.rescueAnchors;
      let chosenAnchor = anchors[0] || [activeJail.center[0] - 2.5, 0, activeJail.center[2]];

      if (anchors.length > 1 && guardPos) {
        const d0 = Math.hypot(anchors[0]![0] - guardPos[0], anchors[0]![2] - guardPos[2]);
        const d1 = Math.hypot(anchors[1]![0] - guardPos[0], anchors[1]![2] - guardPos[2]);
        chosenAnchor = d0 > d1 ? anchors[0]! : anchors[1]!;
      }

      const distToAnchor = Math.hypot(
        chosenAnchor[0] - bot.movementState.pos[0],
        chosenAnchor[2] - bot.movementState.pos[2]
      );

      if (distToAnchor > 1.20) {
        bot.rescueHeld = false;
        const nav = findNavigableYaw(
          bot.movementState.pos,
          chosenAnchor[0],
          chosenAnchor[2],
          capsuleHeight,
          map
        );
        bot.lastYaw = nav.yaw;

        bot.movementState = stepMovement(
          bot.movementState,
          {
            moveX: 0,
            moveZ: 1,
            yaw: nav.yaw,
            sprint: bot.movementState.stamina > 20,
            crouch: false,
            jumpPressed: nav.shouldJump && bot.movementState.grounded,
          },
          'ROBBER',
          map,
          movementRules
        );
      } else {
        // Within rescue range: face jail center and hold E continuously
        const faceYaw = Math.atan2(
          -(activeJail.center[0] - bot.movementState.pos[0]),
          -(activeJail.center[2] - bot.movementState.pos[2])
        );
        bot.lastYaw = faceYaw;
        bot.rescueHeld = true;
        bot.movementState.verticalSpeed = 0;
      }
    } else {
      // All teammates are free: SURVIVE and HIDE
      bot.rescueHeld = false;

      // Check proximity of closest police
      let nearestPoliceDist = Infinity;
      let nearestPolice: PlayerSession | null = null;
      for (const p of allPlayers) {
        if (p.role === 'POLICE') {
          const dist = Math.hypot(
            p.movementState.pos[0] - bot.movementState.pos[0],
            p.movementState.pos[2] - bot.movementState.pos[2]
          );
          if (dist < nearestPoliceDist) {
            nearestPoliceDist = dist;
            nearestPolice = p;
          }
        }
      }

      if (nearestPolice && nearestPoliceDist < 12.0) {
        // Flee away from police
        const fleeX = bot.movementState.pos[0] - nearestPolice.movementState.pos[0];
        const fleeZ = bot.movementState.pos[2] - nearestPolice.movementState.pos[2];
        const targetX = bot.movementState.pos[0] + fleeX;
        const targetZ = bot.movementState.pos[2] + fleeZ;

        const nav = findNavigableYaw(bot.movementState.pos, targetX, targetZ, capsuleHeight, map);
        bot.lastYaw = nav.yaw;

        bot.movementState = stepMovement(
          bot.movementState,
          {
            moveX: 0,
            moveZ: 1,
            yaw: nav.yaw,
            sprint: bot.movementState.stamina > 20,
            crouch: false,
            jumpPressed: nav.shouldJump && bot.movementState.grounded,
          },
          'ROBBER',
          map,
          movementRules
        );
      } else {
        // Not in immediate danger: seek nearest hide zone and crouch
        let nearestZone = map.hideZones[0] || null;
        let minZoneDist = Infinity;
        for (const zone of map.hideZones) {
          const d = Math.hypot(zone.center[0] - bot.movementState.pos[0], zone.center[2] - bot.movementState.pos[2]);
          if (d < minZoneDist) {
            minZoneDist = d;
            nearestZone = zone;
          }
        }

        const insideHideZone = isCapsuleInHideZone(
          bot.movementState.pos,
          capsuleHeightCrouch,
          map.hideZones
        );

        if (insideHideZone) {
          // Inside hide zone: remain stationary and crouched for stealth
          bot.movementState = stepMovement(
            bot.movementState,
            { moveX: 0, moveZ: 0, yaw: bot.lastYaw, sprint: false, crouch: true, jumpPressed: false },
            'ROBBER',
            map,
            movementRules
          );
        } else if (nearestZone && minZoneDist > 1.0) {
          // Head into the hide zone
          const nav = findNavigableYaw(bot.movementState.pos, nearestZone.center[0], nearestZone.center[2], capsuleHeight, map);
          bot.lastYaw = nav.yaw;
          bot.movementState = stepMovement(
            bot.movementState,
            { moveX: 0, moveZ: 1, yaw: nav.yaw, sprint: false, crouch: false, jumpPressed: nav.shouldJump },
            'ROBBER',
            map,
            movementRules
          );
        } else {
          // Crouch in place
          bot.movementState = stepMovement(
            bot.movementState,
            { moveX: 0, moveZ: 0, yaw: bot.lastYaw, sprint: false, crouch: true, jumpPressed: false },
            'ROBBER',
            map,
            movementRules
          );
        }
      }
    }
  }
}
