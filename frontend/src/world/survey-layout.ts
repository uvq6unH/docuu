import type { Point } from './survey-route';

export type SurveyLayout = {
  spawns: Point[];
  jails: { id: string; x: number; z: number; width: number; depth: number; guardRadius: number; anchors: Point[]; releases?: Point[] }[];
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}
function ground(value: unknown, elevated = false): Point | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite) || (!elevated && value[1] !== 0)) return;
  if (Math.abs(value[0]) > 40 || Math.abs(value[2]) > 40) return;
  return [value[0], value[2]];
}

// Only enable this inspection for complete flat MVP layouts with west/east anchors.
export function surveyLayout(map: unknown): SurveyLayout | undefined {
  if (!record(map) || !Array.isArray(map.size) || map.size.length !== 2 || !map.size.every(n => n === 80)
    || !record(map.spawns) || !Array.isArray(map.spawns.robber) || map.spawns.robber.length !== 4
    || !Array.isArray(map.jails) || map.jails.length !== 3) return;
  const point = (value: unknown) => ground(value, !!map.terrain);
  const spawns: Point[] = [];
  for (const value of map.spawns.robber) {
    const spawn = point(value);
    if (!spawn) return;
    spawns.push(spawn);
  }
  const jails: SurveyLayout['jails'] = [];
  for (const value of map.jails) {
    if (!record(value) || typeof value.id !== 'string' || !['J1','J2','J3'].includes(value.id)
      || jails.some(j => j.id === value.id) || !Array.isArray(value.size) || value.size.length !== 2
      || !value.size.every(n => Number.isFinite(n) && n > 0 && n <= 80)
      || typeof value.guardRadius !== 'number' || !Number.isFinite(value.guardRadius) || value.guardRadius <= 0
      || !Array.isArray(value.rescueAnchors) || value.rescueAnchors.length !== 2) return;
    const center = point(value.center);
    const first = point(value.rescueAnchors[0]);
    const second = point(value.rescueAnchors[1]);
    if (!center || !first || !second) return;
    const anchors = [first,second].sort((a,b) => a[0]-b[0]);
    if (anchors[0]![0] >= center[0] || anchors[1]![0] <= center[0]) return;
    const releasePoints = Array.isArray(value.releaseAnchors) ? value.releaseAnchors.map(point) : [];
    const releases = releasePoints.length === 2 && releasePoints.every((p): p is Point => !!p) ? releasePoints : [];
    jails.push({releases, id:value.id,x:center[0],z:center[1],width:value.size[0],depth:value.size[1],guardRadius:value.guardRadius,anchors});
  }
  return {spawns,jails};
}

