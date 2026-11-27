import {
  Box3, Color, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, Vector3, type BufferGeometry,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DoorState } from '../../../packages/shared/src/doors';
import { villageMap } from './shared-map';
import { createKitHouseTrim } from './kit-house-trim';
import { detailModelSurfaces } from './surface-detail';

interface KitGeometry { body: BufferGeometry; roof?: BufferGeometry }
const cache = new Map<string, Promise<KitGeometry>>();
const doors = new Map<string, { mesh: Mesh; yaw: number; angle: number }>();
const material = () => new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });

/** Flatten each GLB once, retaining its vertex colours, then instance repeated placements. */
function geometryFor(asset: string): Promise<KitGeometry> {
  const cached = cache.get(asset);
  if (cached) return cached;
  const promise = new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'assets/village/' + asset + '.glb').then(gltf => {
    gltf.scene.updateMatrixWorld(true);
    const parts: BufferGeometry[] = [];
    let roof: BufferGeometry | undefined;
    gltf.scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const source = geometry.getAttribute('color');
      const tint = object.material instanceof MeshStandardMaterial ? object.material.color : new Color('white');
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      const pixel = new Color();
      for (let index = 0; index < colors.length / 3; index++) {
        // The supplied prototype stores its palette as sRGB bytes.
        pixel.setRGB(source?.getX(index) ?? 1, source?.getY(index) ?? 1, source?.getZ(index) ?? 1).convertSRGBToLinear().multiply(tint);
        colors[index * 3] = pixel.r;
        colors[index * 3 + 1] = pixel.g;
        colors[index * 3 + 2] = pixel.b;
      }
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      }
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      if (object.name === 'roof_removable') {
        geometry.computeVertexNormals();
        roof = geometry;
      } else parts.push(geometry);
      object.geometry.dispose();
      for (const sourceMaterial of Array.isArray(object.material) ? object.material : [object.material]) sourceMaterial.dispose();
    });
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) {
      roof?.dispose();
      throw new Error('Không đọc được geometry ' + asset);
    }
    return roof ? { body: geometry, roof } : { body: geometry };
  }).catch(error => {
    cache.delete(asset);
    throw error;
  });
  cache.set(asset, promise);
  return promise;
}

export async function loadKitModels(village: Group, jailModel: Group, isDisposed: () => boolean, onProgress?: (loaded: number, total: number) => void) {
  const assets = new Set(villageMap.objects.map(object => object.asset));
  assets.add('terrain_80m'); assets.add('door_wood'); assets.add('prison');
  const failures: string[] = [];
  let loaded = 0;
  await Promise.all([...assets].map(async asset => {
    try {
      const { body: geometry, roof } = await geometryFor(asset);
      if (isDisposed()) return;
      if (asset === 'prison') {
        const mesh = new Mesh(geometry.clone(), material());
        const bounds = new Box3().setFromObject(mesh), size = bounds.getSize(new Vector3());
        mesh.scale.set(4 / size.x, 1, 4 / size.z);
        mesh.castShadow = mesh.receiveShadow = true;
        jailModel.add(mesh);
      } else if (asset === 'door_wood') {
        doors.clear();
        for (const door of villageMap.doors ?? []) {
          const mesh = new Mesh(geometry.clone(), material());
          mesh.name = door.id;
          mesh.position.set(...door.hinge);
          mesh.rotation.y = door.yaw;
          mesh.scale.y = door.size[1] / 2;
          mesh.castShadow = mesh.receiveShadow = true;
          village.add(mesh);
          doors.set(door.id, { mesh, yaw: door.yaw, angle: 0 });
        }
      } else if (asset === 'terrain_80m') {
        const mesh = new Mesh(geometry.clone(), material());
        mesh.name = 'kit-terrain';
        mesh.receiveShadow = true;
        village.add(mesh);
      } else {
        const objects = villageMap.objects.filter(object => object.asset === asset);
        const mesh = new InstancedMesh(geometry.clone(), material(), objects.length);
        const matrix = new Matrix4();
        objects.forEach((object, index) => {
          matrix.makeTranslation(...object.pos).multiply(new Matrix4().makeRotationY(object.yaw)).scale(new Vector3(...object.scale));
          mesh.setMatrixAt(index, matrix);
        });
        mesh.name = asset;
        mesh.castShadow = asset !== 'rice_patch';
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        village.add(mesh);
        if (roof) {
          const roofMaterial = material();
          roofMaterial.name = asset === 'house_thatch' ? 'straw' : 'fired_clay';
          const roofBatch = new InstancedMesh(roof.clone(), roofMaterial, objects.length);
          roofBatch.name = asset + '-roof';
          roofBatch.instanceMatrix.array.set(mesh.instanceMatrix.array);
          roofBatch.castShadow = roofBatch.receiveShadow = true;
          roofBatch.computeBoundingSphere();
          detailModelSurfaces(roofBatch, true);
          village.add(roofBatch, createKitHouseTrim(asset, geometry, objects));
        }
      }
    } catch (error) {
      failures.push(asset);
      console.error('Không tải được GLB ' + asset, error);
    } finally {
      if (!isDisposed()) onProgress?.(++loaded, assets.size);
    }
  }));
  if (failures.length) throw new Error('Cảnh làng chưa tải đầy đủ. Kiểm tra kết nối và tải lại trang.');
}

export function updateKitDoors(states: DoorState[], seconds: number) {
  for (const state of states) {
    const visual = doors.get(state.id);
    if (!visual) continue;
    visual.angle += (state.angle - visual.angle) * Math.min(1, seconds * 18);
    visual.mesh.rotation.y = visual.yaw + visual.angle;
  }
}
