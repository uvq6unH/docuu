import { expect, it } from 'vitest';
import { reviewPositions, type Reference } from '../../src/world/review-positions';

const reference: Reference = { police: [[0,4]], robber: [[1,2]], jails: new Map([['J2',{x:-12,z:10}]]) };
const jail = { id:'J2', center:[-12,0,10], rescueAnchors:[[-9.5,0,10],[-14.5,0,10]], releaseAnchors:[[-15.5,0,10],[-8.5,0,10]] };
const spawns = { police:[[0,0,4]], robber:[[1,0,2]] };
it('compares world coordinates independently of anchor order', () => {
  expect(reviewPositions({spawns,jails:[jail]},reference)).toEqual({matched:7,notes:[]});
});
it('distinguishes shifted points, duplicate ids and missing metadata', () => {
  const result = reviewPositions({spawns:{robber:[[1,2,2]]},jails:[jail,jail]},reference);
  expect(result.matched).toBe(5);
  expect(result.notes).toEqual(['Xuất phát cảnh sát · thiếu danh sách tọa độ','Xuất phát cướp 1 · (1, 0, 2) → (1, 2, 2)','J2 · ID trùng']);
});
