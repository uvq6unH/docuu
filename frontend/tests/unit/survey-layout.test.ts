import { expect, it } from 'vitest';
import { surveyLayout } from '../../src/world/survey-layout';
import { compareRoutes } from '../../src/world/compare-routes';

const map = {
  size:[80,80], spawns:{robber:Array.from({length:4},() => [-10.2,0,1.1])},
  jails:['J1','J2','J3'].map(id => ({
    id, center:[1.1,0,1.1], size:[4,4], guardRadius:4,
    rescueAnchors:[[3.6,0,1.1],[-1.4,0,1.1]],
  })),
};

it('routes from the fractional JSON spawn to the correct world-space anchor', () => {
  const layout = surveyLayout(map);
  if (!layout) throw new Error('Expected supported layout');
  const rows = compareRoutes({
    layout, spawns:[[-12,0]], jails:[{id:'J1',x:0,z:0,footprint:{min:[-2,-2],max:[2,2]}}],
    original:[], imported:[],
  });
  expect(rows[0]?.path[0]).toEqual([-10.2,1.1]);
  expect(rows[0]?.path.at(-1)).toEqual([-1.4,1.1]);
  expect(rows[0]?.after).toBeCloseTo(8.8);
  expect(rows[1]?.path.at(-1)).toEqual([3.6,1.1]);
});
it('keeps partial, duplicate and elevated layouts in collider-only mode', () => {
  expect(surveyLayout({colliders:[]})).toBeUndefined();
  expect(surveyLayout({...map,jails:Array(3).fill(map.jails[0])})).toBeUndefined();
  expect(surveyLayout({...map,spawns:{robber:Array(4).fill([0,2,0])}})).toBeUndefined();
});

it('preserves spawn order when some starts coincide and another is blocked', () => {
  const rows = compareRoutes({
    spawns:[[-12,0],[12,0],[-12,0]], jails:[{id:'J1',x:0,z:0,footprint:{min:[-2,-2],max:[2,2]}}],
    original:[], imported:[{min:[11,-1],max:[13,1]}],
  });
  expect(rows.map(row => row.option)).toEqual(['0/-1','0/1','1/-1','1/1','2/-1','2/1']);
  expect(rows[0]?.path[0]).toEqual([-12,0]);
  expect(rows[2]?.after).toBeNull();
  expect(rows[3]?.after).toBeNull();
  expect(rows[4]?.path).toEqual(rows[0]?.path);
  expect(rows[5]?.path).toEqual(rows[1]?.path);
});
