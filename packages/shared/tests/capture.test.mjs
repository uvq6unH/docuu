import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCapture,
  isRobberCapturable,
  GAME_RULES,
} from '../dist/index.js';

const mockJail = {
  id: 'J1',
  center: [0, 0, 0],
  size: [4, 4],
  guardRadius: 5,
  slots: [
    [-0.8, 0, -0.8],
    [0.8, 0, -0.8],
    [-0.8, 0, 0.8],
    [0.8, 0, 0.8],
  ],
  rescueAnchors: [[-2.5, 0, 0], [2.5, 0, 0]],
  releaseAnchors: [[-3.5, 0, 0], [3.5, 0, 0]],
};

test('isRobberCapturable allows clear capture within 1.6m, <= 55 deg, <= 1m height delta', () => {
  // Police at [0, 0, 0], facing -Z (yaw = 0)
  const police = { id: 'police-1', role: 'POLICE', pos: [0, 0, 0], yaw: 0, crouch: false };
  // Robber at [0, 0.2, -1.2] -> in front (dz = -1.2, angle = 0), dist = 1.2 <= 1.6, heightDelta = 0.2 <= 1.0
  const robber = { id: 'robber-1', role: 'ROBBER', pos: [0, 0.2, -1.2], crouch: false, state: 'FREE' };

  const res = isRobberCapturable(police, robber, []);
  assert.equal(res.capturable, true);
  assert.ok(res.horizontalDist <= 1.6);
  assert.ok(res.angleDeg <= 55);
});

test('isRobberCapturable rejects target further than 1.6m horizontally', () => {
  const police = { id: 'police-1', role: 'POLICE', pos: [0, 0, 0], yaw: 0, crouch: false };
  const robber = { id: 'robber-1', role: 'ROBBER', pos: [0, 0, -1.65], crouch: false, state: 'FREE' };

  const res = isRobberCapturable(police, robber, []);
  assert.equal(res.capturable, false);
  assert.equal(res.failReason, 'DISTANCE_EXCEEDED');
});

test('isRobberCapturable rejects target with height delta > 1.0m', () => {
  const police = { id: 'police-1', role: 'POLICE', pos: [0, 0, 0], yaw: 0, crouch: false };
  const robber = { id: 'robber-1', role: 'ROBBER', pos: [0, 1.1, -1.0], crouch: false, state: 'FREE' };

  const res = isRobberCapturable(police, robber, []);
  assert.equal(res.capturable, false);
  assert.equal(res.failReason, 'HEIGHT_DELTA_EXCEEDED');
});

test('isRobberCapturable rejects target outside 55-degree horizontal view angle', () => {
  const police = { id: 'police-1', role: 'POLICE', pos: [0, 0, 0], yaw: 0, crouch: false }; // faces -Z
  // Robber at [1.2, 0, 0] -> directly to the right (+X), angle = 90 deg > 55 deg
  const robber = { id: 'robber-1', role: 'ROBBER', pos: [1.2, 0, 0], crouch: false, state: 'FREE' };

  const res = isRobberCapturable(police, robber, []);
  assert.equal(res.capturable, false);
  assert.equal(res.failReason, 'ANGLE_EXCEEDED');
});

test('isRobberCapturable rejects target behind a solid wall collider', () => {
  const police = { id: 'police-1', role: 'POLICE', pos: [0, 0, 0], yaw: 0, crouch: false };
  const robber = { id: 'robber-1', role: 'ROBBER', pos: [0, 0, -1.4], crouch: false, state: 'FREE' };
  const wall = { id: 'H01_box', center: [0, 2.5, -0.7], size: [2, 5, 0.4] };

  const res = isRobberCapturable(police, robber, [wall]);
  assert.equal(res.capturable, false);
  assert.equal(res.failReason, 'LINE_OF_SIGHT_BLOCKED');
});

test('isRobberCapturable does not get blocked by a bush / hide zone collider', () => {
  const police = { id: 'police-1', role: 'POLICE', pos: [0, 0, 0], yaw: 0, crouch: false };
  const robber = { id: 'robber-1', role: 'ROBBER', pos: [0, 0, -1.4], crouch: false, state: 'FREE' };
  const bush = { id: 'bush_01', center: [0, 0.5, -0.7], size: [1, 1, 1] };

  const res = isRobberCapturable(police, robber, [bush]);
  assert.equal(res.capturable, true);
});

