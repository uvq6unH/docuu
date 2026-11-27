import { expect, it, vi } from 'vitest';
import { villagePreview } from '../../src/world/village';

it('builds the documented layout with all three inspection points', () => {
  const { village, viewpoints, bounds } = villagePreview();
  expect(village.children.filter(child => /^H\d+$/.test(child.name))).toHaveLength(10);
  expect(village.children.filter(child => /^T\d+$/.test(child.name))).toHaveLength(15);
  expect([...viewpoints.keys()]).toEqual(['J1', 'J2', 'J3']);
  expect(viewpoints.get('J2')).toEqual({ x: -12, z: 10 });
  expect(bounds.visible).toBe(false);
  expect(bounds.children).toHaveLength(129);
});


it('places both approaches outside each jail and hides markers in overview', () => {
  const { survey, inspectJail } = villagePreview();
  for (const [id, x, z] of [['J1', 0, 0], ['J2', -12, 10], ['J3', 12, -12]] as const) {
    inspectJail(id);
    expect(survey.visible).toBe(true);
    expect(survey.position.toArray()).toEqual([x, 0, z]);
    for (const [name, distance] of [['rescue', 2.5], ['release', 3.5]] as const) {
      const offsets = survey.children.filter(child => child.name === name).map(child => child.position.x);
      expect(offsets).toEqual([-distance, distance]);
    }
  }
  inspectJail('overview');
  expect(survey.visible).toBe(false);
});

it('moves imported pads and survey markers together, then restores v0', () => {
  const { village, survey, placeJails, inspectJail } = villagePreview();
  const moved = {spawns:[], jails:[{id:'J1',x:8,z:3,width:6,depth:2,guardRadius:7,
    anchors:[[-1,1],[12,4]] as [number,number][], releases:[[0,2],[13,5]] as [number,number][]}]};
  placeJails(moved);
  inspectJail('J1', moved);
  const pad = village.getObjectByName('J1')!;
  expect(pad.position.toArray()).toEqual([8,.035,3]);
  expect(pad.scale.toArray()).toEqual([6,.07,2]);
  expect(survey.getObjectByName('guard')?.scale.x).toBe(1.4);
  expect(survey.getObjectByName('rescue')?.position.toArray()).toEqual([-9,.09,-2]);
  expect(survey.getObjectByName('release')?.position.toArray()).toEqual([-8,.09,-1]);
  moved.jails[0]!.releases = [];
  inspectJail('J1', moved);
  expect(survey.getObjectByName('release')?.visible).toBe(false);
  placeJails();
  inspectJail('J1');
  expect(pad.position.toArray()).toEqual([0,.035,0]);
  expect(pad.scale.toArray()).toEqual([4,.07,4]);
  expect(survey.getObjectByName('release')?.visible).toBe(true);
  expect(survey.getObjectByName('guard')?.scale.x).toBe(1);
});


it('applies shared object transforms independently of the authoritative collider', async () => {
  const { villageMap } = await import('../../src/world/shared-map');
  const map = structuredClone(villageMap);
  const house = map.objects[0]!;
  house.pos = [2,0,7];
  house.yaw = 1;
  house.scale = [2,1,1];
  const collider = map.colliders[0]!;
  const { village, bounds } = villagePreview(map);
  const visual = village.getObjectByName(house.id)!;
  expect(visual.position.toArray()).toEqual(house.pos);
  expect(visual.scale.toArray()).toEqual(house.scale);
  expect(visual.rotation.y).toBe(house.yaw);
  expect(bounds.getObjectByName(collider.id)?.position.toArray()).toEqual(collider.center);
  expect(bounds.getObjectByName(collider.id)?.scale.toArray()).toEqual(collider.size);
});

it('previews one jail offline and follows only the server choice in a session', () => {
  const { jailModel, inspectJail, setServerJail } = villagePreview();
  expect(jailModel.visible).toBe(false);
  inspectJail('J2');
  expect(jailModel.position.toArray()).toEqual([-12, 0, 10]);
  expect(jailModel.visible).toBe(true);
  setServerJail('J3');
  inspectJail('J1');
  expect(jailModel.position.toArray()).toEqual([12, 0, -12]);
  setServerJail(null);
  inspectJail('J1');
  expect(jailModel.visible).toBe(false);
});

// Retain regression coverage for the original flat-map preview.
vi.mock('../../src/world/shared-map', async () => {
  const { validateMap } = await import('../../../packages/shared/src/map');
  const { default: data } = await import('../../../packages/shared/maps/village-v1.json');
  return { villageMap: validateMap(data) };
});
