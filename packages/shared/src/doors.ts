import type { MapBox, Vec3, VillageDoor, VillageMap } from './map.ts';
import { VILLAGE_INTERACTION } from './terrain.ts';
import { movementRules } from './rules.ts';

export interface DoorState { id: string; angle: number; target: number }
export function initialDoors(map: VillageMap): DoorState[] {
  return (map.doors ?? []).map(door => ({ id: door.id, angle: 0, target: 0 }));
}
export function doorBox(door: VillageDoor, angle: number): MapBox {
  const yaw = door.yaw + angle;
  return { id: 'dynamic_' + door.id, center: [
    door.hinge[0] + Math.cos(yaw) * door.size[0] / 2,
    door.hinge[1] + door.size[1] / 2,
    door.hinge[2] - Math.sin(yaw) * door.size[0] / 2,
  ], size: door.size, yaw };
}
export function syncDoorColliders(map: VillageMap, states: DoorState[]) {
  const doorIds = new Set((map.doors ?? []).map(door => 'dynamic_' + door.id));
  map.colliders = map.colliders.filter(box => !doorIds.has(box.id));
  for (const door of map.doors ?? []) {
    const state = states.find(state => state.id === door.id);
    map.colliders.push(doorBox(door, state?.angle ?? 0));
  }
}
export function nearestDoor(pos: Vec3, map: VillageMap): VillageDoor | undefined {
  return (map.doors ?? []).map(door => {
    const box = doorBox(door, 0);
    return { door, distance: Math.hypot(pos[0] - box.center[0], pos[2] - box.center[2]) };
  }).filter(item => item.distance <= VILLAGE_INTERACTION.doorReach &&
    Math.abs(item.door.hinge[1] - pos[1]) <= 1)
    .sort((a, b) => a.distance - b.distance || a.door.id.localeCompare(b.door.id))[0]?.door;
}
function intersectsPlayer(box: MapBox, pos: Vec3, height: number) {
  if (pos[1] >= box.center[1] + box.size[1] / 2 || pos[1] + height <= box.center[1] - box.size[1] / 2) return false;
  const dx = pos[0] - box.center[0], dz = pos[2] - box.center[2], yaw = box.yaw ?? 0;
  const x = Math.max(0, Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) - box.size[0] / 2);
  const z = Math.max(0, Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw)) - box.size[2] / 2);
  return x * x + z * z < movementRules.radius ** 2;
}
export function advanceDoors(map: VillageMap, states: DoorState[], dtMs: number, players: { pos: Vec3; height: number }[]) {
  for (const state of states) {
    const door = map.doors?.find(door => door.id === state.id);
    if (!door || state.angle === state.target) continue;
    const travel = Math.sign(state.target - state.angle) * Math.min(Math.abs(state.target - state.angle),
      VILLAGE_INTERACTION.doorAngle * dtMs / VILLAGE_INTERACTION.doorDurationMs);
    const steps = Math.max(1, Math.ceil(Math.abs(travel) / VILLAGE_INTERACTION.doorSweepStep));
    for (let index = 0; index < steps; index++) {
      const next = state.angle + travel / steps;
      if (players.some(player => intersectsPlayer(doorBox(door, next), player.pos, player.height))) {
        state.target = state.angle;
        break;
      }
      state.angle = next;
    }
    if (Math.abs(state.angle - state.target) < 1e-6) state.angle = state.target;
  }
  syncDoorColliders(map, states);
}
