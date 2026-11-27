// @vitest-environment node
import { readFileSync } from 'node:fs';
import { Box3, BufferGeometry, Matrix4, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { createKitHouseTrim } from '../../src/world/kit-house-trim';

it.each(['house_tile', 'house_thatch', 'house_brick', 'house_two_storey', 'shop'])(
  '%s keeps the entrance clear when adding facade trim', async asset => {
    const file = new URL(`../../vietnam-village-kit/assets/${asset}.glb`, import.meta.url);
    const gltf = await new GLTFLoader().parseAsync(new Uint8Array(readFileSync(file)).buffer, '');
    const roof = gltf.scene.getObjectByName('roof_removable')!;
    roof.removeFromParent();
    const shell = new Box3().setFromObject(gltf.scene);
    const body = new BufferGeometry().setFromPoints([shell.min, shell.max]);
    const trim = createKitHouseTrim(asset, body, [{ id: 'fixture', asset, pos: [0, 0, 0], yaw: 0, scale: [1, 1, 1] }]);
    const entrance = new Box3(new Vector3(-.55, .18, shell.max.z - .25), new Vector3(.55, 2.04, shell.max.z + .3));
    const unitBox = new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5));
    const matrix = new Matrix4();
    expect(trim.count).toBeGreaterThan(0);
    for (let index = 0; index < trim.count; index++) {
      trim.getMatrixAt(index, matrix);
      expect(unitBox.clone().applyMatrix4(matrix).intersectsBox(entrance)).toBe(false);
    }
    trim.dispose();
    trim.geometry.dispose();
    trim.material.dispose();
  },
);
