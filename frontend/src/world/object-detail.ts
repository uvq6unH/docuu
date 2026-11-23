import { BoxGeometry, Color, DodecahedronGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D } from 'three';
import { villageMap } from './shared-map';

// Small visual details are batched by geometry to keep the village inexpensive.
export function createObjectDetail() {
  const group = new Group();
  group.name = 'object-detail';
  const boxes: { matrix: Matrix4; color: string }[] = [];
  const fruit: { matrix: Matrix4; color: string }[] = [];
  const pose = new Object3D();
  let parent = new Matrix4();
  function box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, tilt = 0) {
    pose.position.set(x, y, z);
    pose.rotation.set(0, 0, tilt);
    pose.scale.set(w, h, d);
    pose.updateMatrix();
    boxes.push({ matrix: new Matrix4().multiplyMatrices(parent, pose.matrix), color });
  }
  villageMap.objects.forEach((object, index) => {
    if (object.footprint) return;
    pose.position.set(...object.pos);
    pose.rotation.set(0, object.yaw, 0);
    pose.scale.set(...object.scale);
    pose.updateMatrix();
    parent = pose.matrix.clone();
    if (object.asset.startsWith('house_')) {
      const bounds = villageMap.colliders.find(c => c.id === object.id + '_box')!;
      parent.scale(pose.scale.set(bounds.size[0] / 8, bounds.size[1] / 5, bounds.size[2] / 8));
      const wood = ['#64513b', '#795440', '#52624d'][index % 3]!;
      const brick = ['#a26f50', '#8e8264', '#ad7854'][index % 3]!;
      // Foundation and shallow brick courses stay inside the building footprint.
      for (const side of [-1, 1]) {
        box(0, .16, side * 3.91, 7.8, .32, .12, brick);
        box(side * 3.91, .16, 0, .12, .32, 7.8, brick);
        box(side * 3.82, 1.55, -3.95, .14, 2.85, .09, wood);
      }
      box(0, 2.88, -3.96, 7.78, .16, .08, wood);
      const doorX = object.asset === 'house_b' ? -.8 : object.asset === 'house_c' ? .8 : 0;
      for (const side of [-1, 1]) {
        box(doorX + side * .68, 1.13, -3.97, .1, 2.26, .06, wood);
        for (const windowX of [-2.62, 2.62]) {
          box(windowX + side * .73, 1.56, -3.97, .08, 1.42, .05, wood);
        }
      }
      box(doorX, 2.29, -3.97, 1.44, .12, .05, wood);
      box(doorX, 1.08, -3.98, .035, 2.1, .04, '#d4b17a');
      box(doorX + .12, 1.08, -4, .05, .13, .025, '#cbb26f');
      for (const windowX of [-2.62, 2.62]) {
        if (index % 3 === 0) {
          for (let bar = -2; bar <= 2; bar++) {
            box(windowX + bar * .23, 1.55, -3.99, .045, 1.22, .025, wood);
          }
        } else if (index % 3 === 1) {
          box(windowX, 1.56, -3.99, 1.25, .07, .03, '#d7c28f');
          box(windowX, 1.56, -3.99, .07, 1.23, .03, '#d7c28f');
        } else {
          box(windowX, 1.56, -3.99, 1.45, .09, .03, wood, .63);
          box(windowX, 1.56, -3.99, 1.45, .09, .03, wood, -.63);
        }
      }
      // Each roof gets a slightly different ridge and decorative gable vent.
      box(0, 4.91, 0, 7.8, .13, .2 + index % 3 * .06, brick);
      for (const side of [-1, 1]) {
        for (let slat = -1; slat <= 1; slat++) {
          box(side * 3.98, 3.65 + slat * .15, 0, .025, .055, .7 - Math.abs(slat) * .15, wood);
        }
      }
    } else if (object.asset === 'fence_segment') {
      const wood = index % 2 ? '#9d784b' : '#766047';
      for (const x of [-1.94, -.65, .65, 1.94]) {
        for (const y of [.2, .48]) {
          box(x, y, -.065, .18, .035, .12, '#d4bd82');
        }
      }
      for (const center of [-1.3, 0, 1.3]) {
        box(center, .34, 0, 1.27, .045, .045, wood, index % 2 ? .28 : -.28);
        if (index % 2 === 0) box(center, .34, .025, 1.27, .04, .04, wood, .28);
      }
    } else if (object.asset.startsWith('tree_') && index % 3 !== 0) {
      for (let n = 0; n < 9; n++) {
        const angle = n * 2.399 + index;
        pose.position.set(Math.cos(angle) * 1.15, 3.2 + n % 3 * .35, Math.sin(angle) * 1.15);
        pose.rotation.set(0, angle, 0);
        pose.scale.setScalar(.075 + n % 2 * .025);
        pose.updateMatrix();
        fruit.push({ matrix: new Matrix4().multiplyMatrices(parent, pose.matrix), color: index % 2 ? '#d7a245' : '#ab6139' });
      }
    } else if (object.asset === 'haystack') {
      for (let n = 0; n < 16; n++) {
        const angle = (n / 16) * Math.PI * 2;
        box(Math.cos(angle) * 1.08, .16, Math.sin(angle) * 1.08, .14, .34, .14, n % 2 ? '#dcb35e' : '#c49645', Math.sin(angle) * .24);
      }
      for (let n = 0; n < 8; n++) {
        const angle = (n / 8) * Math.PI * 2 + 0.3;
        box(Math.cos(angle) * 0.85, .82, Math.sin(angle) * 0.85, .12, .24, .12, n % 2 ? '#eed378' : '#d2a74c', Math.cos(angle) * .2);
      }
    }
  });
  for (const [parts, geometry] of [[boxes, new BoxGeometry()], [fruit, new DodecahedronGeometry(1, 0)]] as const) {
    const mesh = new InstancedMesh(geometry, new MeshStandardMaterial({ roughness: 1 }), parts.length);
    parts.forEach((part, index) => {
      mesh.setMatrixAt(index, part.matrix);
      mesh.setColorAt(index, new Color(part.color));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
