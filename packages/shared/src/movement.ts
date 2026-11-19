import type { Vec3 } from './map.ts';
import { fitsAt, moveCapsule, type StaticWorld } from './collision.ts';
import { movementRules as rules } from './rules.ts';

export type MovementRole = keyof typeof rules.roles;

export interface MovementIntent {
  moveX: -1 | 0 | 1;
  moveZ: -1 | 0 | 1;
  yaw: number;
  jumpPressed: boolean;
  sprint: boolean;
  crouch: boolean;
}

export interface MovementState {
  pos: Vec3;
  verticalSpeed: number;
  grounded: boolean;
  crouched: boolean;
  sprinting: boolean;
  stamina: number;
  exhausted: boolean;
  regenDelayTicks: number;
}

export function initialMovement(spawn: Vec3): MovementState {
  return {
    pos: [...spawn], verticalSpeed: 0, grounded: true, crouched: false,
    sprinting: false, stamina: rules.maxStamina, exhausted: false, regenDelayTicks: 0,
  };
}

// Advance exactly one tick. The caller supplies validated input and the assigned role.
export function stepMovement(
  state: MovementState, input: MovementIntent, role: MovementRole, world: StaticWorld,
): MovementState {
  const profile = rules.roles[role];
  const crouched = input.crouch || (state.crouched && !fitsAt(state.pos, rules.standingHeight, world));
  const magnitude = Math.hypot(input.moveX, input.moveZ);
  const sprinting = magnitude > 0 && input.sprint && !crouched && !state.exhausted && state.stamina > 0;
  const speed = crouched ? rules.crouchSpeed : sprinting ? profile.sprint : profile.walk;
  const stride = speed / (Math.max(1, magnitude) * rules.tickHz);
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  const verticalSpeed = state.grounded && input.jumpPressed ? rules.jumpSpeed : state.verticalSpeed;
  const nextSpeed = verticalSpeed - rules.gravity / rules.tickHz;
  const delta: Vec3 = [
    (input.moveX * cos - input.moveZ * sin) * stride,
    (verticalSpeed + nextSpeed) / (2 * rules.tickHz),
    (-input.moveX * sin - input.moveZ * cos) * stride,
  ];
  const height = crouched ? rules.crouchHeight : rules.standingHeight;
  const moved = moveCapsule(state.pos, delta, height, world);

  let { stamina, regenDelayTicks } = state;
  if (sprinting) {
    stamina -= profile.drainPerSecond / rules.tickHz;
    // Fractional per-tick costs can leave a roundoff remainder at exhaustion.
    if (stamina < 1e-9) stamina = 0;
    regenDelayTicks = Math.round(rules.regenDelaySeconds * rules.tickHz);
  } else if (regenDelayTicks > 0) {
    regenDelayTicks--;
  } else {
    stamina = Math.min(rules.maxStamina, stamina + rules.regenPerSecond / rules.tickHz);
  }

  return {
    pos: moved.pos,
    verticalSpeed: moved.grounded || moved.ceiling ? 0 : nextSpeed,
    grounded: moved.grounded, crouched, sprinting, stamina, regenDelayTicks,
    exhausted: stamina === 0 || (state.exhausted && stamina < rules.resumeStamina),
  };
}
