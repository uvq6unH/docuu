import { clear, surveyRoute } from '../../src/world/survey-route';
import { Box3, Vector3 } from 'three';
import { expect, it, vi } from 'vitest';
import { villagePreview } from '../../src/world/village';
import { initialMovement, stepMovement } from '../../../packages/shared/src/movement';
import { movementRules } from '../../../packages/shared/src/rules';
import { villageMap } from '../../src/world/shared-map';

const { village, bounds, viewpoints, spawns } = villagePreview();
it.each([...viewpoints])('%s has ground routes from every robber spawn to both rescue approaches', (id, jail) => {
  expect(spawns).toHaveLength(4);
  const footprint = village.getObjectByName(id)!;
  const obstacles = [...bounds.children, footprint].map(object => new Box3().setFromObject(object));
  for (const side of [-1, 1]) {
    for (const spawn of spawns) {
      const route = surveyRoute(spawn, jail, side, obstacles);
      expect(route[0]).toEqual(spawn);
      expect(route.at(-1)).toEqual([jail.x + side * 2.5, jail.z]);
      for (let i = 1; i < route.length; i++) {
        expect(clear(...route[i - 1]!, ...route[i]!, obstacles)).toBe(true);
      }
      // Walk every segment with ordinary robber input, allowing half a stride
      // of rounding at each waypoint because simulation ticks have fixed length.
      const stride = movementRules.roles.ROBBER.walk / movementRules.tickHz;
      let player = initialMovement([spawn[0], 0, spawn[1]]);
      for (const [x, z] of route.slice(1)) {
        const dx = x - player.pos[0], dz = z - player.pos[2];
        const ticks = Math.round(Math.hypot(dx, dz) / stride);
        const intent = { moveX: 0, moveZ: 1, yaw: Math.atan2(-dx, -dz),
          crouch: false, sprint: false, jumpPressed: false } as const;
        for (let tick = 0; tick < ticks; tick++) player = stepMovement(player, intent, 'ROBBER', villageMap);
        expect(Math.hypot(player.pos[0] - x, player.pos[2] - z)).toBeLessThanOrEqual(stride / 2 + 1e-8);
      }
      expect(player.grounded).toBe(true);
      const anchor = villageMap.jails.find(candidate => candidate.id === id)!.rescueAnchors
        .find(([x]) => Math.sign(x - jail.x) === side)!;
      expect(Math.hypot(player.pos[0] - anchor[0], player.pos[2] - anchor[2])).toBeLessThan(1.25);
    }
  }
});
it('detects a thin obstacle between clear endpoints', () => {
  const fence = new Box3(new Vector3(-.1, 0, -.1), new Vector3(.1, 1, .1));
  expect(clear(-2, 0, -2, 0, [fence])).toBe(true);
  expect(clear(2, 0, 2, 0, [fence])).toBe(true);
  expect(clear(-2, 0, 2, 0, [fence])).toBe(false);
});




// Retain regression coverage for the original flat-map preview.
vi.mock('../../src/world/shared-map', async () => {
  const { validateMap } = await import('../../../packages/shared/src/map');
  const { default: data } = await import('../../../packages/shared/maps/village-v1.json');
  return { villageMap: validateMap(data) };
});