test('isRobberCapturable rejects JAILED and IMMUNE robbers, but permits HIDDEN robbers', () => {
  const police = { id: 'police-1', role: 'POLICE', pos: [0, 0, 0], yaw: 0, crouch: false };

  const jailedRobber = { id: 'robber-1', role: 'ROBBER', pos: [0, 0, -1.0], crouch: false, state: 'JAILED' };
  assert.equal(isRobberCapturable(police, jailedRobber, []).failReason, 'TARGET_ALREADY_JAILED');

  const immuneRobber = { id: 'robber-2', role: 'ROBBER', pos: [0, 0, -1.0], crouch: false, state: 'IMMUNE' };
  assert.equal(isRobberCapturable(police, immuneRobber, []).failReason, 'TARGET_IMMUNE');

  const hiddenRobber = { id: 'robber-3', role: 'ROBBER', pos: [0, 0, -1.0], crouch: true, state: 'HIDDEN' };
  assert.equal(isRobberCapturable(police, hiddenRobber, []).capturable, true);
});

test('validateCapture selects closest robber and breaks ties by ID', () => {
  const police = { id: 'police-1', role: 'POLICE', pos: [0, 0, 0], yaw: 0, crouch: false };

  const rFar = { id: 'robber-far', role: 'ROBBER', pos: [0, 0, -1.4], crouch: false, state: 'FREE' };
  const rClose = { id: 'robber-close', role: 'ROBBER', pos: [0, 0, -0.8], crouch: false, state: 'FREE' };

  const res = validateCapture(police, [rFar, rClose], [], mockJail);
  assert.equal(res.valid, true);
  assert.equal(res.target.id, 'robber-close');
  assert.equal(res.slotIndex, 0);
  assert.deepEqual(res.jailPos, [-0.8, 0, -0.8]);

  // Tie test: same distance, tie broken by lexicographical order (robber-a vs robber-b)
  const rB = { id: 'robber-b', role: 'ROBBER', pos: [-0.5, 0, -1.0], crouch: false, state: 'FREE' };
  const rA = { id: 'robber-a', role: 'ROBBER', pos: [0.5, 0, -1.0], crouch: false, state: 'FREE' };
  const tieRes = validateCapture(police, [rB, rA], [], mockJail);
  assert.equal(tieRes.valid, true);
  assert.equal(tieRes.target.id, 'robber-a');
});

test('validateCapture assigns first unoccupied slot and rejects when all 4 slots are full', () => {
  const police = { id: 'police-1', role: 'POLICE', pos: [0, 0, 0], yaw: 0, crouch: false };
  const robber = { id: 'robber-1', role: 'ROBBER', pos: [0, 0, -1.0], crouch: false, state: 'FREE' };

  // Slots 0 and 1 occupied -> should choose slot 2
  const res = validateCapture(police, [robber], [], mockJail, new Set([0, 1]));
  assert.equal(res.valid, true);
  assert.equal(res.slotIndex, 2);
  assert.deepEqual(res.jailPos, [-0.8, 0, 0.8]);

  // All slots 0, 1, 2, 3 occupied
  const fullRes = validateCapture(police, [robber], [], mockJail, new Set([0, 1, 2, 3]));
  assert.equal(fullRes.valid, false);
  assert.equal(fullRes.failReason, 'NO_JAIL_SLOT');
});

test('validateCapture rejects non-police actor', () => {
  const robberActor = { id: 'robber-1', role: 'ROBBER', pos: [0, 0, 0], yaw: 0, crouch: false };
  const robberTarget = { id: 'robber-2', role: 'ROBBER', pos: [0, 0, -1.0], crouch: false, state: 'FREE' };

  const res = validateCapture(robberActor, [robberTarget], [], mockJail);
  assert.equal(res.valid, false);
  assert.equal(res.failReason, 'NOT_POLICE');
});
