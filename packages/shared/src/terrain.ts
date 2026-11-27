import type { TerrainField, VillageMap } from './map.ts';
import { movementRules } from './rules.ts';
import { VILLAGE_INTERACTION } from './rules.ts';
export { VILLAGE_INTERACTION } from './rules.ts';

/** Barycentric height on the exact two triangles used by terrain_80m.glb. */
export function terrainHeight(x: number, z: number, world: { size: [number, number]; terrain?: TerrainField }): number {
  const field = world.terrain;
  if (!field) return 0;
  const u = Math.max(0, Math.min(field.columns - 1, (x / world.size[0] + .5) * (field.columns - 1)));
  const v = Math.max(0, Math.min(field.rows - 1, (.5 - z / world.size[1]) * (field.rows - 1)));
  const column = Math.min(field.columns - 2, Math.floor(u)), row = Math.min(field.rows - 2, Math.floor(v));
  const tx = u - column, tz = v - row, i = row * field.columns + column;
  const a = field.heights[i]!, b = field.heights[i + 1]!;
  const c = field.heights[i + field.columns]!, d = field.heights[i + field.columns + 1]!;
  return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz
    : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}

export function surfaceHeight(x: number, z: number, feet: number, world: Pick<VillageMap, 'size' | 'colliders' | 'terrain'>): number {
  let height = terrainHeight(x, z, world);
  for (const box of world.colliders) {
    const top = box.center[1] + box.size[1] / 2;
    if (top > feet + VILLAGE_INTERACTION.stepHeight + .001 || top < height) continue;
    const dx = x - box.center[0], dz = z - box.center[2], yaw = box.yaw ?? 0;
    const outsideX = Math.max(0, Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) - box.size[0] / 2);
    const outsideZ = Math.max(0, Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw)) - box.size[2] / 2);
    if (outsideX ** 2 + outsideZ ** 2 <= movementRules.radius ** 2) height = top;
  }
  return height;
}
