import { villagePreview } from './world/village';
import './style.css';
import { createRenderer, createScene, disposeScene, resizeScene } from './core/scene';
import { createControls } from './input/controls';
import { initialMovement, stepMovement } from '../../packages/shared/src/movement';
import { movementRules } from '../../packages/shared/src/rules';
import { villageMap } from './world/shared-map';
import { loadVillageModels } from './world/load-village-models';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const container = requireElement('#viewport');
const status = requireElement('#status');
const button = requireElement<HTMLButtonElement>('#enter');
const debug = requireElement<HTMLOutputElement>('#debug');
const crosshair = requireElement('.crosshair');

try {
  const { scene, camera } = createScene();
  const world = villagePreview();
  scene.add(world.village);
  const renderer = createRenderer(container);
  const spawn = villageMap.spawns.robber[0]!;
  let player = initialMovement(spawn);
  let previous = player;
  let yaw = Math.atan2(spawn[0], spawn[2]);
  let pitch = 0;
  let playing = false;
  let lastFrame: number | undefined;
  let accumulated = 0;
  const surveyPosition = camera.position.clone();
  const surveyRotation = camera.rotation.clone();
  const stamina = requireElement('#stamina');
  const mockMode = import.meta.env.DEV && new URLSearchParams(location.search).get('backend') === 'mock';
  let mock: ReturnType<typeof import('./net/mock-session').connectMock> | undefined;
  let mockReady = false;
  let ready = 'Sẵn sàng. Bấm Vào sân tập để di chuyển.';
  const controls = createControls({
    canvas: renderer.domElement,
    camera,
    onLockChange(locked) {
      if (locked && !playing) {
        surveyPosition.copy(camera.position);
        surveyRotation.copy(camera.rotation);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
      } else if (!locked && playing) {
        mock?.send(controls.input.peek(), camera.rotation.y, camera.rotation.x);
        pitch = camera.rotation.x;
        yaw = camera.rotation.y;
        camera.position.copy(surveyPosition);
        camera.rotation.copy(surveyRotation);
      }
      playing = locked;
      previous = player;
      lastFrame = undefined;
      accumulated = 0;
      document.body.classList.toggle('looking', locked);
      crosshair.hidden = !locked;
      status.textContent = locked ? 'Chuột đã khóa. Nhấn Esc để thả.' : ready;
      if (!locked) button.focus({ preventScroll: true });
    },
    onError(message) { status.textContent = message; },
  });
  let disposed = false;
  if (import.meta.env.DEV) {
    const link = document.createElement('a');
    link.href = mockMode ? location.pathname : '?backend=mock';
    link.textContent = mockMode ? 'Về sân offline' : 'Kết nối backend thử nghiệm';
    requireElement('.notice').after(link);
  }
  if (mockMode) {
    world.setServerJail(null);
    ready = 'Đang chờ snapshot đầu tiên…';
    button.disabled = true;
    requireElement('.scene-label').textContent = 'Backend thử nghiệm · MOCK01';
    requireElement('.notice').textContent = 'WASD để đi, C để cúi. Server thử nghiệm điều khiển vị trí.';
    void import('./net/mock-session').then(({ connectMock }) => {
      if (disposed) return;
      mock = connectMock(scene, snapshot => {
        world.setServerJail(snapshot.jailId);
        const self = snapshot.self;
        if (!mockReady) {
          yaw = self.yaw;
          ready = 'Đã kết nối MOCK01. Bấm Vào sân tập để điều khiển.';
          status.textContent = ready;
        }
        mockReady = true;
        button.disabled = false;
        player = { ...player, pos: self.pos, stamina: self.stamina, grounded: self.grounded, crouched: self.crouch };
        previous = player;
        requireElement('.scene-label').textContent = 'MOCK01 · ' + self.id + ' · ' + (snapshot.players.length + 1) + ' nhân vật';
        debug.dataset.ack = String(self.ackSeq);
        debug.dataset.z = String(self.pos[2]);
      }, message => {
        world.setServerJail(null);
        mockReady = false;
        button.disabled = true;
        if (document.pointerLockElement) document.exitPointerLock();
        ready = message;
        status.textContent = message;
        requireElement('.scene-label').textContent = 'Backend thử nghiệm · Mất kết nối';
      });
    }).catch(() => { status.textContent = 'Không tải được kết nối backend thử nghiệm.'; });
  }
  container.setAttribute('aria-busy', 'true');
  void loadVillageModels(world.village, world.jailModel, () => disposed).finally(() => {
    if (!disposed) container.setAttribute('aria-busy', 'false');
  });
  let removePreview: (() => void) | undefined;
  if (import.meta.env.DEV) {
    void import('./world/mount-preview').then(({ mountPreview }) => {
      if (!disposed) removePreview = mountPreview(world, camera, requireElement('.panel'));
    }).catch(() => { status.textContent = 'Không tải được công cụ khảo sát làng.'; });
  }
  const enter = () => { void controls.lock(); };
  button.addEventListener('click', enter);
  const resize = () => resizeScene(renderer, camera, container.clientWidth, container.clientHeight);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  if (import.meta.env.DEV) debug.hidden = false;
  const tickMs = 1000 / movementRules.tickHz;
  const eyeHeight = (crouched: boolean) => crouched ? movementRules.crouchEyeHeight : movementRules.eyeHeight;
  renderer.setAnimationLoop((time) => {
    if (playing) {
      const frameMs = Math.max(0, time - (lastFrame ?? time - 1000 / 60));
      controls.updateLook(frameMs);
      accumulated = Math.min(accumulated + (lastFrame === undefined ? 0 : frameMs), tickMs * movementRules.maxCatchUpTicks);
      lastFrame = time;
      while (accumulated >= tickMs) {
        previous = player;
        const input = controls.input.consume();
        if (mockMode) mock?.send(input, camera.rotation.y, camera.rotation.x);
        else player = stepMovement(player, { ...input, yaw: camera.rotation.y }, 'ROBBER', villageMap);
        accumulated -= tickMs;
      }
      const blend = accumulated / tickMs;
      const lerp = (from: number, to: number) => from + (to - from) * blend;
      camera.position.set(
        lerp(previous.pos[0], player.pos[0]),
        lerp(previous.pos[1] + eyeHeight(previous.crouched), player.pos[1] + eyeHeight(player.crouched)),
        lerp(previous.pos[2], player.pos[2]),
      );
      stamina.textContent = 'Thể lực ' + Math.round(player.stamina) + '/' + movementRules.maxStamina;
    }
    renderer.render(scene, camera);
    if (import.meta.env.DEV) {
      const input = controls.input.peek();
      debug.dataset.x = player.pos[0].toFixed(3);
      debug.dataset.eye = camera.position.y.toFixed(3);
      debug.dataset.grounded = String(player.grounded);
      debug.textContent = `Input X/Z ${input.moveX}/${input.moveZ} · Sprint ${Number(input.sprint)} · Cúi ${Number(input.crouch)} · E ${Number(input.rescueHeld)} · Yaw ${camera.rotation.y.toFixed(2)} · Pitch ${camera.rotation.x.toFixed(2)}`;
    }
  });
  status.textContent = ready;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    removePreview?.();
    mock?.dispose();
    controls.dispose();
    button.removeEventListener('click', enter);
    observer.disconnect();
    renderer.setAnimationLoop(null);
    disposeScene(scene);
    renderer.dispose();
    renderer.domElement.remove();
    window.removeEventListener('pagehide', onPageHide);
  };
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  window.addEventListener('pagehide', onPageHide);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
} catch (error) {
  button.disabled = true;
  status.textContent = 'Không khởi tạo được WebGL. Hãy thử Chrome/Edge với tăng tốc đồ họa rồi tải lại trang.';
  console.error('Scene initialization failed', error);
}


