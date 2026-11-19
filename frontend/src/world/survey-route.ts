import type { Box3 } from 'three';

export type Point = readonly [number, number];
const step = 0.5;
const radius = 0.35;

// Conservative planar clearance: the full swept rectangle of each step
// must fit. Fences count as solid, so a passing route needs no jump.
export function clear(x: number, z: number, nx: number, nz: number, obstacles: Box3[]) {
  const minX = Math.min(x, nx) - radius, maxX = Math.max(x, nx) + radius;
  const minZ = Math.min(z, nz) - radius, maxZ = Math.max(z, nz) + radius;
  if (minX <= -40 || maxX >= 40 || minZ <= -40 || maxZ >= 40) return false;
  return obstacles.every(b => maxX < b.min.x || minX > b.max.x || maxZ < b.min.z || minZ > b.max.z);
}

// Inspection only: reconstruct a ground route from the spawn to the chosen face.
export function surveyRoute(start: Point, jail: {x: number; z: number}, side: number, obstacles: Box3[], target?: Point, guard = 5): Point[] {

  return surveyRoutes([start], jail, side, obstacles, target, guard)[0]!;
}

// All spawns approach the same gate, so they share one breadth-first search.
export function surveyRoutes(starts: Point[], jail: {x: number; z: number}, side: number, obstacles: Box3[], target?: Point, guard = 5): Point[][] {
  const anchor: Point = target ?? [jail.x + side * 2.5, jail.z];
  const gate: Point = [jail.x + side * Math.max(guard + 1, Math.abs(anchor[0] - jail.x)), anchor[1]];
  const paths = starts.map((): Point[] => []);
  if (!clear(...gate, ...anchor, obstacles)) return paths;
  const pending = starts.map((start, index) => {
    const onGrid = start.every((value, axis) => {
      const ticks = (value - gate[axis]!) / step;
      return Math.abs(ticks - Math.round(ticks)) < 1e-9;
    });
    return { start, index, tolerance: onGrid ? 1e-9 : step };
  });

  // Integer cells are offsets from the gate, including for fractional JSON coordinates.
  const west = Math.ceil((-40 - gate[0]) / step);
  const east = Math.floor((40 - gate[0]) / step);
  const north = Math.ceil((-40 - gate[1]) / step);
  const south = Math.floor((40 - gate[1]) / step);
  const width = east - west + 1;
  const count = width * (south - north + 1);
  const root = -north * width - west;
  const parent = new Int32Array(count).fill(-1);
  const queue = new Int32Array(count);
  parent[root] = root;
  queue[0] = root;
  let tail = 1;
  const coords = (id: number): Point => [
    gate[0] + ((id % width) + west) * step,
    gate[1] + (Math.floor(id / width) + north) * step,
  ];
  const directions = [[1,0],[-1,0],[0,1],[0,-1]] as const;
  for (let head = 0; head < tail && pending.length; head++) {
    const cell = queue[head]!;
    const [x,z] = coords(cell);
    for (let i = pending.length - 1; i >= 0; i--) {
      const { start, index, tolerance } = pending[i]!;
      const dx = x - start[0], dz = z - start[1];
      if (Math.abs(dx) > tolerance || Math.abs(dz) > tolerance) continue;
      const distance = Math.hypot(dx,dz);
      if (distance > tolerance || Math.hypot(x-jail.x,z-jail.z) - distance <= guard + radius || !clear(x,z,...start,obstacles)) continue;
      const path = paths[index]!;
      if (distance > 0) path.push(start);
      let cursor = cell;
      while (cursor !== root) {
        path.push(coords(cursor));
        cursor = parent[cursor]!;
      }
      path.push(gate, anchor);
      pending.splice(i,1);
    }
    for (const [dx,dz] of directions) {
      const next = cell + dx + dz * width;
      if (next < 0 || next >= count || parent[next] !== -1) continue;
      const nx = x + dx * step, nz = z + dz * step;
      const nearestX = Math.max(Math.min(x,nx), Math.min(jail.x,Math.max(x,nx)));
      const nearestZ = Math.max(Math.min(z,nz), Math.min(jail.z,Math.max(z,nz)));
      if ((nearestX-jail.x)**2 + (nearestZ-jail.z)**2 <= (guard+radius)**2 || !clear(x,z,nx,nz,obstacles)) continue;
      parent[next] = cell;
      queue[tail++] = next;
    }
  }
  return paths;
}
