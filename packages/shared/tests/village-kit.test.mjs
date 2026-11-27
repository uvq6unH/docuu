import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMap } from '../src/map.ts';
import { terrainHeight, VILLAGE_INTERACTION } from '../src/terrain.ts';
import { fitsAt, moveCapsule, checkLineOfSight } from '../src/collision.ts';
import { initialDoors, doorBox, syncDoorColliders, advanceDoors } from '../src/doors.ts';

const source = JSON.parse(readFileSync(new URL('../maps/vietnam-village.json', import.meta.url)));

test('kit map validates, uses every supplied GLB and has non-flat triangle terrain', () => {
  const map = validateMap(source);
  const manifest = JSON.parse(readFileSync(new URL('../../../frontend/vietnam-village-kit/manifest.json', import.meta.url)));
  const used = new Set([...map.objects.map(object => object.asset), 'terrain_80m', 'door_wood', 'prison']);
  assert.deepEqual([...used].sort(), Object.keys(manifest).sort());
  assert.ok(Math.max(...map.terrain.heights) - Math.min(...map.terrain.heights) > 1);
  for (let row = 0; row < 41; row++) {
    for (let column = 0; column < 41; column++) {
      assert.ok(Math.abs(terrainHeight(-40 + column * 2, 40 - row * 2, map) - map.terrain.heights[row * 41 + column]) < 1e-6);
    }
  }
});

test('both roles can walk into every kit house through the open hinged door', () => {
  const map = validateMap(source);
  const states = initialDoors(map);
  states.forEach(state => state.angle = state.target = VILLAGE_INTERACTION.doorAngle);
  syncDoorColliders(map, states);
  for (const door of map.doors) {
    const inward = [-Math.sin(door.yaw), 0, -Math.cos(door.yaw)];
    const closed = doorBox(door, 0);
    let pos = [closed.center[0] - inward[0] * .95, terrainHeight(closed.center[0], closed.center[2], map),
      closed.center[2] - inward[2] * .95];
    for (let index = 0; index < 25; index++) {
      pos = moveCapsule(pos, [inward[0] * .1, -.01, inward[2] * .1], 1.7, map).pos;
    }
    const progress = (pos[0] - closed.center[0]) * inward[0] + (pos[2] - closed.center[2]) * inward[2];
    assert.ok(progress > .7, door.id + ' must allow entry, progress=' + progress);
    assert.ok(pos[1] >= terrainHeight(pos[0], pos[2], map) - .001);
  }
});

test('doors block while closed, open in 400ms and stop before touching a player', () => {
  const map = validateMap(source), states = initialDoors(map), door = map.doors[0], state = states[0];
  const closed = doorBox(door, 0);
  map.colliders.push({ id: 'dynamic_unrelated_static', center: [37, 1, 37], size: [1, 2, 1] });
  syncDoorColliders(map, states);
  assert.ok(map.colliders.some(box => box.id === 'dynamic_unrelated_static'));
  for (const spawn of [...map.spawns.police, ...map.spawns.robber]) assert.equal(fitsAt(spawn, 1.7, map), true);
  assert.equal(fitsAt([closed.center[0], door.hinge[1], closed.center[2]], 1.7, map), false);
  state.target = VILLAGE_INTERACTION.doorAngle;
  advanceDoors(map, states, 399, []);
  assert.ok(state.angle < state.target);
  advanceDoors(map, states, 1, []);
  assert.equal(state.angle, state.target);
  const obstruction = doorBox(door, VILLAGE_INTERACTION.doorAngle / 2);
  state.target = 0;
  advanceDoors(map, states, 400, [{ pos: [obstruction.center[0], door.hinge[1], obstruction.center[2]], height: 1.7 }]);
  assert.ok(state.angle > 0, 'door cannot sweep through a player');
  assert.equal(state.target, state.angle, 'blocked door stops instead of pushing');
  assert.equal(checkLineOfSight([closed.center[0], door.hinge[1] + 1, closed.center[2] - .5],
    [closed.center[0], door.hinge[1] + 1, closed.center[2] + .5], [closed]), false);
});

test('terrain walking and jumping cannot escape any of the four village edges', () => {
  const map = validateMap(source);
  for (const [x, z, dx, dz] of [[38, 0, .3, 0], [-38, 0, -.3, 0], [0, 38, 0, .3], [0, -38, 0, -.3]]) {
    let pos = [x, terrainHeight(x, z, map), z];
    for (let tick = 0; tick < 100; tick++) {
      pos = moveCapsule(pos, [dx, tick < 10 ? .1 : -.15, dz], 1.7, map).pos;
      assert.ok(Math.abs(pos[0]) < 39.4 && Math.abs(pos[2]) < 39.4);
      assert.ok(pos[1] >= terrainHeight(pos[0], pos[2], map) - .001);
    }
  }
});

test('walking follows uphill and downhill triangle elevations and the pond bridge deck', () => {
  const map = validateMap(source);
  let pos = [29, terrainHeight(29, 6, map), 6];
  for (let tick = 0; tick < 100; tick++) {
    pos = moveCapsule(pos, [0, -.01, .08], 1.7, map).pos;
    assert.ok(pos[1] >= terrainHeight(pos[0], pos[2], map) - .001);
  }
  assert.ok(pos[2] > 13.5, 'bridge must remain traversable');
  const hill = { size: [80, 80], colliders: [], terrain: { columns: 3, rows: 2, heights: [0, 3, 0, 0, 3, 0] } };
  pos = [-30, terrainHeight(-30, 0, hill), 0];
  let peak = pos[1];
  for (let tick = 0; tick < 600; tick++) {
    pos = moveCapsule(pos, [.1, -.01, 0], 1.7, hill).pos;
    peak = Math.max(peak, pos[1]);
    assert.ok(Math.abs(pos[1] - terrainHeight(pos[0], pos[2], hill)) < .001);
  }
  assert.ok(peak > 2.99 && pos[0] > 29.9 && pos[1] < .76);
});

test('terrain metadata rejects invalid grids, heights and duplicate door IDs', () => {
  for (const mutate of [
    map => map.terrain.columns = 1,
    map => map.terrain.heights.pop(),
    map => map.terrain.heights[0] = Infinity,
    map => map.doors[1].id = map.doors[0].id,
    map => map.doors[0].size[0] = 0,
    map => map.doors[0].hinge[0] = 41,
  ]) {
    const map = structuredClone(source);
    mutate(map);
    assert.throws(() => validateMap(map));
  }
});
