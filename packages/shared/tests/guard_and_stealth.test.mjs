import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDistanceToJailCenter,
  isInsideGuardZone,
  clampPositionOutsideGuardZone,
  isCapsuleInHideZone,
  canPoliceSeeRobber,
  GAME_RULES,
  validateMap,
} from '../dist/index.js';
import { readFileSync } from 'node:fs';

const mapJson = JSON.parse(
  readFileSync(new URL('../maps/village-v1.json', import.meta.url), 'utf8')
);
const map = validateMap(mapJson);
const jailCenter = map.jails.find((j) => j.id === 'J1').center; // [0, 0, 0]

describe('Guard Zone Constraints (R02)', () => {
  it('correctly calculates distance to jail center in XZ plane', () => {
    const dist = getDistanceToJailCenter([3, 10, 4], jailCenter);
    assert.equal(dist, 5.0);
  });

  it('determines if position is inside or outside 5m guard zone', () => {
    assert.equal(isInsideGuardZone([3, 0, 3.9], jailCenter), true); // 4.92m <= 5.0
    assert.equal(isInsideGuardZone([3, 0, 4.1], jailCenter), false); // 5.08m > 5.0
  });

  it('clamps an unauthorized police to 5.005m outside guard radius', () => {
    // Attempting to move inside to [0, 0, 2] (dist = 2m < 5m)
    const clamped = clampPositionOutsideGuardZone([0, 0, 2], jailCenter, 5.0);
    assert.equal(clamped[0], 0);
    assert.equal(clamped[1], 0);
    assert.ok(clamped[2] > 5.0 && clamped[2] < 5.01);
    assert.ok(Math.abs(getDistanceToJailCenter(clamped, jailCenter) - 5.005) < 0.001);
  });
});

describe('Stealth and Visibility Rules (R02)', () => {
  it('detects when robber crouches inside a haystack hideZone', () => {
    // R01_hide: center [-16, 0.75, -16], size [2.4, 1.5, 2.4]
    const inHide = isCapsuleInHideZone(
      [-16, 0, -16],
      GAME_RULES.CAPSULE_HEIGHT_CROUCHING,
      map.hideZones
    );
    assert.equal(inHide, true);

    const outsideHide = isCapsuleInHideZone(
      [0, 0, 0],
      GAME_RULES.CAPSULE_HEIGHT_CROUCHING,
      map.hideZones
    );
    assert.equal(outsideHide, false);
  });

  it('police can always see non-hidden robbers regardless of distance', () => {
    const policePos = [0, 0, 0];
    const robberPos = [20, 0, 20]; // 28.28m away
    assert.equal(canPoliceSeeRobber(policePos, robberPos, 'FREE'), true);
    assert.equal(canPoliceSeeRobber(policePos, robberPos, 'JAILED'), true);
    assert.equal(canPoliceSeeRobber(policePos, robberPos, 'IMMUNE'), true);
  });

  it('police cannot see HIDDEN robber beyond 2.0m', () => {
    const policePos = [0, 0, 0];
    const robberPosFar = [2.5, 0, 0]; // 2.5m > 2.0m
    assert.equal(canPoliceSeeRobber(policePos, robberPosFar, 'HIDDEN'), false);

    const robberPosNear = [1.5, 0, 0]; // 1.5m <= 2.0m
    assert.equal(canPoliceSeeRobber(policePos, robberPosNear, 'HIDDEN'), true);
  });
});
