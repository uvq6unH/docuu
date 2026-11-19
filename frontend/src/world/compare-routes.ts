import type { SurveyLayout } from './survey-layout';
import { Box3, Vector3 } from 'three';
import { surveyRoutes, type Point } from './survey-route';

type Bounds = { min: Point; max: Point };
export type ComparisonInput = {
  spawns: Point[];
  jails: { id: string; x: number; z: number; footprint: Bounds }[];
  baseline?: SurveyLayout;
  original: Bounds[];
  imported: Bounds[];
  layout?: SurveyLayout;
};
export type Result = { jail: string; option: string; path: Point[]; before: number | null; after: number | null };

function length(path: Point[]) {
  if (!path.length) return null;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const [x,z] = path[i]!;
    const [px,pz] = path[i-1]!;
    total += Math.hypot(x-px,z-pz);
  }
  return total;
}

function box({min, max}: Bounds) {
  return new Box3(new Vector3(min[0], 0, min[1]), new Vector3(max[0], 1, max[1]));
}

export function compareRoutes(input: ComparisonInput) {
  const rows: Result[] = [];
  const original = input.original.map(box);
  const imported = input.imported.map(box);
  for (const jail of input.jails) {
    const footprint = box(jail.footprint);
    const beforeBoxes = [...original, footprint];
    const base = input.baseline?.jails.find(item => item.id === jail.id);
    const moved = input.layout?.jails.find(item => item.id === jail.id) ?? base;
    const actualFootprint = moved ? box({
      min:[moved.x-moved.width/2,moved.z-moved.depth/2],
      max:[moved.x+moved.width/2,moved.z+moved.depth/2],
    }) : footprint;
    const afterBoxes = [...imported, actualFootprint];
    const bySide = [-1, 1].map(side => ({
      side,
      before: surveyRoutes(input.spawns, jail, side, beforeBoxes, base?.anchors[side < 0 ? 0 : 1], base?.guardRadius),
      after: surveyRoutes(input.layout?.spawns ?? input.spawns, moved ?? jail, side, afterBoxes,
        moved?.anchors[side < 0 ? 0 : 1], moved?.guardRadius),
    }));
    for (const index of input.spawns.keys()) {
      for (const { side, before, after } of bySide) {
        const path = after[index]!;
        rows.push({ jail: jail.id, option: index + '/' + side, before: length(before[index]!), after: length(path), path });
      }
    }
  }
  return rows;
}



