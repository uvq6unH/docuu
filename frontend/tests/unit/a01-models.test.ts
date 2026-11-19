import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

interface Accessor { count: number; min: number[]; max: number[] }
interface Primitive { indices: number; attributes: { POSITION: number } }
interface Model {
  accessors: Accessor[];
  meshes: { primitives: Primitive[] }[];
  materials: { pbrMetallicRoughness: { baseColorFactor: number[] } }[];
}

it.each(['house_a', 'house_b', 'house_c', 'tree_a', 'tree_b'])('%s meets the A01 export budget and metre scale', name => {
  const bytes = readFileSync(resolve('public/models', name + '.glb'));
  expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const model: Model = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const parts = model.meshes.flatMap(mesh => mesh.primitives);
  const triangles = parts.reduce((n, part) => n + model.accessors[part.indices]!.count / 3, 0);
  const house = name.startsWith('house');
  expect(triangles).toBeGreaterThanOrEqual(house ? 1000 : 200);
  expect(triangles).toBeLessThanOrEqual(house ? 2000 : 500);
  expect(model.materials).toHaveLength(2);
  expect(model.materials[0]!.pbrMetallicRoughness.baseColorFactor)
    .not.toEqual(model.materials[1]!.pbrMetallicRoughness.baseColorFactor);
  const bounds = parts.map(part => model.accessors[part.attributes.POSITION]!);
  expect(Math.min(...bounds.map(b => b.min[1]!))).toBeCloseTo(0, 4);
  if (house) {
    for (const axis of [0, 2]) {
      expect(Math.min(...bounds.map(b => b.min[axis]!))).toBeCloseTo(-4, 4);
      expect(Math.max(...bounds.map(b => b.max[axis]!))).toBeCloseTo(4, 4);
    }
    expect(Math.max(...bounds.map(b => b.max[1]!))).toBeCloseTo(5, 4);
  } else {
    expect(Math.max(...bounds.map(b => b.min[1]!))).toBeGreaterThan(1.7);
  }
});

it.each([
  { name: 'bush', size: [2, 1.1, 2], budget: [100, 200] },
  { name: 'haystack', size: [2.4, 1.5, 2.4], budget: [150, 350] },
  { name: 'fence_segment', size: [4, .65, .15], budget: [100, 200] },
  { name: 'jail', size: [4, 2.45, 4], budget: [500, 1000] },
])('$name fits its A02 footprint and triangle budget', ({ name, size, budget }) => {
  const bytes = readFileSync(resolve('public/models', name + '.glb'));
  const model: Model = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const parts = model.meshes.flatMap(mesh => mesh.primitives);
  const triangles = parts.reduce((sum, p) => sum + model.accessors[p.indices]!.count / 3, 0);
  expect(triangles).toBeGreaterThanOrEqual(budget[0]!);
  expect(triangles).toBeLessThanOrEqual(budget[1]!);
  const positions = parts.map(p => model.accessors[p.attributes.POSITION]!);
  size.forEach((length, axis) => {
    const min = Math.min(...positions.map(p => p.min[axis]!));
    const max = Math.max(...positions.map(p => p.max[axis]!));
    const bottom = axis === 1 ? 0 : -length / 2;
    expect(min).toBeCloseTo(bottom, 1);
    expect(max).toBeCloseTo(bottom + length, 1);
  });
});
