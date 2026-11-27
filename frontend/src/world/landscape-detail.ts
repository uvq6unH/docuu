import {
  Color, ConeGeometry, DodecahedronGeometry, Group,
  InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry,
} from 'three';
import { villageMap } from './shared-map';
import { terrainHeight } from '../../../packages/shared/src/terrain';

export function createLandscapeDetail() {
  const group = new Group();
  group.name = 'landscape-detail';

  let seed = 1643;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const placement = new Object3D();
  const color = new Color();

  // 1. Lush Organic Grass Tufts around trees, fences and open field
  const trees = villageMap.objects.filter(object => object.asset.startsWith('tree_'));
  const fences = villageMap.objects.filter(object => object.asset.startsWith('fence_'));
  const totalGrassBlades = (trees.length + fences.length) * 32;

  const grassMesh = new InstancedMesh(
    new ConeGeometry(0.065, 0.28, 4),
    new MeshStandardMaterial({ color: '#5b8c3a', roughness: 0.9 }),
    totalGrassBlades,
  );

  let bladeIdx = 0;
  trees.forEach((tree) => {
    for (let i = 0; i < 32; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 0.6 + random() * 2.2;
      placement.position.set(
        tree.pos[0] + Math.cos(angle) * radius,
        0.11,
        tree.pos[2] + Math.sin(angle) * radius,
      );
      placement.rotation.set(0, angle, 0.15 + (random() - 0.5) * 0.2);
      placement.position.y += terrainHeight(placement.position.x, placement.position.z, villageMap);
      placement.scale.setScalar(0.7 + random() * 0.7);
      placement.updateMatrix();
      grassMesh.setMatrixAt(bladeIdx, placement.matrix);
      grassMesh.setColorAt(bladeIdx, color.setHSL(0.24 + random() * 0.05, 0.45, 0.32 + random() * 0.14));
      bladeIdx++;
    }
  });

  fences.forEach((fence) => {
    for (let i = 0; i < 32; i++) {
      const offset = (random() - 0.5) * 3.8;
      const side = (random() > 0.5 ? 1 : -1) * (0.2 + random() * 0.4);
      placement.position.set(fence.pos[0] + offset, 0.1, fence.pos[2] + side);
      placement.position.y += terrainHeight(placement.position.x, placement.position.z, villageMap);
      placement.rotation.set(0, random() * Math.PI * 2, 0.12);
      placement.scale.setScalar(0.6 + random() * 0.6);
      placement.updateMatrix();
      grassMesh.setMatrixAt(bladeIdx, placement.matrix);
      grassMesh.setColorAt(bladeIdx, color.setHSL(0.23 + random() * 0.06, 0.42, 0.34 + random() * 0.12));
      bladeIdx++;
    }
  });

  grassMesh.receiveShadow = true;
  grassMesh.computeBoundingSphere();
  group.add(grassMesh);

  // 2. Wildflower Blooms (Buttercup yellows & daisy whites scattered naturally)
  const flowerCount = 96;
  const flowerMesh = new InstancedMesh(
    new DodecahedronGeometry(0.06, 0),
    new MeshStandardMaterial({ roughness: 0.8 }),
    flowerCount,
  );

  for (let f = 0; f < flowerCount; f++) {
    const parentTree = trees[f % trees.length]!;
    const angle = random() * Math.PI * 2;
    const radius = 1.0 + random() * 2.5;
    placement.position.set(
      parentTree.pos[0] + Math.cos(angle) * radius,
      0.18 + random() * 0.08,
      parentTree.pos[2] + Math.sin(angle) * radius,
    );
    placement.rotation.set(random() * 0.2, random() * Math.PI, random() * 0.2);
    placement.position.y += terrainHeight(placement.position.x, placement.position.z, villageMap);
    placement.scale.setScalar(0.8 + random() * 0.6);
    placement.updateMatrix();
    flowerMesh.setMatrixAt(f, placement.matrix);

    // 60% golden buttercup, 40% soft ivory daisy
    if (random() > 0.4) {
      color.setRGB(0.96, 0.82 + random() * 0.1, 0.22);
    } else {
      color.setRGB(0.98, 0.97, 0.92);
    }
    flowerMesh.setColorAt(f, color);
  }
  flowerMesh.computeBoundingSphere();
  group.add(flowerMesh);

  // 3. Fluffy Organic Cumulus Clouds (Multi-sphere volumetric clusters)
  const cloudsGroup = new Group();
  cloudsGroup.name = 'clouds-cluster';

  const cloudMat = new MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.95,
    flatShading: true,
  });

  // 12 cloud formations, each with 5-7 rounded puffs
  const cloudBankCount = 14;
  const puffsPerBank = 6;
  const totalPuffs = cloudBankCount * puffsPerBank;

  const puffsMesh = new InstancedMesh(
    new SphereGeometry(1, 7, 6),
    cloudMat,
    totalPuffs,
  );

  let puffIdx = 0;
  for (let b = 0; b < cloudBankCount; b++) {
    const angle = (b / cloudBankCount) * Math.PI * 2 + (random() - 0.5) * 0.4;
    const dist = 48 + random() * 32;
    const baseCloudX = Math.cos(angle) * dist;
    const baseCloudZ = Math.sin(angle) * dist;
    const baseCloudY = 28 + random() * 12;

    for (let p = 0; p < puffsPerBank; p++) {
      const offsetX = (p - puffsPerBank / 2) * (2.8 + random() * 1.2);
      const offsetY = Math.sin((p / puffsPerBank) * Math.PI) * (1.6 + random() * 0.8);
      const offsetZ = (random() - 0.5) * 3.5;
      const puffScale = (2.6 + random() * 2.2) * (1.0 - Math.abs(p - puffsPerBank / 2) * 0.12);

      placement.position.set(baseCloudX + offsetX, baseCloudY + offsetY, baseCloudZ + offsetZ);
      placement.rotation.set(random() * 0.5, random() * Math.PI, 0);
      placement.scale.set(puffScale * 1.4, puffScale * 0.85, puffScale * 1.2);
      placement.updateMatrix();
      puffsMesh.setMatrixAt(puffIdx, placement.matrix);

      // Subtle warm sunlight gradient on cloud tops
      const puffLightness = 0.92 + (offsetY > 1 ? 0.08 : 0);
      color.setRGB(puffLightness, puffLightness * 0.98, puffLightness * 0.95);
      puffsMesh.setColorAt(puffIdx, color);
      puffIdx++;
    }
  }

  puffsMesh.computeBoundingSphere();
  cloudsGroup.add(puffsMesh);
  group.add(cloudsGroup);

  return group;
}
