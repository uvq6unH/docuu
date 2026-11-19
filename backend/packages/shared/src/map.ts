import { createHash } from 'node:crypto';
import type { Vec3, Vec2 } from './protocol.js';

export interface MapObjectDef {
  id: string;
  asset: string;
  pos: Vec3;
  yaw: number;
  scale: Vec3;
}

export type ColliderType = 'wall' | 'fence' | 'tree' | 'jail_shell';

export interface ColliderDef {
  id: string;
  center: Vec3;
  size: Vec3;
  type?: ColliderType;
}

export type HideZoneType = 'haystack' | 'bush';

export interface HideZoneDef {
  id: string;
  center: Vec3;
  size: Vec3;
  type: HideZoneType;
}

export interface JailCandidateDef {
  id: string;
  center: Vec3;
  size: [width: number, depth: number];
  guardRadius: number;
  slots: Vec3[];
  rescueAnchors: Vec3[];
  releaseAnchors: Vec3[];
}

export interface SpawnsDef {
  police: Vec3[];
  robber: Vec3[];
}

export interface MapData {
  id: string;
  size: [width: number, depth: number];
  bounds: [minX: number, maxX: number, minZ: number, maxZ: number];
  objects: MapObjectDef[];
  colliders: ColliderDef[];
  hideZones: HideZoneDef[];
  jails: JailCandidateDef[];
  spawns: SpawnsDef;
}

export interface MapValidationResult {
  valid: boolean;
  errors: string[];
}

function isFiniteVec3(v: unknown): v is Vec3 {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === 'number' &&
    Number.isFinite(v[0]) &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[1]) &&
    typeof v[2] === 'number' &&
    Number.isFinite(v[2])
  );
}

function isWithinBounds(x: number, z: number, bounds: [number, number, number, number]): boolean {
  return x >= bounds[0] && x <= bounds[1] && z >= bounds[2] && z <= bounds[3];
}

function pointIntersectsAABB(point: Vec3, center: Vec3, size: Vec3, heightBuffer = 1.7): boolean {
  const minX = center[0] - size[0] / 2;
  const maxX = center[0] + size[0] / 2;
  const minY = center[1] - size[1] / 2;
  const maxY = center[1] + size[1] / 2;
  const minZ = center[2] - size[2] / 2;
  const maxZ = center[2] + size[2] / 2;

  const pMinY = point[1];
  const pMaxY = point[1] + heightBuffer;

  const xOverlap = point[0] >= minX && point[0] <= maxX;
  const zOverlap = point[2] >= minZ && point[2] <= maxZ;
  const yOverlap = pMaxY >= minY && pMinY <= maxY;

  return xOverlap && zOverlap && yOverlap;
}

/**
 * Validates map metadata according to MAP_AND_ASSETS.md and project specifications.
 */
