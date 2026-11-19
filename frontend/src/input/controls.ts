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
};

export function createControls({ canvas, camera, onLockChange, onError }: ControlsOptions) {
  const input = new InputState();
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let disposed = false;
  let requesting = false;
  let locked = document.pointerLockElement === canvas;
  let wantsLock = locked;
  // Chỉ camera setting; không phải gameplay tunable.
  const mouseSensitivity = 0.002;
  // Limit a single bad device sample before it can bury a real movement
  // in the opposite direction. The render loop also bounds batched events.
  const maxSamplePixels = 160;
  let mouseX = 0;
  let mouseY = 0;
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
    if (locked && event.code === 'Escape') {
      release();
      return;
    }
    if (!locked || !CONTROL_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat) input.press(event.code);
  }, options);

  window.addEventListener('keyup', (event) => {
    if (!CONTROL_KEYS.has(event.code)) return;
    if (locked) event.preventDefault();
    input.release(event.code);
  }, options);

  document.addEventListener('mousemove', (event) => {
    if (!locked || !Number.isFinite(event.movementX) || !Number.isFinite(event.movementY)) return;
    const scale = maxSamplePixels / Math.max(maxSamplePixels, Math.hypot(event.movementX, event.movementY));
    mouseX += event.movementX * scale;
    mouseY += event.movementY * scale;
  }, options);

  canvas.addEventListener('mousedown', (event) => {
    if (locked && event.button === 0) input.capture();
  }, options);
  window.addEventListener('blur', release, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) release();
  }, options);

  return {
    input,
    updateLook(frameMs: number) {
      if (!locked || (mouseX === 0 && mouseY === 0)) return;
      // Up to two turns/second, with a 20-degree ceiling after a stalled frame.
      const maxAngle = Math.min(Math.PI / 9, 4 * Math.PI * frameMs / 1000);
      const angle = Math.hypot(mouseX, mouseY) * mouseSensitivity;
      const gain = mouseSensitivity * Math.min(1, maxAngle / angle);
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
