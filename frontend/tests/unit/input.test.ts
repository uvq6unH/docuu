import { describe, expect, it } from 'vitest';
import { applyLook, InputState } from '../../src/input/state';

describe('F05 local input state', () => {
  it('cancels opposite directions and keeps the other key when one is released', () => {
    const state = new InputState();
    state.press('KeyW'); state.press('KeyS');
    state.press('KeyA'); state.press('KeyD');
    expect(state.peek()).toMatchObject({ moveX: 0, moveZ: 0 });
    state.release('KeyS'); state.release('KeyA');
    expect(state.peek()).toMatchObject({ moveX: 1, moveZ: 1 });
  });

  it('does not lose crouch/sprint when the alternate modifier is still held', () => {
    const state = new InputState();
    state.press('ShiftLeft'); state.press('ShiftRight'); state.release('ShiftLeft');
    state.press('KeyC'); state.press('ControlLeft'); state.release('KeyC');
    state.press('KeyE');
    expect(state.peek()).toMatchObject({ sprint: true, crouch: true, rescueHeld: true });
  });

  it('consumes jump/capture edges once, ignores key repeat and accepts the next press', () => {
    const state = new InputState();
    state.press('Space'); state.capture();
    expect(state.consume()).toMatchObject({ jumpPressed: true, capturePressed: true });
    state.press('Space');
    expect(state.consume()).toMatchObject({ jumpPressed: false, capturePressed: false });
    state.release('Space'); state.press('Space');
    expect(state.consume().jumpPressed).toBe(true);
  });

  it('clears movement, actions and pending edges together', () => {
    const state = new InputState();
    for (const key of ['KeyW', 'ShiftLeft', 'KeyC', 'KeyE', 'Space']) state.press(key);
    state.capture(); state.clear();
    expect(state.consume()).toEqual({ moveX: 0, moveZ: 0, sprint: false, crouch: false, rescueHeld: false, jumpPressed: false, capturePressed: false });
  });
});

describe('F05 mouse look', () => {
  it('turns right on positive X and clamps vertical extremes', () => {
    expect(applyLook(0, 0, 100, 0, .002).yaw).toBeCloseTo(-.2);
    expect(applyLook(0, 0, 0, -100000, .002).pitch).toBe(Math.PI / 2);
    expect(applyLook(0, 0, 0, 100000, .002).pitch).toBe(-Math.PI / 2);
  });

  it('wraps yaw across many turns and ignores invalid device movement', () => {
    const look = applyLook(3, 0, -100000, 0, .002);
    expect(look.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(look.yaw).toBeLessThanOrEqual(Math.PI);
    expect(applyLook(1, .2, NaN, 0, .002)).toEqual({ yaw: 1, pitch: .2 });
  });
});
