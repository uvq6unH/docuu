import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { ViewModelHands } from '../../src/player/viewmodel';

describe('ViewModelHands & First-Person Motion', () => {
  it('initializes viewmodel hierarchy and materials matching role', () => {
    const viewmodel = new ViewModelHands('POLICE');
    expect(viewmodel.root.name).toBe('viewmodel_root');
    expect(viewmodel.role).toBe('POLICE');

    const camera = new PerspectiveCamera(75, 1, 0.1, 100);
    viewmodel.attachToCamera(camera);
    expect(camera.children).toContain(viewmodel.root);

    // Verify arms exist
    const armL = viewmodel.root.getObjectByName('viewmodel_arm_L');
    const armR = viewmodel.root.getObjectByName('viewmodel_arm_R');
    expect(armL).toBeDefined();
    expect(armR).toBeDefined();

    // Toggle role and shirt color
    viewmodel.setRole('ROBBER');
    expect(viewmodel.role).toBe('ROBBER');

    viewmodel.setShirtColor('#55aa33');
    viewmodel.setVisible(false);
    expect(viewmodel.root.visible).toBe(false);

    viewmodel.dispose();
  });

  it('drives locomotion arm swing and head bobbing across movement states', () => {
    const viewmodel = new ViewModelHands('ROBBER');

    // Idle update
    const idleOut = viewmodel.update({
      dtSeconds: 0.016,
      speed: 0,
      sprint: false,
      crouch: false,
      grounded: true,
      verticalSpeed: 0,
      deltaYaw: 0,
      deltaPitch: 0,
      strafeInput: 0,
    });
    expect(idleOut.bobX).toBe(0);
    expect(idleOut.bobY).toBe(0);

    // Walking update
    const walkOut = viewmodel.update({
      dtSeconds: 0.016,
      speed: 3.5,
      sprint: false,
      crouch: false,
      grounded: true,
      verticalSpeed: 0,
      deltaYaw: 0.05,
      deltaPitch: 0.02,
      strafeInput: -1, // Strafe left
    });
    expect(walkOut.bobY).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(walkOut.roll)).toBe(true);

    // Sprinting update
    const sprintOut = viewmodel.update({
      dtSeconds: 0.016,
      speed: 6.0,
      sprint: true,
      crouch: false,
      grounded: true,
      verticalSpeed: 0,
      deltaYaw: 0,
      deltaPitch: 0,
      strafeInput: 1, // Strafe right
    });
    expect(Number.isFinite(sprintOut.bobY)).toBe(true);
    expect(Number.isFinite(sprintOut.roll)).toBe(true);

    // Airborne and landing transition
    viewmodel.update({
      dtSeconds: 0.016,
      speed: 3.0,
      sprint: false,
      crouch: false,
      grounded: false, // In air
      verticalSpeed: -5,
      deltaYaw: 0,
      deltaPitch: 0,
      strafeInput: 0,
    });

    const landingOut = viewmodel.update({
      dtSeconds: 0.016,
      speed: 3.0,
      sprint: false,
      crouch: false,
      grounded: true, // Landed
      verticalSpeed: 0,
      deltaYaw: 0,
      deltaPitch: 0,
      strafeInput: 0,
    });
    expect(landingOut.landingDip).toBeLessThan(0); // Negative dip on impact

    viewmodel.dispose();
  });

  it('executes police capture swipe and robber rescue motions without error', () => {
    const viewmodel = new ViewModelHands('POLICE');

    // Trigger capture swing
    viewmodel.triggerCapture();
    expect(() => {
      for (let i = 0; i < 25; i++) {
        viewmodel.update({
          dtSeconds: 0.016,
          speed: 4.0,
          sprint: true,
          crouch: false,
          grounded: true,
          verticalSpeed: 0,
          deltaYaw: 0,
          deltaPitch: 0,
          strafeInput: 0,
        });
      }
    }).not.toThrow();

    // Rescue untie gesture
    expect(() => {
      viewmodel.update({
        dtSeconds: 0.016,
        speed: 0,
        sprint: false,
        crouch: true,
        grounded: true,
        verticalSpeed: 0,
        deltaYaw: 0,
        deltaPitch: 0,
        strafeInput: 0,
        isRescuing: true,
      });
    }).not.toThrow();

    viewmodel.dispose();
  });
});
