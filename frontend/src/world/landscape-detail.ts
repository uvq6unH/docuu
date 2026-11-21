import { Color, ConeGeometry, DodecahedronGeometry, Group, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { villageMap } from './shared-map';

export function createLandscapeDetail() {
  const group = new Group();
  group.name = 'landscape-detail';
  const trees = villageMap.objects.filter(object => object.asset.startsWith('tree_'));
  const grass = new InstancedMesh(
    new ConeGeometry(.06, .22, 3),
    new MeshStandardMaterial({ color: '#718348', roughness: 1 }),
    trees.length * 36,
  );
  const placement = new Object3D();
  const color = new Color();
  let seed = 1643;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  trees.forEach((tree, index) => {
    for (let blade = 0; blade < 36; blade++) {
      const angle = random() * Math.PI * 2;
      const radius = .5 + random() * 1.5;
      placement.position.set(tree.pos[0] + Math.cos(angle) * radius, .09, tree.pos[2] + Math.sin(angle) * radius);
      placement.rotation.set(0, angle, .15);
      placement.scale.setScalar(.6 + random() * .8);
      placement.updateMatrix();
      const instance = index * 36 + blade;
      grass.setMatrixAt(instance, placement.matrix);
      grass.setColorAt(instance, color.setHSL(.19 + random() * .05, .32, .3 + random() * .12));
    }
  });
  grass.receiveShadow = true;
  grass.computeBoundingSphere();
  group.add(grass);

  const clouds = new InstancedMesh(
    new DodecahedronGeometry(1, 1),
    new MeshStandardMaterial({ color: '#fff5de', roughness: 1, flatShading: true }),
    36,
  );
  for (let index = 0; index < 36; index++) {
    const cluster = Math.floor(index / 6);
    const angle = cluster / 6 * Math.PI * 2;
    placement.position.set(Math.cos(angle) * 65 + random() * 16, 26 + random() * 3, Math.sin(angle) * 65 + random() * 12);
    placement.rotation.set(0, random() * Math.PI, 0);
    placement.scale.set(5 + random() * 4, 1.2 + random() * 1.5, 3 + random() * 3);
    placement.updateMatrix();
    clouds.setMatrixAt(index, placement.matrix);
  }
  clouds.computeBoundingSphere();
  group.add(clouds);
  return group;
}
