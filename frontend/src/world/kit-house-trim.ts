import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, type BufferGeometry } from 'three';
import type { MapObject } from '../../../packages/shared/src/map';

const shutterColors: Record<string, string> = {
  house_tile: '#4d674a', house_brick: '#3b6056', house_thatch: '#775034',
  house_two_storey: '#436559', shop: '#3f6754',
};

/** Dress the GLB shell in house-local space. All trim is visual and clears the swinging door. */
export function createKitHouseTrim(asset: string, body: BufferGeometry, houses: MapObject[]) {
  body.computeBoundingBox();
  const bounds = body.boundingBox!;
  const halfWidth = bounds.max.x;
  const halfDepth = bounds.max.z;
  const height = bounds.max.y;
  const thatch = asset === 'house_thatch';
  const twoStorey = asset === 'house_two_storey';
  const shop = asset === 'shop';
  const timber = thatch ? '#9b6d46' : '#64432d';
  const shutter = shutterColors[asset] ?? '#4d674a';
  const stone = '#b1a08a';
  const transform = new Matrix4();
  const piece = new Object3D();
  const parts: { matrix: Matrix4; color: string }[] = [];

  function box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, pitch = 0, yaw = 0) {
    piece.position.set(x, y, z);
    piece.scale.set(w, h, d);
    piece.rotation.set(pitch, yaw, 0);
    piece.updateMatrix();
    parts.push({ matrix: new Matrix4().multiplyMatrices(transform, piece.matrix), color });
  }

  function window(x: number, y: number, z: number, yaw: number, width = 1.08) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    function layer(u: number, v: number, offset: number, w: number, h: number, d: number, color: string) {
      box(x + u * cos + offset * sin, y + v, z - u * sin + offset * cos, w, h, d, color, 0, yaw);
    }
    layer(0, 0, .035, width + .12, 1.16, .09, timber);
    layer(0, 0, .085, width, 1.04, .045, '#35382b');
    for (const side of [-1, 1]) {
      layer(side * width / 4, 0, .113, width / 2 - .035, .98, .042, shutter);
      for (let row = -2; row <= 2; row++) {
        layer(side * width / 4, row * .16, .14, width / 2 - .11, .032, .028, timber);
      }
    }
    layer(0, -.6, .065, width + .26, .11, .23, thatch ? timber : stone);
  }

  for (const house of houses) {
    transform.makeRotationY(house.yaw).scale(piece.position.set(...house.scale)).setPosition(...house.pos);
    const front = halfDepth;
    // Keep the original 1.1 m opening clear on both sides of the hinge.
    for (const side of [-1, 1]) {
      box(side * .61, 1.13, front, .10, 1.90, .14, timber);
      for (const end of [-1, 1]) {
        box(side * (halfWidth - .045), height / 2, end * (halfDepth - .045), .18, height, .18, thatch ? timber : stone);
        window(side * (halfWidth - .95), 1.48, end * halfDepth, end === 1 ? 0 : Math.PI, shop ? .88 : 1.08);
        if (twoStorey) window(side * (halfWidth - .95), 4.18, end * halfDepth, end === 1 ? 0 : Math.PI);
      }
      window(side * halfWidth, 1.52, 0, side * Math.PI / 2);
      if (twoStorey) window(side * halfWidth, 4.18, 0, side * Math.PI / 2);
      box(0, height - .11, side * halfDepth, halfWidth * 2 + .16, .16, .16, timber);
      box(side * halfWidth, height - .11, 0, .16, .16, halfDepth * 2, timber);
      if (twoStorey) {
        box(0, 2.96, side * halfDepth, halfWidth * 2 + .14, .20, .15, stone);
        box(side * halfWidth, 2.96, 0, .15, .20, halfDepth * 2, stone);
      }
    }
    box(0, 2.11, front, 1.32, .13, .15, timber);

    if (thatch) {
      for (let x = -halfWidth + .21; x < halfWidth - .12; x += .29) {
        box(x, height / 2, -halfDepth, .035, height - .35, .04, timber);
        if (Math.abs(x) > .69) box(x, height / 2, front, .035, height - .35, .04, timber);
      }
    }
    if (shop) {
      for (let stripe = 0; stripe < 12; stripe++) {
        box((stripe - 5.5) * .36, 2.43, front + .36, .36, .08, .8,
          stripe % 2 === 0 ? '#d8c3a2' : '#667d89', .21);
      }
    }
  }

  const trim = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: .92 }), parts.length);
  trim.name = asset + '-facade';
  const color = new Color();
  parts.forEach((part, index) => {
    trim.setMatrixAt(index, part.matrix);
    trim.setColorAt(index, color.set(part.color));
  });
  trim.receiveShadow = true;
  trim.computeBoundingSphere();
  return trim;
}
