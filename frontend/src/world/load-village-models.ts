import { Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeScene } from '../core/scene';
import { villageMap } from './shared-map';
import { detailModelSurfaces } from './surface-detail';
import { createObjectDetail } from './object-detail';
import { createEnterableHouses } from './enterable-houses';

export async function loadVillageModels(village: Group, jailModel: Group, isDisposed: () => boolean) {
  const loader = new GLTFLoader();
  const objects = villageMap.objects;
  const assets = new Set([...objects.map(o => o.asset), 'jail']);
  await Promise.all([...assets].map(async asset => {
    try {
      const { scene } = await loader.loadAsync(import.meta.env.BASE_URL + 'models/' + asset + '.glb');
      if (isDisposed()) {
        disposeScene(scene);
        return;
      }
      if (asset.startsWith('house_') && objects.some(object => object.asset === asset && object.footprint)) {
        disposeScene(scene);
        for (const object of objects.filter(object => object.asset === asset)) {
          village.getObjectByName(object.id)!.visible = false;
        }
        return;
      }
      detailModelSurfaces(scene);
      if (asset === 'jail') {
        scene.traverse(part => {
          if (part instanceof Mesh) part.castShadow = part.receiveShadow = true;
        });
        jailModel.add(scene);
        return;
      }
      scene.updateMatrixWorld(true);
      const placements = objects.filter(o => o.asset === asset).map(object => {
        const placeholder = village.getObjectByName(object.id)!;
        placeholder.updateMatrix();
        const matrix = placeholder.matrix.clone();
        if (asset.startsWith('house_')) {
          // House sources are 8 x 5 x 8 metres. Each lot supplies its own footprint.
          const { size } = villageMap.colliders.find(c => c.id === object.id + '_box')!;
          matrix.scale(new Vector3(size[0] / 8, size[1] / 5, size[2] / 8));
        }
        if (asset === 'haystack') matrix.scale(new Vector3(1.12, 1.3, 1.12));
        if (asset.startsWith('tree_')) matrix.multiply(new Matrix4().makeRotationY(Number(object.id.slice(1)) * .73));
        return { placeholder, matrix, variant: Number(object.id.slice(1)) };
      });
      const batch = new Group();
      batch.name = asset;
      scene.traverse(part => {
        if (!(part instanceof Mesh)) return;
        const mesh = new InstancedMesh(part.geometry, part.material, placements.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        placements.forEach(({ matrix, variant }, index) => {
          mesh.setMatrixAt(index, new Matrix4().multiplyMatrices(matrix, part.matrixWorld));
          const color = new Color('#ffffff');
          if (part.material instanceof MeshStandardMaterial && part.material.name === 'canopy') {
            color.setHSL(.17 + variant % 4 * .025, .16, .76 + variant % 3 * .05);
          } else {
            color.setHSL(.08, variant % 3 * .035, .88 + variant % 4 * .035);
          }
          mesh.setColorAt(index, color);
        });
        mesh.computeBoundingSphere();
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        batch.add(mesh);
      });
      if (!batch.children.length) throw new Error('Empty model');
      batch.matrixAutoUpdate = false;
      batch.updateMatrix();
      village.add(batch);
      for (const { placeholder } of placements) placeholder.visible = false;
    } catch (error) {
      console.warn('Giữ mẫu graybox cho ' + asset, error);
    }
  }));
  if (!isDisposed()) {
    village.add(createObjectDetail(), createEnterableHouses());
    for (const object of objects.filter(object => object.footprint)) {
      village.getObjectByName(object.id)!.visible = false;
    }
  }
}
