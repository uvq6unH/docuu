export type Position = readonly [number, number, number];
export type Reference = {
  police: readonly (readonly [number, number])[];
  robber: readonly (readonly [number, number])[];
  jails: ReadonlyMap<string, { x: number; z: number; anchors?: readonly (readonly [number, number])[]; releases?: readonly (readonly [number, number])[] }>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function position(value: unknown): value is Position {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

export function reviewPositions(map: Record<string, unknown>, reference: Reference) {
  const notes: string[] = [];
  let matched = 0;
  function compare(label: string, actual: unknown, expected: Position) {
    if (!position(actual)) notes.push(label + ' · thiếu hoặc sai tọa độ');
    else if (expected.every((n, i) => n === actual[i])) matched++;
    else notes.push(label + ' · (' + expected.join(', ') + ') → (' + actual.join(', ') + ')');
  }
  function compareList(label: string, actual: unknown, expected: Position[]) {
    if (!Array.isArray(actual)) {
      notes.push(label + ' · thiếu danh sách tọa độ');
      return;
    }
    expected.forEach((point, i) => compare(label + ' ' + (i + 1), actual[i], point));
    if (actual.length > expected.length) notes.push(label + ' · thêm ' + (actual.length - expected.length) + ' điểm');
  }
  for (const role of ['police', 'robber'] as const) {
    compareList(role === 'police' ? 'Xuất phát cảnh sát' : 'Xuất phát cướp',
      record(map.spawns) ? map.spawns[role] : undefined, reference[role].map(([x,z]) => [x,0,z]));
  }
  if (!Array.isArray(map.jails)) notes.push('Thiếu danh sách nhà giam');
  else {
    const seen = new Set<string>();
    for (const jail of map.jails) {
      if (!record(jail) || typeof jail.id !== 'string') {
        notes.push('Nhà giam thiếu ID');
        continue;
      }
      const id = jail.id;
      if (seen.has(id)) { notes.push(id + ' · ID trùng'); continue; }
      seen.add(id);
      const center = reference.jails.get(id);
      if (!center) { notes.push(id + ' · nhà giam mới'); continue; }
      const { x, z } = center;
      compare(id + ' tâm', jail.center, [x,0,z]);
      // Anchors identify world locations. Sort west-to-east so file order is irrelevant.
      for (const [key, name, offset] of [['rescueAnchors','cứu',2.5], ['releaseAnchors','thả',3.5]] as const) {
        const points = jail[key];
        const sorted = Array.isArray(points) && points.every(position)
          ? [...points].sort((a,b) => a[0] - b[0]) : points;
        const baseline = key === 'rescueAnchors' ? center.anchors : center.releases;
        const expected: Position[] = baseline
          ? [...baseline].sort((a,b) => a[0]-b[0]).map(([px,pz]) => [px,0,pz])
          : [[x-offset,0,z],[x+offset,0,z]];
        compareList(id + ' điểm ' + name, sorted, expected);
      }
    }
    for (const id of reference.jails.keys()) if (!seen.has(id)) notes.push('Thiếu nhà giam ' + id);
  }
  return { matched, notes };
}

