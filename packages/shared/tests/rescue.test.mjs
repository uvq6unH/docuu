import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRescueEligibility,
  selectRobberToRescue,
  determineReleasePosition,
  GAME_RULES,
  validateMap,
} from '../dist/index.js';
import { readFileSync } from 'node:fs';

const mapJson = JSON.parse(
  readFileSync(new URL('../maps/village-v1.json', import.meta.url), 'utf8')
);
const map = validateMap(mapJson);
const jail = map.jails.find((j) => j.id === 'J1');

describe('Rescue System (R01)', () => {
  it('rejects rescue if actor is not ROBBER', () => {
    const res = checkRescueEligibility(
      {
        id: 'p1',
        role: 'POLICE',
        pos: [-2.5, 0, 0],
        yaw: 0,
        crouch: false,
        state: 'FREE',
      },
      jail,
      map.colliders
    );
    assert.equal(res.eligible, false);
    assert.equal(res.failReason, 'NOT_ROBBER');
  });

  it('rejects rescue if actor is JAILED or IMMUNE', () => {
    const jailedRes = checkRescueEligibility(
      {
        id: 'r1',
        role: 'ROBBER',
        pos: [-2.5, 0, 0],
        yaw: 0,
        crouch: false,
        state: 'JAILED',
      },
      jail,
      map.colliders
    );
    assert.equal(jailedRes.eligible, false);
    assert.equal(jailedRes.failReason, 'JAILED');

    const immuneRes = checkRescueEligibility(
      {
        id: 'r2',
        role: 'ROBBER',
        pos: [-2.5, 0, 0],
        yaw: 0,
        crouch: false,
        state: 'IMMUNE',
      },
      jail,
      map.colliders
    );
    assert.equal(immuneRes.eligible, false);
    assert.equal(immuneRes.failReason, 'IMMUNE');
  });

  it('rejects rescue if actor is out of range (> 1.25m from anchor)', () => {
    const res = checkRescueEligibility(
      {
        id: 'r1',
        role: 'ROBBER',
        pos: [-5.0, 0, 0], // Anchor 0 is at [-2.5, 0, 0], dist = 2.5m > 1.25m
        yaw: -Math.PI / 2, // Facing +X towards jail
        crouch: false,
        state: 'FREE',
      },
      jail,
      map.colliders
    );
    assert.equal(res.eligible, false);
    assert.equal(res.failReason, 'OUT_OF_RANGE');
  });

  it('rejects rescue if within range but facing away from jail center', () => {
    // Jail center is [0, 0, 0]. Rescuer at [-2.5, 0, 0].
    // Facing away towards -X (yaw = +Math.PI / 2 -> forward is [-1, 0])
    const res = checkRescueEligibility(
      {
        id: 'r1',
        role: 'ROBBER',
        pos: [-2.5, 0, 0],
        yaw: Math.PI / 2,
        crouch: false,
        state: 'FREE',
      },
      jail,
      map.colliders
    );
    assert.equal(res.eligible, false);
    assert.equal(res.failReason, 'NOT_FACING_JAIL');
  });

  it('approves rescue if within 1.25m of anchor and facing jail center', () => {
    // Rescuer at [-2.5, 0, 0], facing +X towards jail center [0, 0, 0]
    // In Three.js coords: forward is [-sin(yaw), -cos(yaw)].
    // For +X: yaw = -Math.PI / 2 -> forward is [1, 0].
    const res = checkRescueEligibility(
      {
        id: 'r1',
        role: 'ROBBER',
        pos: [-2.5, 0, 0],
        yaw: -Math.PI / 2,
        crouch: false,
        state: 'FREE',
      },
      jail,
      map.colliders
    );
    assert.equal(res.eligible, true);
    assert.equal(res.anchorIndex, 0);
  });

  it('selects the robber jailed the longest (highest timeJailedMs)', () => {
    const robbers = [
      { id: 'robber-b', role: 'ROBBER', pos: [0, 0, 0], state: 'JAILED', timeJailedMs: 5000 },
      { id: 'robber-a', role: 'ROBBER', pos: [0, 0, 0], state: 'JAILED', timeJailedMs: 12000 },
      { id: 'robber-c', role: 'ROBBER', pos: [0, 0, 0], state: 'JAILED', timeJailedMs: 3000 },
    ];
    const selected = selectRobberToRescue(robbers);
    assert.equal(selected?.id, 'robber-a');
  });

  it('breaks tie in timeJailedMs by lowest player ID lexicographically', () => {
    const robbers = [
      { id: 'robber-z', role: 'ROBBER', pos: [0, 0, 0], state: 'JAILED', timeJailedMs: 8000 },
      { id: 'robber-m', role: 'ROBBER', pos: [0, 0, 0], state: 'JAILED', timeJailedMs: 8000 },
    ];
    const selected = selectRobberToRescue(robbers);
    assert.equal(selected?.id, 'robber-m');
  });

  it('determines release position at same side release anchor', () => {
    // J1 releaseAnchors: [[-3.5, 0, 0], [3.5, 0, 0]]
    const posSide0 = determineReleasePosition(0, jail, map);
    assert.deepEqual(posSide0, [-3.5, 0, 0]);

    const posSide1 = determineReleasePosition(1, jail, map);
    assert.deepEqual(posSide1, [3.5, 0, 0]);
  });
});
