import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMap } from '../src/map.ts';
import { fitsAt, moveCapsule, checkLineOfSight } from '../src/collision.ts';

const map = validateMap(JSON.parse(readFileSync(new URL('../maps/village-v1.json', import.meta.url), 'utf8')));

for (const house of map.objects.filter(object => object.footprint)) {
  test(house.id + ' permits walking through both doors while walls and furniture stay solid', () => {
    const [x, , z] = house.pos;
    const [w, d] = house.footprint;
    let pos = [x, 0, z - d / 2 - 1];
    for (let step = 0; step < 150; step++) {
      pos = moveCapsule(pos, [0, 0, .1], 1.7, map).pos;
    }
    assert.ok(pos[2] > z + d / 2 + .5, 'standing capsule must exit the rear doorway');
    pos = [x, 0, z];
    for (let step = 0; step < 100; step++) pos = moveCapsule(pos, [.1, 0, 0], 1.7, map).pos;
    assert.ok(pos[0] < x + w / 2, 'side wall blocks movement');
    assert.equal(fitsAt([x, 0, z], 1.7, map), true);
    const cabinet = map.colliders.find(box => box.id === house.id + '_cabinet');
    assert.equal(fitsAt([cabinet.center[0], 0, cabinet.center[2]], 1.7, map), false);
    assert.equal(checkLineOfSight([x, 1.55, z - d / 2 - 1], [x, 1.55, z], map.colliders), true);
    assert.equal(checkLineOfSight([x - w / 2 - 1, 1.55, z], [x, 1.55, z], map.colliders), false);
  });
}
