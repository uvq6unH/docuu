import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Box3, Matrix4, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = new URL('../vietnam-village-kit/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
const layout = JSON.parse(await readFile(new URL('map.json', root)));
const models = new Map();
for (const [asset, entry] of Object.entries(manifest)) {
  const bytes = await readFile(new URL(entry.file, root));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  models.set(asset, gltf.scene);
}
const terrain = { columns: 41, rows: 41, heights: [] };
models.get('terrain_80m').traverse(part => {
  if (!part.isMesh) return;
  const points = part.geometry.getAttribute('position');
  for (let index = 0; index < points.count; index++) {
    const p = new Vector3().fromBufferAttribute(points, index).applyMatrix4(part.matrixWorld);
    terrain.heights.push(p.y);
  }
});
function height(x, z) {
  const u = Math.max(0, Math.min(40, (x + 40) / 2)), v = Math.max(0, Math.min(40, (40 - z) / 2));
  const col = Math.min(39, Math.floor(u)), row = Math.min(39, Math.floor(v)), tx = u - col, tz = v - row;
  const i = row * 41 + col;
  const [a, b, c, d] = [terrain.heights[i], terrain.heights[i + 1], terrain.heights[i + 41], terrain.heights[i + 42]];
  return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}
const map = { id: 'vietnam-village-kit', size: [80, 80], objects: [], colliders: [], hideZones: [], jails: [], spawns: { police: [], robber: [] }, terrain, doors: [] };
function placement(asset, x, z, yaw = 0, id = 'kit_' + map.objects.length) {
  const object = { id, asset, pos: [x, height(x, z), z], yaw, scale: [1, 1, 1] };
  map.objects.push(object);
  return object;
}
function transform(object) {
  return new Matrix4().makeTranslation(...object.pos).multiply(new Matrix4().makeRotationY(object.yaw));
}
function collider(id, bounds, matrix) {
  const world = bounds.clone().applyMatrix4(matrix);
  const center = world.getCenter(new Vector3()).toArray(), size = world.getSize(new Vector3()).toArray();
  if (size.some(n => n < .005) || Math.abs(center[0]) + size[0] / 2 > 40 || Math.abs(center[2]) + size[2] / 2 > 40) return;
  map.colliders.push({ id, center, size });
}
let houses = 0, trees = 0, bushes = 0;
for (const source of layout.placements) {
  if (source.asset === 'prison') continue;
  let asset = source.asset;
  const house = manifest[asset].category === 'building' && source.id?.startsWith('house');
  if (asset.startsWith('tree_')) asset = ['tree_mango', 'tree_jackfruit', 'tree_flower', 'tree_banana', 'tree_coconut', 'tree_areca', 'tree_banyan'][trees % 7];
  const id = house ? 'H' + String(++houses).padStart(2, '0') : asset.startsWith('tree_') ? 'T' + String(++trees).padStart(2, '0') : 'kit_' + map.objects.length;
  const object = placement(asset, source.position[0], source.position[2], source.rotationY ?? 0, id);
  const model = models.get(asset), parent = transform(object);
  if (house) {
    const socket = manifest[asset].doorSocket;
    const hinge = new Vector3(...socket).applyMatrix4(parent).toArray();
    map.doors.push({ id: id + '_door', hinge, yaw: object.yaw, size: [1.06, 1.85, .1] });
    model.traverse(part => {
      if (!part.isMesh) return;
      part.geometry.computeBoundingBox();
      collider(id + '_' + part.name, part.geometry.boundingBox, parent.clone().multiply(part.matrixWorld));
    });
    // Keep the doorway corridor clear. Larger furniture sits against the back and side walls.
    const furnishings = [
      ['table', [-1.45, .18, -.45]], ['chair', [-1.45, .18, .5]], ['bed', [1.5, .18, -.8]],
      ['cabinet', [-1.6, .18, -1.25]], ['bench', [.1, .18, -1.4]],
      ['altar', [0, .18, -1.65]], ['kitchen_stove', [1.65, .18, .6]], ['clay_jar', [-2, .18, .9]],
    ];
    for (const [interiorAsset, local] of furnishings) {
      const position = new Vector3(...local).applyMatrix4(parent).toArray();
      const item = { id: id + '_' + interiorAsset, asset: interiorAsset, pos: position, yaw: object.yaw, scale: [.75, .85, .75] };
      map.objects.push(item);
      const box = new Box3().setFromObject(models.get(interiorAsset));
      collider(item.id + '_solid', box, transform(item).scale(new Vector3(...item.scale)));
    }
  } else if (asset.startsWith('tree_') || asset === 'bamboo_clump') {
    map.colliders.push({ id: id + '_trunk', center: [object.pos[0], object.pos[1] + 1.2, object.pos[2]], size: [.65, 2.4, .65] });
  } else if (asset === 'bush') {
    object.id = 'B' + String(++bushes).padStart(2, '0');
    map.hideZones.push({ id: object.id + '_hide', center: [object.pos[0], object.pos[1] + .55, object.pos[2]], size: [2, 1.1, 2] });
  }
}
// Foreground landmarks and fields occupy the village edges, leaving the central yard clear.
placement('tree_banyan', -5, 3, .4, 'banyan_square');
map.colliders.push({ id: 'banyan_square_trunk', center: [-5, height(-5, 3) + 2, 3], size: [1.3, 4, 1.3] });
for (const [asset, x, z, yaw] of [
  ['village_gate', 0, 38, Math.PI], ['well', -10, 4, 0], ['lotus_pond', 29, 10, 0],
  ['bridge', 29, 10, 0], ['fence_wood', 25, 13, 0], ['fence_wood', 33, 13, 0],
  ['rock', 26, 7, 0], ['rock', 32, 7, .7],
]) {
  const object = placement(asset, x, z, yaw);
  if (asset === 'bridge') object.scale = [1, 1, 1.6];
  if (asset === 'well' || asset === 'village_gate' || asset === 'bridge' || asset === 'fence_wood') {
    models.get(asset).traverse(part => {
      if (!part.isMesh) return;
      part.geometry.computeBoundingBox();
      collider(object.id + '_' + part.name, part.geometry.boundingBox, transform(object).scale(new Vector3(...object.scale)).multiply(part.matrixWorld));
    });
  }
}
// Water stays outside the walkable bridge corridor.
for (const side of [-1, 1]) {
  map.colliders.push({ id: 'pond_bank_' + side,
    center: [29 + side * 1.65, height(29, 10) + 1, 10], size: [1.1, 3, 4.4] });
}
for (const x of [-34, -31, -28, 28, 31, 34]) {
  for (const z of [-33, -30, 29, 32, 35]) placement('rice_patch', x, z);
}
for (const [index, [x, z]] of [[-13, 16], [13, 16], [-9, -18], [14, -24]].entries()) {
  const object = placement('haystack', x, z, index * .7, 'R0' + (index + 1));
  const box = new Box3().setFromObject(models.get('haystack'));
  const size = box.getSize(new Vector3()).toArray();
  map.hideZones.push({ id: object.id + '_hide', center: [x, object.pos[1] + size[1] / 2, z], size });
}
for (const [index, [x, z]] of [[0, 0], [-12, 10], [27, 26]].entries()) {
  const floor = height(x, z) + .15;
  map.jails.push({ id: 'J' + (index + 1), center: [x, height(x, z), z], size: [4, 4], guardRadius: 5,
    slots: [-.8, .8].flatMap(dz => [-.8, .8].map(dx => [x + dx, floor, z + dz])),
    rescueAnchors: [-2.5, 2.5].map(dx => [x + dx, height(x + dx, z), z]),
    releaseAnchors: [-3.5, 3.5].map(dx => [x + dx, height(x + dx, z), z]) });
}
map.spawns.police = [[-2, -18], [0, -18]].map(([x, z]) => [x, height(x, z), z]);
map.spawns.robber = [[-30, 0], [30, 0], [-20, 29], [20, 29]].map(([x, z]) => [x, height(x, z), z]);
for (const side of [-1, 1]) {
  map.colliders.push({ id: 'boundary_x_' + side, center: [side * 39.7, 2.5, 0], size: [.6, 8, 80] });
  map.colliders.push({ id: 'boundary_z_' + side, center: [0, 2.5, side * 39.7], size: [78.8, 8, .6] });
}
const used = new Set(map.objects.map(o => o.asset));
used.add('terrain_80m'); used.add('door_wood'); used.add('prison');
for (const asset of Object.keys(manifest)) if (!used.has(asset)) throw new Error('Unused asset ' + asset);
await writeFile(new URL('../../packages/shared/maps/vietnam-village.json', import.meta.url), JSON.stringify(map) + '\n');
const output = new URL('../public/assets/village/', import.meta.url);
await mkdir(output, { recursive: true });
await cp(new URL('assets/', root), output, { recursive: true });
await writeFile(new URL('manifest.json', output), JSON.stringify(manifest));
console.log('Imported', Object.keys(manifest).length, 'GLBs;', map.objects.length, 'placements;', map.colliders.length, 'colliders.');
console.log('Source:', fileURLToPath(root));
