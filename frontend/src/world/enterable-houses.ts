import {
  BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group,
  InstancedMesh, Mesh, MeshStandardMaterial, Object3D,
} from 'three';
import { villageMap } from './shared-map';
import { detailModelSurfaces } from './surface-detail';

/** Render the same wall, doorway, ceiling and furniture boxes used by the server. */
export function createEnterableHouses() {
  const group = new Group();
  group.name = 'enterable-houses';
  const parts = new Map<string, { pose: Object3D; color: string }[]>();
  function block(material: string, color: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    const pose = new Object3D();
    pose.position.set(x, y, z);
    pose.scale.set(w, h, d);
    pose.updateMatrix();
    const batch = parts.get(material) ?? [];
    batch.push({ pose, color });
    parts.set(material, batch);
  }
  villageMap.objects.filter(object => object.footprint).forEach((house, index) => {
    const [w, d] = house.footprint!;
    const [x, , z] = house.pos;
    const style = index % 3;
    const wall = ['#e5cf9e', '#e6ddd0', '#c9b789', '#d5b697'][index % 4]!;
    const wood = ['#674835', '#54604c', '#74543b'][style]!;
    const tile = ['#a95438', '#85523f', '#b46e43'][style]!;
    const boxes = villageMap.colliders.filter(box => box.id.startsWith(house.id + '_'));
    for (const box of boxes) {
      const furniture = box.id.endsWith('bench') || box.id.endsWith('cabinet');
      const ceiling = box.id.endsWith('ceiling');
      block(furniture || ceiling ? 'bark' : 'lime_plaster', furniture || ceiling ? wood : wall,
        ...box.center, ...box.size);
    }
    // Floors are flush with the authoritative y=0 ground.
    block('floor', style === 1 ? '#a28768' : '#b88d66', x, -.015, z, w - .48, .04, d - .48);
    for (let board = 0; board < 8; board++) {
      block('bark', '#796448', x - w / 2 + .6 + board * (w - 1.2) / 7, .009, z, .018, .006, d - .5);
    }
    for (const side of [-1, 1]) {
      for (const corner of [-1, 1]) {
        block('bark', wood, x + side * (w / 2 - .1), 1.65, z + corner * (d / 2 - .1), .24, 3.2, .24);
      }
      block('bark', wood, x, 3.22, z + side * (d / 2 - .08), w + .1, .16, .32);
      // Closed side shutters add depth without suggesting an open passage.
      const sideX = x + side * (w / 2 + .018);
      block('bark', wood, sideX, 1.7, z, .04, 1.1, 1.5);
      for (let slat = -2; slat <= 2; slat++) {
        block('bark', '#b6a17a', sideX + side * .028, 1.7 + slat * .18, z, .03, .035, 1.35);
      }
    }
    for (const side of [-1, 1]) {
      const face = z + side * (d / 2 - .12);
      // Solid proud door frames - envelopes doorway seam cleanly to prevent z-fighting
      for (const jamb of [-1, 1]) {
        block('bark', wood, x + jamb * .82, 1.2, face, .14, 2.42, .34);
      }
      block('bark', wood, x, 2.44, face, 1.84, .14, .34);
      // Foundation is proud of wall collider
      for (const sign of [-1, 1]) {
        block('foundation', '#9c795b', x + sign * (w / 4 + .4), .14, face, (w - 1.6) / 2, .28, .32);
      }
      for (const window of [-1, 1]) {
        const windowX = x + window * (w / 2 - 1.1);
        block('bark', wood, windowX, 1.66, face + side * .14, 1.12, 1.1, .06);
        for (let slat = -2; slat <= 2; slat++) {
          block('bark', '#b4a17b', windowX, 1.66 + slat * .18, face + side * .17, .96, .035, .035);
        }
        block('bark', wood, windowX, 1.09, face, 1.2, .09, .32);
      }
    }
    // Beams and distinct ceiling patterns remain above standing head height.
    const beamCount = style === 0 ? 5 : 3;
    for (let beam = 0; beam < beamCount; beam++) {
      block('bark', wood, x, 3.13, z - d / 2 + .7 + beam * (d - 1.4) / (beamCount - 1), w - .48, .14, .15);
    }
    // Storage furniture has the same solid volume in the map and in the scene.
    const cabinet = boxes.find(box => box.id.endsWith('cabinet'))!;
    for (let shelf = 0; shelf < 3; shelf++) {
      block('bark', '#bfa677', cabinet.center[0] + .355, .38 + shelf * .5, cabinet.center[2], .025, .035, 1.35);
      block('bark', '#d3bd80', cabinet.center[0] + .38, .58 + shelf * .5, cabinet.center[2], .035, .08, .06);
    }

    const base = 3.36;
    const top = style === 0 ? 4.95 : style === 1 ? 4.65 : 4.4;
    const halfW = w / 2 + .08, halfD = d / 2 + .08;
    const ridge = style === 1 ? w * .22 : halfW;
    block('foundation', tile, x, top + .025, z + (style === 2 ? -halfD : 0), ridge * 2, .09, .14);
    const vertices = [
      [-halfW, base, -halfD], [halfW, base, -halfD],
      [halfW, base, halfD], [-halfW, base, halfD],
      [-ridge, top, style === 2 ? -halfD : 0], [ridge, top, style === 2 ? -halfD : 0],
    ];
    const faces = [[0, 1, 5, 4], [3, 4, 5, 2], [0, 4, 3], [1, 2, 5], [0, 3, 2, 1]];
    const positions: number[] = [];
    for (const face of faces) {
      for (let triangle = 1; triangle < face.length - 1; triangle++) {
        for (const vertex of [face[0]!, face[triangle]!, face[triangle + 1]!]) positions.push(...vertices[vertex]!);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = new MeshStandardMaterial({ color: tile, roughness: .88 });
    material.name = 'fired_clay';
    const roof = new Mesh(geometry, material);
    roof.name = house.id + '-roof-' + ['gable', 'hip', 'lean'][style];
    roof.position.set(x, 0, z);
    roof.castShadow = roof.receiveShadow = true;
    group.add(roof);
  });
  for (const [name, batch] of parts) {
    const geometry = new BoxGeometry();
    const material = new MeshStandardMaterial({ roughness: 1 });
    if (name === 'bark' || name === 'foundation') {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -2;
    }
    material.name = name;
    const mesh = new InstancedMesh(geometry, material, batch.length);
    batch.forEach(({ pose, color }, index) => {
      mesh.setMatrixAt(index, pose.matrix);
      mesh.setColorAt(index, new Color(color));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  detailModelSurfaces(group);
  return group;
}
