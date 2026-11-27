import type { PerspectiveCamera } from 'three';
import { applyLook, InputState } from './state';

const CONTROL_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft',
  'ControlRight', 'KeyC', 'KeyE', 'KeyF', 'Space',
]);

export type ControlsOptions = {
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  onLockChange: (locked: boolean) => void;
  onError: (message: string) => void;
  onToggleHelp?: () => void;
};

export function createControls({ canvas, camera, onLockChange, onError, onToggleHelp }: ControlsOptions) {
  const input = new InputState();
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let disposed = false;
  let requesting = false;
  let locked = document.pointerLockElement === canvas;
  let wantsLock = locked;
  // Camera look sensitivity setting
  let sensitivityMultiplier = 1.0;
  const baseMouseSensitivity = 0.002;
  const maxSamplePixels = 240;
  let mouseX = 0;
  let mouseY = 0;
  let hasTouchLook = false;
  function clearMouse() {
    mouseX = 0;
    mouseY = 0;
  }
  camera.rotation.order = 'YXZ';

  function reset() {
    input.clear();
    clearMouse();
    locked = false;
    requesting = false;
    wantsLock = false;
    onLockChange(false);
  }

  function release() {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    reset();
  }

  document.addEventListener('pointerlockchange', () => {
    // Một request hoàn tất sau blur/teardown không được bật lại controls.
    if (disposed) return;
    if (document.pointerLockElement === canvas && !wantsLock) {
      document.exitPointerLock();
      return;
    }
    locked = document.pointerLockElement === canvas;
    wantsLock = locked;
    requesting = false;
    input.clear();
    clearMouse();
    onLockChange(locked);
  }, options);

  document.addEventListener('pointerlockerror', () => {
    reset();
    onError('Không khóa được chuột. Hãy bấm lại “Vào sân tập” hoặc kiểm tra quyền trình duyệt.');
  }, options);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyH') {
      onToggleHelp?.();
      return;
    }
    if (locked && event.code === 'Escape') {
      release();
      return;
    }
    if (!CONTROL_KEYS.has(event.code)) return;
    if (!locked) return;
    event.preventDefault();
    if (!event.repeat) {
      input.press(event.code);
      if (event.code === 'KeyE') {
        input.capture();
      }
    }
  }, options);

  window.addEventListener('keyup', (event) => {
    if (!CONTROL_KEYS.has(event.code)) return;
    if (!locked) return;
    event.preventDefault();
    input.release(event.code);
  }, options);

  document.addEventListener('mousemove', (event) => {
    if (!locked || !Number.isFinite(event.movementX) || !Number.isFinite(event.movementY)) return;
    const scale = maxSamplePixels / Math.max(maxSamplePixels, Math.hypot(event.movementX, event.movementY));
    mouseX += event.movementX * scale;
    mouseY += event.movementY * scale;
  }, options);

  const onMouseDown = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest('button, input, select, textarea')) return;
    if (locked && event.button === 0) input.capture();
  };
  canvas.addEventListener('mousedown', onMouseDown, options);
  window.addEventListener('mousedown', onMouseDown, options);
  window.addEventListener('blur', release, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) release();
  }, options);

  return {
    unlock: release,
    lockTouch() {
      if (disposed || locked) return;
      wantsLock = true;
      locked = true;
      input.clear();
      onLockChange(true);
    },
    input,
    setSensitivity(multiplier: number) {
      if (Number.isFinite(multiplier) && multiplier > 0) {
        sensitivityMultiplier = Math.max(0.1, Math.min(5.0, multiplier));
      }
    },
    addLookDelta(deltaX: number, deltaY: number) {
      mouseX += deltaX;
      mouseY += deltaY;
      hasTouchLook = true;
    },
    pressVirtual(code: string) {
      input.press(code);
    },
    releaseVirtual(code: string) {
      input.release(code);
    },
    triggerCapture() {
      input.capture();
    },
    updateLook(_frameMs?: number) {
      void _frameMs;
      if ((!locked && !hasTouchLook) || (mouseX === 0 && mouseY === 0)) return;
      hasTouchLook = false;
      const currentSens = baseMouseSensitivity * sensitivityMultiplier;
      // 20-degree ceiling after a stalled frame to bound corrupted device spikes
      const maxAngle = Math.PI / 9;
      const angle = Math.hypot(mouseX, mouseY) * currentSens;
      const gain = currentSens * Math.min(1, maxAngle / Math.max(1e-9, angle));
      const look = applyLook(camera.rotation.y, camera.rotation.x, mouseX, mouseY, gain);
      camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
      clearMouse();
    },
    async lock() {
      if (disposed || locked || requesting) return;
      if (!canvas.requestPointerLock) {
        onError('Trình duyệt chưa hỗ trợ khóa chuột. Hãy mở bằng Chrome hoặc Edge desktop.');
        return;
      }
      requesting = true;
      wantsLock = true;
      try {
        await canvas.requestPointerLock();
        if (disposed && document.pointerLockElement === canvas) document.exitPointerLock();
      } catch {
        if (disposed) return;
        reset();
        onError('Không khóa được chuột. Hãy bấm lại “Vào sân tập” để thử lại.');
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      release();
    },
  };
}
