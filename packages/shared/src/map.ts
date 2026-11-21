import { movementRules } from './rules.ts';
/** Metres, Three.js axes: X east, Y up, Z south. */
export type Vec3 = [number, number, number];
export type SizeXZ = [number, number];

export interface MapObject {
  id: string;
  asset: string;
  pos: Vec3;
  yaw: number;
  scale: Vec3;
  /** Outer dimensions of an enterable house, in metres. Absent on legacy maps. */
  footprint?: SizeXZ;
}
export interface MapBox {
  id: string;
  center: Vec3;
  size: Vec3;
}
export interface JailCandidate {
  id: string;
  center: Vec3;
  size: SizeXZ;
  guardRadius: number;
  /** All three lists contain world positions, including for J2 and J3. */
  slots: Vec3[];
  rescueAnchors: Vec3[];
  releaseAnchors: Vec3[];
}
export interface VillageMap {
  id: string;
  size: SizeXZ;
  objects: MapObject[];
  colliders: MapBox[];
  hideZones: MapBox[];
  jails: JailCandidate[];
  spawns: { police: Vec3[]; robber: Vec3[] };
}

function requireMap(ok: unknown, path: string, reason: string): asserts ok {
  if (!ok) throw new TypeError(path + ': ' + reason);
}
function record(raw: unknown, path: string): Record<string, unknown> {
  requireMap(raw !== null && typeof raw === 'object' && !Array.isArray(raw), path, 'expected an object');
  return raw as Record<string, unknown>;
}
function list(raw: unknown, path: string, count?: number): unknown[] {
  requireMap(Array.isArray(raw), path, 'expected an array');
  if (count !== undefined) requireMap(raw.length === count, path, 'expected ' + count + ' entries');
  return Array.from(raw);
}
function name(raw: unknown, path: string): string {
  requireMap(typeof raw === 'string' && raw.trim().length > 0, path, 'expected a non-empty string');
  return raw;
}
function finite(raw: unknown, path: string): number {
  requireMap(typeof raw === 'number' && Number.isFinite(raw), path, 'expected a finite number');
  return raw;
}
function vec(raw: unknown, path: string): Vec3 {
  const [x,y,z] = list(raw,path,3);
  return [finite(x,path), finite(y,path), finite(z,path)];
}
function dimensions(raw: unknown, path: string): SizeXZ {
  const [w,d] = list(raw,path,2);
  const size: SizeXZ = [finite(w,path), finite(d,path)];
  requireMap(size.every(n => n > 0), path, 'expected positive dimensions');
  return size;
}

/** Parse untrusted JSON data. Throws TypeError with the offending field on failure. */
export function validateMap(raw: unknown): VillageMap {
  const data = record(raw,'map');
  const id = name(data.id,'map.id');
  const size = dimensions(data.size,'map.size');
  requireMap(size[0] === 80 && size[1] === 80,'map.size','expected an 80 x 80 MVP map');
  const ids = new Set<string>();
  function entityId(rawId: unknown, path: string) {
    const value = name(rawId,path + '.id');
    requireMap(!ids.has(value),path,'duplicate ID ' + value);
    ids.add(value);
    return value;
  }
  function bounds([x,,z]: Vec3, path: string, width = 0, depth = 0) {
    requireMap(Math.abs(x) + width/2 <= size[0]/2 && Math.abs(z) + depth/2 <= size[1]/2,
      path,'outside map bounds');
  }
  function position(value: unknown, path: string) {
    const point = vec(value,path);
    bounds(point,path);
    return point;
  }
  const objects = list(data.objects,'objects').map((value,i): MapObject => {
    const path = 'objects[' + i + ']';
    const obj = record(value,path);
    const scale = vec(obj.scale,path + '.scale');
    requireMap(scale.every(n => n > 0),path,'expected positive scale');
    const object: MapObject = { id:entityId(obj.id,path), asset:name(obj.asset,path + '.asset'),
      pos:position(obj.pos,path + '.pos'), yaw:finite(obj.yaw,path + '.yaw'), scale };
    if (obj.footprint !== undefined) {
      object.footprint = dimensions(obj.footprint, path + '.footprint');
      bounds(object.pos, path + '.footprint', ...object.footprint);
    }
    return object;
  });
  function boxes(field: 'colliders' | 'hideZones'): MapBox[] {
    return list(data[field],field).map((value,i) => {
      const path = field + '[' + i + ']';
      const box = record(value,path);
      const center = vec(box.center,path + '.center');
      const extent = vec(box.size,path + '.size');
      requireMap(extent.every(n => n > 0),path,'expected positive box dimensions');
      bounds(center,path,extent[0],extent[2]);
      return {id:entityId(box.id,path),center,size:extent};
    });
  }
  const colliders = boxes('colliders');
  const hideZones = boxes('hideZones');

  function standingPoints(value: unknown, path: string, count: number): Vec3[] {
    return list(value,path,count).map((entry,i) => {
      const field = path + '[' + i + ']';
      const point = position(entry,field);
      requireMap(point[1] === 0,field,'expected a ground position');
      // Clearance at spawn/teleport points, using the standing footprint in GAMEPLAY.md.
      const { radius, standingHeight: height } = movementRules;
      bounds(point,field,2*radius,2*radius);
      for (const box of colliders) {
        if (box.center[1]-box.size[1]/2 > height || box.center[1]+box.size[1]/2 < 0) continue;
        const dx = Math.max(0,Math.abs(point[0]-box.center[0])-box.size[0]/2);
        const dz = Math.max(0,Math.abs(point[2]-box.center[2])-box.size[2]/2);
        requireMap(Math.hypot(dx,dz) > radius,field,'overlaps collider ' + box.id);
      }
      return point;
    });
  }
  const jails = list(data.jails,'jails',3).map((value,i): JailCandidate => {
    const path = 'jails[' + i + ']';
    const jail = record(value,path);
    const jailId = entityId(jail.id,path);
    requireMap(['J1','J2','J3'].includes(jailId),path,'unknown jail ID');
    const center = position(jail.center,path + '.center');
    const footprint = dimensions(jail.size,path + '.size');
    bounds(center,path,...footprint);
    const guardRadius = finite(jail.guardRadius,path + '.guardRadius');
    requireMap(guardRadius > 0,path,'expected positive guard radius');
    bounds(center,path + '.guardRadius',2*guardRadius,2*guardRadius);
    const slots = standingPoints(jail.slots,path + '.slots',4);
    requireMap(new Set(slots.map(p => p.join(','))).size === 4,path,'duplicate jail slot');
    for (const [x,,z] of slots) {
      requireMap(Math.abs(x-center[0]) < footprint[0]/2 && Math.abs(z-center[2]) < footprint[1]/2,
        path + '.slots','slot outside jail');
    }
    const rescueAnchors = standingPoints(jail.rescueAnchors,path + '.rescueAnchors',2);
    const releaseAnchors = standingPoints(jail.releaseAnchors,path + '.releaseAnchors',2);
    for (const anchors of [rescueAnchors,releaseAnchors]) {
      requireMap(anchors.some(([x]) => x < center[0]-footprint[0]/2) &&
        anchors.some(([x]) => x > center[0]+footprint[0]/2),path,'expected anchors outside opposite X faces');
    }
    return {id:jailId,center,size:footprint,guardRadius,slots,rescueAnchors,releaseAnchors};
  });
  const spawnData = record(data.spawns,'spawns');
  const spawns = {
    police:standingPoints(spawnData.police,'spawns.police',2),
    robber:standingPoints(spawnData.robber,'spawns.robber',4),
  };
  return {id,size,objects,colliders,hideZones,jails,spawns};
}

