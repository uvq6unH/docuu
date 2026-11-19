import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateMap } from '../src/map.ts';

const file = JSON.parse(readFileSync(new URL('../maps/village-v1.json', import.meta.url), 'utf8'));
const spec = readFileSync(new URL('../../../MAP_AND_ASSETS.md', import.meta.url), 'utf8');
const pairs = prefix => {
  const row = spec.split(/\r?\n/).find(line => line.startsWith(prefix));
  assert.ok(row, prefix);
  return Array.from(row.matchAll(/\((-?\d+),(-?\d+)\)/g), m => [Number(m[1]),0,Number(m[2])]);
};

test('shipped map passes validation and preserves its wire representation', () => {
  assert.deepEqual(validateMap(file), file);
  assert.deepEqual(file.size, [80,80]);
  assert.equal(file.id, 'village-v1');
  assert.equal(file.objects.length,39);
  assert.equal(file.colliders.length,29);
  assert.equal(file.hideZones.length,10);
});

test('object positions, static boxes and hide volumes match the design tables', () => {
  const houses = [...spec.matchAll(/^\| (H\d+) \| (-?\d+),(-?\d+) \| (\d+)×(\d+) \|/gm)];
  assert.equal(houses.length,10);
  for (const [,id,x,z,w,d] of houses) {
    const obj = file.objects.find(o => o.id === id);
    assert.match(obj.asset,/^house_[abc]$/);
    assert.deepEqual(obj.pos,[+x,0,+z]);
    assert.deepEqual(file.colliders.find(b => b.id === id+'_box'),
      {id:id+'_box',center:[+x,2.5,+z],size:[+w,5,+d]});
  }
  for (const [prefix,asset,count,size,solid] of [
    ['15 cây',/^tree_[ab]$/,15,[.7,2.5,.7],true],
    ['| Fence',/^fence_segment$/,4,[4,.65,.15],true],
    ['| Rơm',/^haystack$/,4,[2.4,1.5,2.4],false],
    ['| Bụi',/^bush$/,6,[2,1.1,2],false],
  ]) {
    const objects = file.objects.filter(o => asset.test(o.asset));
    assert.equal(objects.length,count);
    assert.deepEqual(objects.map(o => o.pos),pairs(prefix));
    for (const {id,pos:[x,,z]} of objects) {
      const volume = (solid ? file.colliders : file.hideZones).find(b => b.id === id+(solid?'_box':'_hide'));
      assert.deepEqual(volume.center,[x,size[1]/2,z]);
      assert.deepEqual(volume.size,size);
    }
  }
});

test('six spawns and all jail slots and anchors use world coordinates', () => {
  assert.deepEqual(file.spawns.police,pairs('| Police spawns'));
  assert.deepEqual(file.spawns.robber,pairs('| Robber spawns'));
  const centers = [[0,0],[-12,10],[12,-12]];
  file.jails.forEach((j,i) => {
    const [x,z] = centers[i];
    assert.equal(j.id,'J'+(i+1));
    assert.deepEqual(j.center,[x,0,z]);
    assert.deepEqual(j.size,[4,4]);
    assert.equal(j.guardRadius,5);
    assert.deepEqual(j.slots,[-.8,.8].flatMap(dz => [-.8,.8].map(dx => [x+dx,0,z+dz])));
    assert.deepEqual(j.rescueAnchors,[-2.5,2.5].map(dx => [x+dx,0,z]));
    assert.deepEqual(j.releaseAnchors,[-3.5,3.5].map(dx => [x+dx,0,z]));
  });
});

for (const [label,mutate,reason] of [
  ['duplicate across collections',m => m.hideZones[0].id=m.objects[0].id,/duplicate ID/],
  ['outside object',m => m.objects[0].pos[2]=40.01,/bounds/],
  ['outside collider edge',m => m.colliders[0].center[0]=39,/bounds/],
  ['outside hide zone edge',m => m.hideZones[0].center[2]=-40,/bounds/],
  ['outside jail anchor',m => m.jails[0].releaseAnchors[0][2]=41,/bounds/],
  ['spawn inside a house',m => m.spawns.police[0]=[-27,0,-26],/spawns.police.*H01_box/],
  ['spawn footprint clips a house',m => m.spawns.robber[0]=[-22.3,0,-26],/H01_box/],
  ['blocked rescue anchor',m => m.jails[0].rescueAnchors[0]=[-27,0,-26],/rescueAnchors.*H01_box/],
  ['same-side rescue anchors',m => m.jails[0].rescueAnchors[0]=[3,0,0],/opposite/],
  ['invalid team count',m => m.spawns.robber.pop(),/expected 4/],
  ['missing jail',m => m.jails.pop(),/expected 3/],
  ['wrong map dimensions',m => m.size=[80,81],/80 x 80/],
  ['non-finite yaw',m => m.objects[0].yaw=NaN,/finite/],
  ['invalid box dimensions',m => m.colliders[0].size[1]=0,/positive/],
  ['malformed vector',m => m.objects[0].pos=[1,2],/expected 3/],
]) test('rejects '+label, () => {
  const map=structuredClone(file);
  mutate(map);
  assert.throws(() => validateMap(map),reason);
});

test('allows a collider exactly on the edge, and an unobstructed spawn near a wall', () => {
  const map = structuredClone(file);
  map.colliders[0].center[0]=-35.5;
  map.spawns.police[0]=[-30.64,0,-26];
  assert.doesNotThrow(() => validateMap(map));
});
