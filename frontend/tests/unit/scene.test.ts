import { describe, expect, it, vi } from 'vitest';
import { Mesh, PlaneGeometry } from 'three';
import type { WebGLRenderer } from 'three';
import { createScene, disposeScene, resizeScene } from '../../src/core/scene';

describe('F04 render scene', () => {
  it('creates the documented 80×80 visual ground and FPS camera', () => {
    const { scene, camera } = createScene();
    const ground = scene.getObjectByName('render-test-ground');
    expect(ground).toBeInstanceOf(Mesh);
    if (!(ground instanceof Mesh) || !(ground.geometry instanceof PlaneGeometry)) throw new Error('Missing ground');
    expect(ground.geometry.parameters.width).toBe(80);
    expect(ground.geometry.parameters.height).toBe(80);
    expect(ground.rotation.x).toBe(-Math.PI / 2);
    expect(camera.position.y).toBe(1.55);
    disposeScene(scene);
  });

  it('releases every scene geometry and material on teardown', () => {
    const { scene } = createScene();
    const disposeSpies = scene.children.flatMap((object) => {
      if (!('geometry' in object) || !('material' in object)) return [];
      const mesh = object as Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      return [vi.spyOn(mesh.geometry, 'dispose'), ...materials.map((material) => vi.spyOn(material, 'dispose'))];
    });
    disposeScene(scene);
    expect(disposeSpies.length).toBeGreaterThan(0);
    for (const spy of disposeSpies) expect(spy).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
  });

  it('guards zero-size containers and caps high-DPI rendering', () => {
    const { scene, camera } = createScene();
    const renderer = { setPixelRatio: vi.fn(), setSize: vi.fn() } as unknown as WebGLRenderer;
    vi.stubGlobal('devicePixelRatio', 3);
    resizeScene(renderer, camera, 0, 0);
    expect(camera.aspect).toBe(1);
    expect(renderer.setSize).toHaveBeenCalledWith(1, 1, false);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.5);
    resizeScene(renderer, camera, 1600, 900);
    expect(camera.aspect).toBeCloseTo(1600 / 900);
    expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
    vi.unstubAllGlobals();
    disposeScene(scene);
  });
});
