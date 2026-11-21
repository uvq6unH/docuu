import { expect, it } from 'vitest';
import { InstancedMesh, Matrix4 } from 'three';
import { createObjectDetail } from '../../src/world/object-detail';
import { disposeScene } from '../../src/core/scene';

it('batches decorative variants deterministically across scene reloads', () => {
  const first = createObjectDetail();
  const second = createObjectDetail();
  expect(first.children).toHaveLength(2);
  const matrix = new Matrix4();
  first.children.forEach((child, index) => {
    const other = second.children[index];
    if (!(child instanceof InstancedMesh) || !(other instanceof InstancedMesh)) throw new Error('Expected instanced details');
    expect(child.count).toBeGreaterThan(0);
    expect(child.instanceMatrix.array).toEqual(other.instanceMatrix.array);
    expect(child.instanceColor?.array).toEqual(other.instanceColor?.array);
    for (let instance = 0; instance < child.count; instance++) {
      child.getMatrixAt(instance, matrix);
      expect(matrix.elements.every(Number.isFinite)).toBe(true);
    }
  });
  disposeScene(first);
  disposeScene(second);
});
