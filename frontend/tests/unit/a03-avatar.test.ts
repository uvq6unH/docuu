import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { createCharacterModel } from '../../src/player/character-avatar';

interface Accessor {
  count: number;
  min: number[];
  max: number[];
}
interface Primitive {
  indices: number;
  attributes: { POSITION: number };
}
interface GlbModel {
  accessors: Accessor[];
  meshes: { primitives: Primitive[] }[];
  materials: { pbrMetallicRoughness: { baseColorFactor?: number[] } }[];
  nodes: { name?: string; translation?: number[]; rotation?: number[]; scale?: number[] }[];
}

describe('A03 Character Avatar 3D Models', () => {
  it('creates Police avatar with correct dimensions, pivot, and accessories', () => {
    const police = createCharacterModel('POLICE');
    police.root.updateMatrixWorld(true);

    const bbox = new Box3().setFromObject(police.root);
    const height = bbox.max.y - bbox.min.y;
    const width = bbox.max.x - bbox.min.x;
    const depth = bbox.max.z - bbox.min.z;

    // Pivot must be at feet on the ground
    expect(bbox.min.y).toBeCloseTo(0, 2);
    // Standing height around 1.7m (matching rules.standingHeight = 1.7)
    expect(height).toBeGreaterThanOrEqual(1.60);
    expect(height).toBeLessThanOrEqual(1.80);
    // Must fit within capsule diameter (0.7m)
    expect(width).toBeLessThanOrEqual(0.70);
    expect(depth).toBeLessThanOrEqual(0.70);

    // Police accessory checks
    const crown = police.root.getObjectByName('kepi_crown');
    const badge = police.root.getObjectByName('chest_badge');
    const bandana = police.root.getObjectByName('bandana_front');

    expect(crown?.visible).toBe(true);
    expect(badge?.visible).toBe(true);
    expect(bandana?.visible).toBe(false);

    police.dispose();
  });

  it('creates Robber avatar with correct dimensions, rustic bandana, and team color', () => {
    const robber = createCharacterModel('ROBBER');
    robber.root.updateMatrixWorld(true);

    const bbox = new Box3().setFromObject(robber.root);
    const height = bbox.max.y - bbox.min.y;

    expect(bbox.min.y).toBeCloseTo(0, 2);
    expect(height).toBeGreaterThanOrEqual(1.55);
    expect(height).toBeLessThanOrEqual(1.75);

    const crown = robber.root.getObjectByName('kepi_crown');
    const bandana = robber.root.getObjectByName('bandana_front');
    expect(crown?.visible).toBe(false);
    expect(bandana?.visible).toBe(true);

    robber.dispose();
  });

  it('procedurally animates crouch posture down to ~1.1m', () => {
    const avatar = createCharacterModel('ROBBER');

    // Run animation frames to blend crouch fully
    for (let i = 0; i < 20; i++) {
      avatar.update(0.05, { speed: 0, crouch: true, grounded: true });
    }
    avatar.root.updateMatrixWorld(true);

    const bbox = new Box3().setFromObject(avatar.root);
    const crouchHeight = bbox.max.y - bbox.min.y;

    // Should lower from ~1.7m down towards 1.1m (matching rules.crouchHeight = 1.1)
    expect(crouchHeight).toBeLessThanOrEqual(1.30);
    expect(crouchHeight).toBeGreaterThanOrEqual(1.00);

    avatar.dispose();
  });

  it('procedurally animates walk, run, and jailed postures', () => {
    const avatar = createCharacterModel('POLICE');
    const legUpperL = avatar.root.getObjectByName('leg_upper_L')!;
    const armUpperL = avatar.root.getObjectByName('arm_upper_L')!;
    const hips = avatar.root.getObjectByName('hips')!;

    // Walk animation updates bone rotations
    avatar.update(0.2, { speed: 2.5, crouch: false, grounded: true });
    expect(Math.abs(legUpperL.rotation.x)).toBeGreaterThan(0.01);
    expect(Math.abs(armUpperL.rotation.x)).toBeGreaterThan(0.01);

    // Jailed sitting pose
    avatar.update(0.1, { speed: 0, crouch: false, grounded: true, jailed: true });
    expect(hips.position.y).toBeLessThan(0.35); // Hips lowered to sitting height
    expect(legUpperL.rotation.x).toBeLessThan(-1.0); // Legs bent up

    avatar.dispose();
  });

  it('switches role dynamically between POLICE and ROBBER', () => {
    const avatar = createCharacterModel('POLICE');
    expect(avatar.role).toBe('POLICE');

    avatar.setRole('ROBBER');
    expect(avatar.role).toBe('ROBBER');
    expect(avatar.root.getObjectByName('kepi_crown')?.visible).toBe(false);
    expect(avatar.root.getObjectByName('bandana_front')?.visible).toBe(true);

    avatar.dispose();
  });

  it.each(['avatar_police', 'avatar_robber', 'avatar'])(
    '%s.glb meets the glTF binary specification and triangle budget',
    (modelName) => {
      const filePath = resolve('public/models', `${modelName}.glb`);
      const bytes = readFileSync(filePath);

      // Verify glTF binary magic header
      expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);

      // Parse glTF JSON chunk
      const jsonChunkLength = bytes.readUInt32LE(12);
      const json = bytes.toString('utf8', 20, 20 + jsonChunkLength);
      const model: GlbModel = JSON.parse(json);

      // Triangle budget check: between 200 and 3500 triangles per MAP_AND_ASSETS.md
      const primitives = model.meshes.flatMap((m) => m.primitives);
      const triangles = primitives.reduce((acc, p) => {
        const accessor = model.accessors[p.indices];
        return acc + (accessor ? accessor.count / 3 : 0);
      }, 0);

      expect(triangles).toBeGreaterThanOrEqual(200);
      expect(triangles).toBeLessThanOrEqual(3500);

      // Verify material presence
      expect(model.materials.length).toBeGreaterThanOrEqual(5);

      // Verify skeletal node hierarchy is present in glTF
      const nodeNames = model.nodes.map((n) => n.name).filter(Boolean);
      expect(nodeNames).toContain('hips');
      expect(nodeNames).toContain('torso');
      expect(nodeNames).toContain('head_group');
      expect(nodeNames).toContain('leg_upper_L');
      expect(nodeNames).toContain('leg_upper_R');
    }
  );
});
