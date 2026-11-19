import { expect, it } from 'vitest';
import { readBoxes } from '../../src/world/collider-review';

it('reads full dimensions in world coordinates', () => {
  const [box] = readBoxes('{"colliders":[{"id":"house","center":[-27,2.5,-26],"size":[9,5,8]}]}');
  expect(box?.min.toArray()).toEqual([-31.5,0,-30]);
  expect(box?.max.toArray()).toEqual([-22.5,5,-22]);
});

it('rejects duplicate ids and invalid dimensions before showing any geometry', () => {
  const box = { id: 'house', center: [0,1,0], size: [1,2,3] };
  for (const colliders of [[box, box], [{ ...box, size: [1,0,2] }], [{ ...box, center: [1,2] }]]) {
    expect(() => readBoxes(JSON.stringify({ colliders }))).toThrow();
  }
});
