import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialMovement, stepMovement } from '../src/movement.ts';

const world = { size: [80, 80], colliders: [] };
const village = JSON.parse(readFileSync(new URL('../maps/village-v1.json', import.meta.url)));
const forward = { moveX: 0, moveZ: 1, yaw: 0, sprint: false, crouch: false, jumpPressed: false };
function run(ticks, state, input = forward, role = 'ROBBER', map = world) {
  for (let i = 0; i < ticks; i++) state = stepMovement(state, input, role, map);
  return state;
}

test('identical inputs replay exactly and diagonal speed equals axial speed', () => {
  const start = initialMovement([0, 0, 0]);
  Object.freeze(start.pos);
  Object.freeze(start);
  for (const [role, speed] of [['POLICE', 5.2], ['ROBBER', 4.8]]) {
    const input = { ...forward, moveX: 1, yaw: Math.PI / 3 };
    const end = run(30, start, input, role);
    assert.deepEqual(end, run(15, run(15, start, input, role), input, role));
    assert.ok(Math.abs(Math.hypot(...end.pos) - speed) < 1e-8);
  }
});

test('sprint exhausts each role and only resumes after delay and recovery to 20', () => {
  const sprint = { ...forward, sprint: true };
  for (const [role, ticks] of [['POLICE', 150], ['ROBBER', 188]]) {
    let state = run(ticks, initialMovement([0,0,25]), sprint, role);
    assert.equal(state.stamina, 0);
    state = run(36, state, sprint, role);
    assert.equal(state.stamina, 0);
    state = run(37, state, sprint, role);
    assert.equal(state.exhausted, true);
    state = run(1, state, sprint, role);
    assert.equal(state.sprinting, false);
    assert.equal(state.exhausted, false);
    assert.equal(run(1, state, sprint, role).sprinting, true);
  }
});

test('village fence blocks walking and permits a single jump with a grounded landing', () => {
  const start = initialMovement([-16,0,1.5]);
  assert.ok(run(30,start,forward,'ROBBER',village).pos[2] > 0);
  const jump = { ...forward, jumpPressed: true };
  const airborne = run(1,start,jump,'ROBBER',village);
  assert.deepEqual(run(1,airborne,jump,'ROBBER',village), run(1,airborne,forward,'ROBBER',village));
  const landed = run(28,airborne,forward,'ROBBER',village);
  assert.ok(landed.pos[2] < -1);
  assert.equal(landed.pos[1], 0);
  assert.equal(landed.grounded, true);
});

test('diagonal sprint slides along a thin wall and stops inside the map boundary', () => {
  const wall = { size: world.size, colliders: [{ center:[0,2,0], size:[0.1,4,80] }] };
  const state = run(300,initialMovement([-2,0,5]),{ ...forward, moveX:1, sprint:true },'ROBBER',wall);
  assert.ok(state.pos[0] <= -0.4 && state.pos[0] > -0.65);
  assert.equal(state.pos[2], -39.65);
});

test('capsule stays crouched under a ceiling then stands when clear', () => {
  const tunnel = { size: world.size, colliders: [{ center:[0,1.6,0], size:[2,0.4,2] }] };
  const low = run(1, initialMovement([0,0,0]), { ...forward, crouch:true, sprint:true }, 'ROBBER', tunnel);
  assert.equal(low.sprinting,false);
  assert.equal(run(1,low,forward,'ROBBER',tunnel).crouched,true);
  assert.equal(run(30,low,forward,'ROBBER',tunnel).crouched,false);
});
