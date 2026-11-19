import { Group, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeScene } from '../core/scene';
import { villageMap } from './shared-map';

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
      if (asset === 'jail') {
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
        return { placeholder, matrix };
      });
      const batch = new Group();
      batch.name = asset;
      scene.traverse(part => {
        if (!(part instanceof Mesh)) return;
        const mesh = new InstancedMesh(part.geometry, part.material, placements.length);
        placements.forEach(({ matrix }, index) => {
          mesh.setMatrixAt(index, new Matrix4().multiplyMatrices(matrix, part.matrixWorld));
        });
        mesh.computeBoundingSphere();
        batch.add(mesh);
      });
      if (!batch.children.length) throw new Error('Empty model');
      village.add(batch);
      for (const { placeholder } of placements) placeholder.visible = false;
    } catch (error) {
      console.warn('Giữ mẫu graybox cho ' + asset, error);
    }
  }));
}
