import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../dist/rooms/room.js';
import { doorBox, terrainHeight, VILLAGE_INTERACTION } from '@folk-tag/shared';

test('room doors use server position, reject jailed/far players and remain isolated between rooms', t => {
  const room = new Room('DOOR01', 'p1', 'map'), other = new Room('DOOR02', 'p1', 'map');
  t.after(() => { room.stop(); other.stop(); });
  const player = room.addPlayer('p1', 'An', { connected: true, emit() {}, join() {}, leave() {} }, 'token', true);
  player.role = 'ROBBER';
  room.phase = 'PLAYING';
  const door = room.world.doors[0], box = doorBox(door, 0);
  assert.equal(room.interactDoor(player.id), false, 'distant players cannot choose a door');
  player.movementState.pos = [
    box.center[0] + Math.sin(door.yaw) * .9,
    terrainHeight(box.center[0], box.center[2], room.world),
    box.center[2] + Math.cos(door.yaw) * .9,
  ];
  player.state = 'JAILED';
  assert.equal(room.interactDoor(player.id), false);
  player.state = 'FREE';
  assert.equal(room.interactDoor(player.id), true);
  assert.equal(room.doors[0].target, VILLAGE_INTERACTION.doorAngle);
  assert.equal(other.doors[0].target, 0);
  room.step(200);
  assert.ok(room.doors[0].angle > 0 && room.doors[0].angle < VILLAGE_INTERACTION.doorAngle);
  assert.ok(room.world.colliders.some(collider => collider.id === 'dynamic_' + door.id));
  assert.equal(other.doors[0].angle, 0);
  assert.deepEqual(other.world.colliders.find(collider => collider.id === 'dynamic_' + door.id), box);
  assert.equal(room.restartToLobby(), false);
  assert.ok(room.doors[0].angle > 0, 'invalid restart preserves active doors');
  room.phase = 'RESULT';
  assert.equal(room.interactDoor(player.id), false);
  room.restartToLobby();
  assert.equal(room.doors.every(state => state.angle === 0 && state.target === 0), true);
});
