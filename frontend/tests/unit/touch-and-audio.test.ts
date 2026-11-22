import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TouchController } from '../../src/input/touch';
import { sound } from '../../src/core/audio';

describe('Touch Controls & Audio Engine Improvements', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="touch-controls" hidden>
        <div id="touch-joystick-zone" style="width: 120px; height: 120px;">
          <div id="touch-joystick-base">
            <div id="touch-joystick-knob"></div>
          </div>
        </div>
        <div id="touch-actions-zone">
          <button id="touch-btn-sprint" class="touch-btn" type="button"></button>
          <button id="touch-btn-jump" class="touch-btn" type="button"></button>
          <button id="touch-btn-crouch" class="touch-btn" type="button"></button>
          <button id="touch-btn-action" class="touch-btn" type="button"></button>
        </div>
      </div>
    `;
  });

  it('TouchController mounts and controls visibility', () => {
    const onMovement = vi.fn();
    const onLook = vi.fn();
    const onSprint = vi.fn();
    const onCrouch = vi.fn();
    const onJump = vi.fn();
    const onAction = vi.fn();

    const controller = new TouchController({
      onMovement,
      onLook,
      onSprint,
      onCrouch,
      onJump,
      onAction,
    });

    controller.mount(document.body);
    controller.setVisible(true);

    const overlay = document.querySelector('#touch-controls');
    expect(overlay?.hasAttribute('hidden')).toBe(false);

    controller.setVisible(false);
    expect(overlay?.hasAttribute('hidden')).toBe(true);
  });

  it('TouchController buttons trigger action callbacks', () => {
    const onMovement = vi.fn();
    const onLook = vi.fn();
    const onSprint = vi.fn();
    const onCrouch = vi.fn();
    const onJump = vi.fn();
    const onAction = vi.fn();

    const controller = new TouchController({
      onMovement,
      onLook,
      onSprint,
      onCrouch,
      onJump,
      onAction,
    });

    controller.mount(document.body);
    controller.setVisible(true);

    const btnJump = document.querySelector<HTMLButtonElement>('#touch-btn-jump')!;
    btnJump.dispatchEvent(new Event('touchstart'));
    expect(onJump).toHaveBeenCalledTimes(1);

    const btnSprint = document.querySelector<HTMLButtonElement>('#touch-btn-sprint')!;
    btnSprint.dispatchEvent(new Event('touchstart'));
    expect(onSprint).toHaveBeenCalledWith(true);

    const btnCrouch = document.querySelector<HTMLButtonElement>('#touch-btn-crouch')!;
    btnCrouch.dispatchEvent(new Event('touchstart'));
    expect(onCrouch).toHaveBeenCalledWith(true);

    const btnAction = document.querySelector<HTMLButtonElement>('#touch-btn-action')!;
    btnAction.dispatchEvent(new Event('touchstart'));
    expect(onAction).toHaveBeenCalledWith(true);
    btnAction.dispatchEvent(new Event('touchend'));
    expect(onAction).toHaveBeenCalledWith(false);
  });

  it('SoundEngine clamps master volume and handles volume adjustments', () => {
    sound.setMasterVolume(0.5);
    expect(sound.volume).toBe(0.5);

    sound.setMasterVolume(1.5);
    expect(sound.volume).toBe(1.0);

    sound.setMasterVolume(-0.2);
    expect(sound.volume).toBe(0.0);

    sound.setMasterVolume(0.8);
    expect(sound.volume).toBe(0.8);
  });
});
