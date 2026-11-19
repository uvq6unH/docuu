import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createControls } from '../../src/input/controls';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanups.splice(0)) dispose(); document.body.replaceChildren(); });

function setup() {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const camera = new PerspectiveCamera();
  const onLockChange = vi.fn();
  const onError = vi.fn();
  let lockElement: Element | null = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockElement });
  const setLock = (element: Element | null) => {
    lockElement = element;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: vi.fn(() => setLock(null)) });
  canvas.requestPointerLock = vi.fn(async () => { setLock(canvas); });
  const controls = createControls({ canvas, camera, onLockChange, onError });
  cleanups.push(controls.dispose);
  return { canvas, camera, onLockChange, onError, controls, setLock };
}

describe('F05 pointer lock lifecycle', () => {
  it('preserves ordinary deltas and bounds fast bursts without drifting or replaying after unlock', async () => {
    const { controls, camera, setLock } = setup();
    const move = (x: number, y: number) => {
      const event = new MouseEvent('mousemove');
      Object.defineProperties(event, { movementX: { value: x }, movementY: { value: y } });
      document.dispatchEvent(event);
    };
    await controls.lock();
    move(10, -5);
    move(15, -10);
    controls.updateLook(16);
    expect(camera.rotation.y).toBeCloseTo(-0.05);
    expect(camera.rotation.x).toBeCloseTo(0.03);
    for (let i = 0; i < 12; i++) move(900, -900);
    controls.updateLook(100);
    const yaw = camera.rotation.y;
    expect(yaw).toBeLessThan(-0.05);
    expect(Math.hypot(yaw + 0.05, camera.rotation.x - 0.03)).toBeCloseTo(Math.PI / 9);
    controls.updateLook(16);
    expect(camera.rotation.y).toBe(yaw);
    move(-1200, 0);
    setLock(null);
    await controls.lock();
    controls.updateLook(16);
    expect(camera.rotation.y).toBe(yaw);
  });
  it('ignores unlocked keyboard and handles actual held input after lock', async () => {
    const { controls } = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(controls.input.peek().moveZ).toBe(0);
    await controls.lock();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(controls.input.peek().moveZ).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(controls.input.peek().moveZ).toBe(0);
  });

  it.each(['blur', 'unlock', 'hidden'])('clears all held actions on %s', async (reason) => {
    const { controls, setLock } = setup();
    await controls.lock();
    for (const code of ['KeyW', 'KeyE', 'Space']) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    if (reason === 'unlock') setLock(null);
    if (reason === 'hidden') {
      const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      if (descriptor) Object.defineProperty(document, 'hidden', descriptor);
      else Reflect.deleteProperty(document, 'hidden');
    }
    expect(controls.input.peek()).toMatchObject({ moveZ: 0, rescueHeld: false, jumpPressed: false });
  });

  it('reports rejection and allows retry without unhandled promise errors', async () => {
    const { controls, canvas, onError } = setup();
    vi.mocked(canvas.requestPointerLock).mockRejectedValueOnce(new Error('Denied'));
    await controls.lock();
    expect(onError).toHaveBeenCalledOnce();
    await controls.lock();
    expect(document.pointerLockElement).toBe(canvas);
  });

  it('does not recapture a late pointer lock after blur', async () => {
    const { controls, canvas, setLock } = setup();
    let resolveRequest: () => void = () => {};
    vi.mocked(canvas.requestPointerLock).mockImplementation(() => new Promise<void>((resolve) => { resolveRequest = resolve; }));
    const pending = controls.lock();
    window.dispatchEvent(new Event('blur'));
    setLock(canvas); resolveRequest(); await pending;
    expect(document.pointerLockElement).toBeNull();
  });

  it('removes listeners, releases lock and is safe to dispose twice', async () => {
    const { controls, camera, canvas } = setup();
    await controls.lock(); controls.dispose(); controls.dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    expect(document.pointerLockElement).toBeNull();
    expect(controls.input.peek()).toMatchObject({ moveZ: 0, capturePressed: false });
    expect(camera.rotation.y).toBe(0);
  });
});
