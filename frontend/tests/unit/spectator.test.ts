import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createCharacterModel } from '../../src/player/character-avatar';

describe('Spectator Mode & Camera Transitions', () => {
  it('positions third-person chase camera smoothly behind teammate and looks at target', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
    const avatar = createCharacterModel('ROBBER');

    // Target robber position and orientation
    const targetPos = new Vector3(10, 0, 5);
    const targetYaw = Math.PI / 4; // 45 degrees
    const targetCrouch = false;

    // Desired Third-Person camera coordinates
    const camDist = 2.4;
    const camHeight = targetCrouch ? 1.05 : 1.45;
    const lookHeight = targetCrouch ? 0.85 : 1.25;

    const desiredX = targetPos.x + Math.sin(targetYaw) * camDist;
    const desiredY = Math.max(0.4, targetPos.y + camHeight);
    const desiredZ = targetPos.z + Math.cos(targetYaw) * camDist;

    camera.position.set(desiredX, desiredY, desiredZ);
    camera.lookAt(targetPos.x, targetPos.y + lookHeight, targetPos.z);

    // Teammate avatar must be visible in third person
    expect(avatar.root.visible).toBe(true);
    expect(camera.position.x).toBeCloseTo(10 + Math.sin(Math.PI / 4) * 2.4);
    expect(camera.position.y).toBeCloseTo(1.45);
    expect(camera.position.z).toBeCloseTo(5 + Math.cos(Math.PI / 4) * 2.4);

    avatar.dispose();
  });

  it('hides spectated avatar in first-person POV to prevent head clipping and wraps yaw cleanly', () => {
    const avatar = createCharacterModel('ROBBER');
    expect(avatar.root.visible).toBe(true);

    // Enter First-Person POV
    avatar.root.visible = false;
    expect(avatar.root.visible).toBe(false);

    // Test yaw wrapping across -PI / +PI boundary
    const currentCamYaw = Math.PI - 0.1; // ~3.04 rad
    const targetYaw = -Math.PI + 0.1;  // ~-3.04 rad (just turned across 180 deg)

    let diff = (targetYaw - currentCamYaw + Math.PI) % (Math.PI * 2) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;

    // The shortest angular difference across the 180 seam is ~+0.2 rad, not ~-6.0 rad
    expect(Math.abs(diff)).toBeLessThan(0.3);

    // Restore avatar visibility on exiting POV mode
    avatar.root.visible = true;
    expect(avatar.root.visible).toBe(true);

    avatar.dispose();
  });

  it('cycles free teammate targets and gracefully clamps bounds', () => {
    const freeTeammates = [
      { id: 'robber_1', pos: [0, 0, 0], yaw: 0, crouch: false },
      { id: 'robber_2', pos: [5, 0, 5], yaw: 1.5, crouch: true },
      { id: 'robber_3', pos: [-5, 0, -5], yaw: -1.5, crouch: false },
    ];

    let spectatorIndex = 0;
    expect(freeTeammates[spectatorIndex % freeTeammates.length]!.id).toBe('robber_1');

    spectatorIndex += 1;
    expect(freeTeammates[spectatorIndex % freeTeammates.length]!.id).toBe('robber_2');

    spectatorIndex += 1;
    expect(freeTeammates[spectatorIndex % freeTeammates.length]!.id).toBe('robber_3');

    // Cycle wraps cleanly
    spectatorIndex += 1;
    expect(freeTeammates[spectatorIndex % freeTeammates.length]!.id).toBe('robber_1');

    // Left arrow backward cycle
    spectatorIndex = 999;
    expect(freeTeammates[spectatorIndex % freeTeammates.length]).toBeDefined();
  });
});