export function validateMapData(map: MapData): MapValidationResult {
  const errors: string[] = [];

  if (!map || typeof map !== 'object') {
    return { valid: false, errors: ['Map data is not an object'] };
  }

  // 1. Basic properties
  if (!map.id || typeof map.id !== 'string') {
    errors.push('Map id must be a non-empty string');
  }

  if (
    !Array.isArray(map.size) ||
    map.size.length !== 2 ||
    map.size[0] !== 80 ||
    map.size[1] !== 80
  ) {
    errors.push('Map size must be [80, 80]');
  }

  if (
    !Array.isArray(map.bounds) ||
    map.bounds.length !== 4 ||
    map.bounds[0] !== -40 ||
    map.bounds[1] !== 40 ||
    map.bounds[2] !== -40 ||
    map.bounds[3] !== 40
  ) {
    errors.push('Map bounds must be [-40, 40, -40, 40]');
  }

  const bounds = map.bounds || [-40, 40, -40, 40];

  // 2. Unique ID verification
  const idSet = new Set<string>();
  const checkUniqueId = (id: string, context: string) => {
    if (!id || typeof id !== 'string') {
      errors.push(`${context} has missing or invalid id`);
      return;
    }
    if (idSet.has(id)) {
      errors.push(`Duplicate id found: "${id}" in ${context}`);
    } else {
      idSet.add(id);
    }
  };

  // 3. Objects check
  if (!Array.isArray(map.objects)) {
    errors.push('Map objects must be an array');
  } else {
    for (const obj of map.objects) {
      checkUniqueId(obj.id, 'objects');
      if (!isFiniteVec3(obj.pos)) {
        errors.push(`Object ${obj.id} pos is not finite Vec3`);
      } else if (!isWithinBounds(obj.pos[0], obj.pos[2], bounds)) {
        errors.push(`Object ${obj.id} pos is outside map bounds`);
      }
    }
  }

  // 4. Colliders check (10 houses, 15 trees, 4 fences)
  let houseCount = 0;
  let treeCount = 0;
  let fenceCount = 0;

  if (!Array.isArray(map.colliders)) {
    errors.push('Map colliders must be an array');
  } else {
    for (const col of map.colliders) {
      checkUniqueId(col.id, 'colliders');
      if (!isFiniteVec3(col.center)) {
        errors.push(`Collider ${col.id} center is not finite Vec3`);
      } else if (!isWithinBounds(col.center[0], col.center[2], bounds)) {
        errors.push(`Collider ${col.id} center is outside map bounds`);
      }
      if (!isFiniteVec3(col.size) || col.size[0] <= 0 || col.size[1] <= 0 || col.size[2] <= 0) {
        errors.push(`Collider ${col.id} size is invalid positive Vec3`);
      }

      if (col.type === 'wall') houseCount++;
      else if (col.type === 'tree') treeCount++;
      else if (col.type === 'fence') fenceCount++;
    }

    if (houseCount !== 10) {
      errors.push(`Expected exactly 10 house colliders (type='wall'), found ${houseCount}`);
    }
    if (treeCount !== 15) {
      errors.push(`Expected exactly 15 tree colliders (type='tree'), found ${treeCount}`);
    }
    if (fenceCount !== 4) {
      errors.push(`Expected exactly 4 fence colliders (type='fence'), found ${fenceCount}`);
    }
  }

  // 5. HideZones check (4 haystacks, 6 bushes)
  let haystackCount = 0;
  let bushCount = 0;

  if (!Array.isArray(map.hideZones)) {
    errors.push('Map hideZones must be an array');
  } else {
    for (const zone of map.hideZones) {
      checkUniqueId(zone.id, 'hideZones');
      if (!isFiniteVec3(zone.center)) {
        errors.push(`HideZone ${zone.id} center is not finite Vec3`);
      } else if (!isWithinBounds(zone.center[0], zone.center[2], bounds)) {
        errors.push(`HideZone ${zone.id} center is outside map bounds`);
      }
      if (!isFiniteVec3(zone.size) || zone.size[0] <= 0 || zone.size[1] <= 0 || zone.size[2] <= 0) {
        errors.push(`HideZone ${zone.id} size is invalid positive Vec3`);
      }

      if (zone.type === 'haystack') haystackCount++;
      else if (zone.type === 'bush') bushCount++;
    }

    if (haystackCount !== 4) {
      errors.push(`Expected exactly 4 haystack hide zones, found ${haystackCount}`);
    }
    if (bushCount !== 6) {
      errors.push(`Expected exactly 6 bush hide zones, found ${bushCount}`);
    }
  }

  // 6. Candidate Jails check (3 jails: J1, J2, J3)
  if (!Array.isArray(map.jails)) {
    errors.push('Map jails must be an array');
  } else {
    if (map.jails.length !== 3) {
      errors.push(`Expected exactly 3 candidate jails, found ${map.jails.length}`);
    }
    for (const jail of map.jails) {
      checkUniqueId(jail.id, 'jails');
      if (!isFiniteVec3(jail.center)) {
        errors.push(`Jail ${jail.id} center is not finite Vec3`);
      }
      if (jail.guardRadius !== 5.0) {
        errors.push(`Jail ${jail.id} guardRadius must be 5.0, found ${jail.guardRadius}`);
      }
      if (!Array.isArray(jail.slots) || jail.slots.length !== 4) {
        errors.push(`Jail ${jail.id} must have exactly 4 slots`);
      } else {
        for (const slot of jail.slots) {
          if (!isFiniteVec3(slot)) {
            errors.push(`Jail ${jail.id} slot is not finite Vec3`);
          }
        }
      }
      if (!Array.isArray(jail.rescueAnchors) || jail.rescueAnchors.length !== 2) {
        errors.push(`Jail ${jail.id} must have exactly 2 rescue anchors`);
      } else {
        for (const anchor of jail.rescueAnchors) {
          if (!isFiniteVec3(anchor)) {
            errors.push(`Jail ${jail.id} rescue anchor is not finite Vec3`);
          }
        }
      }
      if (!Array.isArray(jail.releaseAnchors) || jail.releaseAnchors.length !== 2) {
        errors.push(`Jail ${jail.id} must have exactly 2 release anchors`);
      } else {
        for (const anchor of jail.releaseAnchors) {
          if (!isFiniteVec3(anchor)) {
            errors.push(`Jail ${jail.id} release anchor is not finite Vec3`);
          }
        }
      }
    }
  }

  // 7. Spawns check (2 police, 4 robber)
  if (!map.spawns || typeof map.spawns !== 'object') {
    errors.push('Map spawns must be an object');
  } else {
    if (!Array.isArray(map.spawns.police) || map.spawns.police.length !== 2) {
      errors.push(`Expected exactly 2 police spawns, found ${map.spawns.police?.length}`);
    } else {
      for (const sp of map.spawns.police) {
        if (!isFiniteVec3(sp)) {
          errors.push('Police spawn is not finite Vec3');
        } else if (!isWithinBounds(sp[0], sp[2], bounds)) {
          errors.push('Police spawn is outside map bounds');
        }
      }
    }

    if (!Array.isArray(map.spawns.robber) || map.spawns.robber.length !== 4) {
      errors.push(`Expected exactly 4 robber spawns, found ${map.spawns.robber?.length}`);
    } else {
      for (const sp of map.spawns.robber) {
        if (!isFiniteVec3(sp)) {
          errors.push('Robber spawn is not finite Vec3');
        } else if (!isWithinBounds(sp[0], sp[2], bounds)) {
          errors.push('Robber spawn is outside map bounds');
        }
      }
    }
  }

  // 8. Safe clearance: spawns and anchors must not overlap static colliders
  if (Array.isArray(map.colliders)) {
    const checkPointAgainstColliders = (pt: Vec3, label: string) => {
      for (const col of map.colliders) {
        if (pointIntersectsAABB(pt, col.center, col.size)) {
          errors.push(`${label} at [${pt.join(', ')}] overlaps collider ${col.id}`);
        }
      }
    };

    if (map.spawns?.police) {
      for (let i = 0; i < map.spawns.police.length; i++) {
        const pt = map.spawns.police[i];
        if (pt && isFiniteVec3(pt)) checkPointAgainstColliders(pt, `Police spawn ${i}`);
      }
    }
    if (map.spawns?.robber) {
      for (let i = 0; i < map.spawns.robber.length; i++) {
        const pt = map.spawns.robber[i];
        if (pt && isFiniteVec3(pt)) checkPointAgainstColliders(pt, `Robber spawn ${i}`);
      }
    }
    if (Array.isArray(map.jails)) {
      for (const jail of map.jails) {
        for (let i = 0; i < jail.rescueAnchors.length; i++) {
          const pt = jail.rescueAnchors[i];
          if (pt && isFiniteVec3(pt)) checkPointAgainstColliders(pt, `Jail ${jail.id} rescue anchor ${i}`);
        }
        for (let i = 0; i < jail.releaseAnchors.length; i++) {
          const pt = jail.releaseAnchors[i];
          if (pt && isFiniteVec3(pt)) checkPointAgainstColliders(pt, `Jail ${jail.id} release anchor ${i}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Computes deterministic SHA-256 hash string for map content bytes.
 */
export function computeMapHash(content: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}
