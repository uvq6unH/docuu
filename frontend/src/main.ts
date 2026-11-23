import { villagePreview } from './world/village';
import './style.css';
import {
  createRenderer,
  createScene,
  detectGpuDiagnostics,
  disposeScene,
  resizeScene,
  setAtmosphere,
  type AtmospherePreset,
} from './core/scene';
import { createControls } from './input/controls';
import { TouchController } from './input/touch';
import { initialMovement, stepMovement, type MovementState } from '../../packages/shared/src/movement';
import { movementRules } from '../../packages/shared/src/rules';
import { villageMap } from './world/shared-map';
import { loadVillageModels } from './world/load-village-models';
import { mountRoomDetails } from './net/room-details';
import { GameSession } from './net/game-session';
import type {
  RoomState,
  GameEvent,
  Snapshot,
  QuickChatMessage,
  TacticalPing,
  PebbleEvent,
  HatCosmetic,
  CosmeticPreferences,
} from '../../packages/shared/src/protocol';
import type { Vec3 } from '../../packages/shared/src/map';
import { sound } from './core/audio';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import { ViewModelHands } from './player/viewmodel';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

// DOM Elements
const container = requireElement('#viewport');
const status = requireElement('#status');
const button = requireElement<HTMLButtonElement>('#enter');
const debug = requireElement<HTMLOutputElement>('#debug');
const crosshair = requireElement('.crosshair');
const stamina = requireElement('#stamina');
const sceneLabel = requireElement('.scene-label');
const notice = requireElement('.notice');
const connectionInfo = requireElement('#connection-info');

// Lobby & Room UI Elements
const menuView = requireElement('#menu-view');
const roomView = requireElement('#room-view');
const playerNameInput = requireElement<HTMLInputElement>('#player-name');
const btnCreateRoom = requireElement<HTMLButtonElement>('#btn-create-room');
const joinRoomCodeInput = requireElement<HTMLInputElement>('#join-room-code');
const btnJoinRoom = requireElement<HTMLButtonElement>('#btn-join-room');
const btnMockMode = requireElement<HTMLButtonElement>('#btn-mock-mode');
const btnOfflineMode = requireElement<HTMLButtonElement>('#btn-offline-mode');

const displayRoomCode = requireElement('#display-room-code');
const btnCopyCode = requireElement<HTMLButtonElement>('#btn-copy-code');
const rosterList = requireElement('#roster-list');
const captainJailPicker = requireElement('#captain-jail-picker');
const btnToggleReady = requireElement<HTMLButtonElement>('#btn-toggle-ready');
const btnStartGame = requireElement<HTMLButtonElement>('#btn-start-game');
const btnRematch = requireElement<HTMLButtonElement>('#btn-rematch');
const resultPanel = requireElement('#match-result');
const resultTitle = requireElement('#result-title');
const resultReason = requireElement('#result-reason');
const resultWait = requireElement('#result-wait');
const btnLeaveRoom = requireElement<HTMLButtonElement>('#btn-leave-room');

// Role selection & Bot controls
const rolePickerContainer = requireElement<HTMLDivElement>('#role-picker-container');
const btnRoleAuto = requireElement<HTMLButtonElement>('#btn-role-auto');
const btnRolePolice = requireElement<HTMLButtonElement>('#btn-role-police');
const btnRoleRobber = requireElement<HTMLButtonElement>('#btn-role-robber');

const hostRoomControls = requireElement<HTMLDivElement>('#host-room-controls');
const btnAddBot = requireElement<HTMLButtonElement>('#btn-add-bot');
const btnRemoveBot = requireElement<HTMLButtonElement>('#btn-remove-bot');
const btnAutoRoles = requireElement<HTMLButtonElement>('#btn-auto-roles');

// HUD Elements
const hudOverlay = requireElement('#hud-overlay');
const hudTimer = requireElement('#hud-timer');
const hudPhase = requireElement('#hud-phase');
const hudRole = requireElement('#hud-role');
const hudJail = requireElement('#hud-jail');
const hudJailedCount = requireElement('#hud-jailed-count');
const hudStealthCard = requireElement('#hud-stealth-card');
const hudImmuneCard = requireElement('#hud-immune-card');
const hudImmuneSec = requireElement('#hud-immune-sec');
const eventToast = requireElement('#event-toast');

// Compass, Minimap, Prompts, and Modal Elements (T03)
const compassCardinal = requireElement('#compass-cardinal');
const compassJailIndicator = requireElement('#compass-jail-indicator');
const minimapCanvas = requireElement<HTMLCanvasElement>('#hud-minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const actionPrompt = requireElement('#action-prompt');
const hudAction = requireElement('#hud-action');
const rescueBarContainer = requireElement('#rescue-bar-container');
const rescueBarFill = requireElement('#rescue-bar-fill');
const hitFlash = requireElement('#hit-flash');
const helpModal = requireElement('#help-modal');
const btnToggleHelp = requireElement<HTMLButtonElement>('#btn-toggle-help');
const btnCloseHelp = requireElement<HTMLButtonElement>('#btn-close-help');

// Settings Modal & Spectator Elements
const btnToggleSettings = requireElement<HTMLButtonElement>('#btn-toggle-settings');
const btnCloseSettings = requireElement<HTMLButtonElement>('#btn-close-settings');
const settingsModal = requireElement('#settings-modal');
const settingMouseSens = requireElement<HTMLInputElement>('#setting-mouse-sens');
const valMouseSens = requireElement('#val-mouse-sens');
const settingFov = requireElement<HTMLInputElement>('#setting-fov');
const valFov = requireElement('#val-fov');
const settingVolume = requireElement<HTMLInputElement>('#setting-volume');
const valVolume = requireElement('#val-volume');
const settingTouchToggle = requireElement<HTMLInputElement>('#setting-touch-toggle');
const settingWeather = requireElement<HTMLSelectElement>('#setting-weather');

const spectatorHud = requireElement('#spectator-hud');
const spectatorTargetName = requireElement('#spectator-target-name');
const btnSpectatorMode = requireElement<HTMLButtonElement>('#btn-spectator-mode');

// Quick Chat & Radio Elements
const quickChatFeed = requireElement<HTMLDivElement>('#quick-chat-feed');
const quickChatHints = requireElement<HTMLDivElement>('#quick-chat-hints');

// MVP & Result Elements
const mvpCardsContainer = requireElement<HTMLDivElement>('#mvp-cards-container');
const mvpPoliceName = requireElement<HTMLDivElement>('#mvp-police-name');
const mvpPoliceStat = requireElement<HTMLDivElement>('#mvp-police-stat');
const mvpRobberName = requireElement<HTMLDivElement>('#mvp-robber-name');
const mvpRobberStat = requireElement<HTMLDivElement>('#mvp-robber-stat');
const matchStatsContainer = requireElement<HTMLDivElement>('#match-stats-container');
const matchStatsTbody = requireElement<HTMLTableSectionElement>('#match-stats-tbody');

// Public Room Browser & Tutorial Elements
const publicRoomsList = requireElement<HTMLDivElement>('#public-rooms-list');
const btnRefreshRooms = requireElement<HTMLButtonElement>('#btn-refresh-rooms');
const btnTutorial = requireElement<HTMLButtonElement>('#btn-tutorial');
const tutorialOverlay = requireElement<HTMLDivElement>('#tutorial-overlay');
const tutorialStepTag = requireElement<HTMLSpanElement>('#tutorial-step-tag');
const tutorialTitle = requireElement<HTMLHeadingElement>('#tutorial-title');
const tutorialDesc = requireElement<HTMLParagraphElement>('#tutorial-desc');
const tutorialProgressFill = requireElement<HTMLDivElement>('#tutorial-progress-fill');
const btnExitTutorial = requireElement<HTMLButtonElement>('#btn-exit-tutorial');

// Map Variant & Cosmetics Elements
const mapVariantContainer = requireElement<HTMLDivElement>('#map-variant-container');
const selectMapVariant = requireElement<HTMLSelectElement>('#select-map-variant');
const selectCosmeticHat = requireElement<HTMLSelectElement>('#select-cosmetic-hat');

try {
  const { scene, camera, sun, hemi } = createScene();
  scene.add(camera);

  const viewmodel = new ViewModelHands('ROBBER');
  viewmodel.attachToCamera(camera);
  viewmodel.setVisible(false);

  const world = villagePreview();
  scene.add(world.village);
  const renderer = createRenderer(container);
  const gpuDiag = detectGpuDiagnostics(renderer);
  if (gpuDiag.isSoftware) {
    const gpuBanner = document.getElementById('gpu-warning-banner');
    const gpuDetail = document.getElementById('gpu-warning-detail');
    if (gpuBanner && gpuDetail) {
      gpuDetail.textContent = `Phát hiện đồ họa 3D đang chạy bằng CPU giả lập (${gpuDiag.rendererString}) do trình duyệt đang tắt "Tăng tốc phần cứng", làm CPU tăng vọt 100% và gây giật lag.`;
      gpuBanner.hidden = false;
    }
  }
  if (import.meta.env.DEV) (window as Window & { __THREE_RENDERER__?: unknown }).__THREE_RENDERER__ = renderer;
  const spawn = villageMap.spawns.robber[0]!;

  let player = initialMovement(spawn);
  let previous = player;
  let yaw = Math.atan2(spawn[0], spawn[2]);
  let pitch = 0;
  let playing = false;
  let lastFrame: number | undefined;
  let accumulated = 0;
  let isOffline = true;
  let isReady = false;
  let toastTimer: number | null = null;
  let latestSnapshot: Snapshot | null = null;
  let currentRole: 'POLICE' | 'ROBBER' | null = null;
  let activeJailId = 'J1';
  let lastRemainingSec = -1;
  let lastCaptureAttemptTime = 0;
  let lastObservedPhase = '';
  let lastFrozenNoticeTime = 0;
  let lastStaminaVal = -1;
  let spectatorIndex = 0;
  let isSpectating = false;
  let spectatorMode: 'THIRD_PERSON' | 'FIRST_PERSON' = 'THIRD_PERSON';
  const spectatorCamPos = new Vector3();
  let spectatorCamYaw = 0;
  let hasValidSpectatorCamPos = false;
  let lastSpectatedTargetId: string | null = null;
  let prevCameraYaw = 0;
  let prevCameraPitch = 0;
  let currentBaseFov = 75;

  function updateSpectatorModeButton(): void {
    btnSpectatorMode.textContent = spectatorMode === 'THIRD_PERSON'
      ? '🎥 Góc nhìn: Người thứ 3 (Sau lưng)'
      : '👁️ Góc nhìn: Người thứ 1 (Mắt đồng đội)';
  }

  interface PredictedFrame {
    seq: number;
    input: ReturnType<typeof controls.input.consume>;
    yaw: number;
    predictedPos: Vec3;
    verticalSpeed: number;
    grounded: boolean;
  }
  const predictionHistory: PredictedFrame[] = [];
  const visualErrorOffset = { x: 0, y: 0, z: 0 };

  const surveyPosition = camera.position.clone();
  const surveyRotation = camera.rotation.clone();

  // Load saved player name or generate random
  const savedName = localStorage.getItem('folk_tag_name') || `Người chơi ${Math.floor(100 + Math.random() * 900)}`;
  playerNameInput.value = savedName;
  playerNameInput.addEventListener('change', () => {
    localStorage.setItem('folk_tag_name', playerNameInput.value.trim());
  });

  // 3D Visual Rescue Rings at Active Jail Anchors
  const beaconGroup = new Group();
  scene.add(beaconGroup);
  const ringGeo = new RingGeometry(0.35, 0.65, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new MeshBasicMaterial({ color: '#52b788', side: DoubleSide, transparent: true, opacity: 0.85 });
  const ring1 = new Mesh(ringGeo, ringMat);
  const ring2 = new Mesh(ringGeo, ringMat);
  beaconGroup.add(ring1);
  beaconGroup.add(ring2);

  function updateJailRescueBeacons(jailId: string) {
    const jail = villageMap.jails.find((j) => j.id === jailId) || villageMap.jails[0]!;
    if (jail.rescueAnchors[0]) {
      ring1.position.set(jail.rescueAnchors[0][0], jail.rescueAnchors[0][1] + 0.05, jail.rescueAnchors[0][2]);
    }
    if (jail.rescueAnchors[1]) {
      ring2.position.set(jail.rescueAnchors[1][0], jail.rescueAnchors[1][1] + 0.05, jail.rescueAnchors[1][2]);
    }
  }
  updateJailRescueBeacons('J1');

  // Folk Costume preferences
  let currentShirtColor = '';
  let currentHat: HatCosmetic = 'none';

  // Tactical Ping objects
  interface ActivePingRing {
    mesh: Mesh;
    opacity: number;
    scale: number;
  }
  const activePingRings: ActivePingRing[] = [];
  const activeMinimapPings: { pos: Vec3; role: string; expireTime: number }[] = [];

  function spawnTacticalPingRing(pos: Vec3, role: string) {
    const geo = new RingGeometry(0.35, 0.55, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({
      color: role === 'POLICE' ? 0x2876c9 : 0xec8f32,
      side: DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(pos[0], 0.05, pos[2]);
    scene.add(mesh);
    activePingRings.push({ mesh, opacity: 0.9, scale: 1.0 });
  }

  function spawnPebbleImpact(pos: Vec3) {
    const geo = new RingGeometry(0.1, 0.25, 16);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({
      color: 0x9e8965,
      side: DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(pos[0], 0.04, pos[2]);
    scene.add(mesh);
    activePingRings.push({ mesh, opacity: 0.75, scale: 0.8 });
  }

  // Interactive Tutorial state
  let isTutorial = false;
  let tutorialStep = 1;
  let tutorialTimer = 0;

  function showToast(message: string, durationMs = 3500) {
    if (toastTimer) clearTimeout(toastTimer);
    eventToast.textContent = message;
    eventToast.hidden = false;
    eventToast.style.opacity = '1';
    toastTimer = window.setTimeout(() => {
      eventToast.style.opacity = '0';
      window.setTimeout(() => { eventToast.hidden = true; }, 300);
    }, durationMs);
  }

  function flashScreen(type: 'flash-capture' | 'flash-rescue') {
    hitFlash.className = `hit-flash ${type}`;
    hitFlash.hidden = false;
    hitFlash.style.opacity = '1';
    window.setTimeout(() => {
      hitFlash.style.opacity = '0';
      window.setTimeout(() => { hitFlash.hidden = true; }, 250);
    }, 100);
  }

  function toggleHelp(open?: boolean) {
    const shouldOpen = open !== undefined ? open : helpModal.hidden;
    helpModal.hidden = !shouldOpen;
  }
  btnToggleHelp.addEventListener('click', () => toggleHelp(true));
  btnCloseHelp.addEventListener('click', () => toggleHelp(false));

  function formatRemainingTime(ms: number): string {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const mockDetails = mountRoomDetails(roomView);
  let resultShown = '';
  let viewSession = '';

  // Pre-render static village obstacles once onto an offscreen canvas (Zero per-frame allocations)
  const staticMinimapCanvas = document.createElement('canvas');
  staticMinimapCanvas.width = minimapCanvas.width;
  staticMinimapCanvas.height = minimapCanvas.height;
  const staticCtx = staticMinimapCanvas.getContext('2d');
  if (staticCtx) {
    const w = staticMinimapCanvas.width;
    const h = staticMinimapCanvas.height;
    const toX = (wx: number) => ((wx + 40) / 80) * w;
    const toY = (wz: number) => ((wz + 40) / 80) * h;

    staticCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    staticCtx.lineWidth = 1;
    staticCtx.strokeRect(1, 1, w - 2, h - 2);

    staticCtx.fillStyle = 'rgba(160, 175, 160, 0.35)';
    for (const col of villageMap.colliders) {
      const cx = toX(col.center[0] - col.size[0] / 2);
      const cy = toY(col.center[2] - col.size[2] / 2);
      const sw = (col.size[0] / 80) * w;
      const sh = (col.size[2] / 80) * h;
      staticCtx.fillRect(cx, cy, sw, sh);
    }
  }

  const jailsById = new Map(villageMap.jails.map((j) => [j.id, j]));

  // Compass heading update (Debounced + 30Hz throttle to save CPU)
  let lastCompassDeg = -999;
  let lastCompassDist = -999;
  let lastCompassTime = 0;
  function updateCompass(cameraYaw: number, selfPos: [number, number, number], targetJailId: string, now = performance.now()) {
    if (now - lastCompassTime < 33) return;
    lastCompassTime = now;
    const deg = (Math.round((-cameraYaw * 180) / Math.PI) % 360 + 360) % 360;
    const jail = jailsById.get(targetJailId) || villageMap.jails[0]!;
    const dist = Math.round(Math.hypot(jail.center[0] - selfPos[0], jail.center[2] - selfPos[2]));

    if (deg !== lastCompassDeg) {
      lastCompassDeg = deg;
      let cardinal: string;
      if (deg >= 337.5 || deg < 22.5) cardinal = 'B (Bắc)';
      else if (deg >= 22.5 && deg < 67.5) cardinal = 'ĐB (Đông Bắc)';
      else if (deg >= 67.5 && deg < 112.5) cardinal = 'Đ (Đông)';
      else if (deg >= 112.5 && deg < 157.5) cardinal = 'ĐN (Đông Nam)';
      else if (deg >= 157.5 && deg < 202.5) cardinal = 'N (Nam)';
      else if (deg >= 202.5 && deg < 247.5) cardinal = 'TN (Tây Nam)';
      else if (deg >= 247.5 && deg < 292.5) cardinal = 'T (Tây)';
      else cardinal = 'TB (Tây Bắc)';
      compassCardinal.textContent = `${cardinal} · ${deg}°`;
    }

    if (dist !== lastCompassDist) {
      lastCompassDist = dist;
      compassJailIndicator.textContent = `🏛️ ${jail.id}: ${dist}m`;
    }
  }

  // 2D Radar Minimap (T03) - Blits static canvas background at 30Hz to conserve CPU
  let lastMinimapRenderTime = 0;
  function renderMinimap(selfPos: [number, number, number], cameraYaw: number, targetJailId: string, now = performance.now()) {
    if (!minimapCtx) return;
    if (now - lastMinimapRenderTime < 33) return; // 30Hz minimap refresh rate
    lastMinimapRenderTime = now;

    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    minimapCtx.clearRect(0, 0, w, h);
    minimapCtx.drawImage(staticMinimapCanvas, 0, 0);

    const toX = (wx: number) => ((wx + 40) / 80) * w;
    const toY = (wz: number) => ((wz + 40) / 80) * h;

    // Active Jail
    const jail = jailsById.get(targetJailId) || villageMap.jails[0]!;
    const jx = toX(jail.center[0]);
    const jy = toY(jail.center[2]);
    minimapCtx.fillStyle = '#f39c12';
    minimapCtx.beginPath();
    minimapCtx.arc(jx, jy, 4.5, 0, Math.PI * 2);
    minimapCtx.fill();

    // Remote Players
    for (const remote of session.getRemoteEntities().values()) {
      if (remote.role !== currentRole && remote.state === 'HIDDEN') continue;
      const rx = toX(remote.currentPos.x);
      const ry = toY(remote.currentPos.z);
      minimapCtx.fillStyle = remote.role === 'POLICE' ? '#2876c9' : '#ec8f32';
      minimapCtx.beginPath();
      minimapCtx.arc(rx, ry, 3, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    // Self Player Pointer
    const sx = toX(selfPos[0]);
    const sy = toY(selfPos[2]);
    minimapCtx.fillStyle = '#ffffff';
    minimapCtx.beginPath();
    minimapCtx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    minimapCtx.fill();

    const forwardX = -Math.sin(cameraYaw) * 6;
    const forwardY = -Math.cos(cameraYaw) * 6;
    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    minimapCtx.moveTo(sx, sy);
    minimapCtx.lineTo(sx + forwardX, sy + forwardY);
    minimapCtx.stroke();

    // Tactical Pings on Minimap
    for (let i = activeMinimapPings.length - 1; i >= 0; i--) {
      const p = activeMinimapPings[i]!;
      if (now > p.expireTime) {
        activeMinimapPings.splice(i, 1);
      } else {
        const px = toX(p.pos[0]);
        const py = toY(p.pos[2]);
        const progress = Math.max(0, (p.expireTime - now) / 3000);
        const radius = 3 + (1 - progress) * 8;
        minimapCtx.save();
        minimapCtx.strokeStyle = p.role === 'POLICE' ? `rgba(40, 118, 201, ${progress})` : `rgba(236, 143, 50, ${progress})`;
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.arc(px, py, radius, 0, Math.PI * 2);
        minimapCtx.stroke();
        minimapCtx.restore();
      }
    }
  }

  // Aim Assist & Proximity Action Prompts (Debounced style mutations + 30Hz throttle)
  let lastAimAction: 'capture' | 'rescue' | null = null;
  let lastAimCheckTime = 0;
  function checkAimInteraction(snapshot: Snapshot | null, yaw: number, now = performance.now()) {
    if (now - lastAimCheckTime < 33) return; // 30Hz aim check throttle
    lastAimCheckTime = now;

    let action: 'capture' | 'rescue' | null = null;
    if (snapshot?.phase === 'PLAYING') {
      if (currentRole === 'POLICE') {
        const forwardX = -Math.sin(yaw);
        const forwardZ = -Math.cos(yaw);
        for (const remote of session.getRemoteEntities().values()) {
          if (remote.role !== 'ROBBER' || remote.state === 'JAILED' || remote.state === 'IMMUNE') continue;
          const dx = remote.currentPos.x - player.pos[0];
          const dz = remote.currentPos.z - player.pos[2];
          const dist = Math.hypot(dx, dz);
          const dy = Math.abs(remote.currentPos.y - player.pos[1]);

          if (dist <= 2.2 && dy <= 1.2) {
            const dot = (forwardX * dx + forwardZ * dz) / dist;
            const angleDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
            if (angleDeg <= 65) {
              action = 'capture';
              break;
            }
          }
        }
      } else if (snapshot.jailedCount > 0 && currentRole === 'ROBBER' && snapshot.self.state !== 'JAILED') {
        const jail = snapshot.jailId ? jailsById.get(snapshot.jailId) : null;
        if (jail) {
          const forwardX = -Math.sin(yaw);
          const forwardZ = -Math.cos(yaw);
          for (const anchor of jail.rescueAnchors) {
            const dist = Math.hypot(anchor[0] - player.pos[0], anchor[2] - player.pos[2]);
            if (dist <= 1.8) {
              const toJailX = jail.center[0] - player.pos[0];
              const toJailZ = jail.center[2] - player.pos[2];
              if (forwardX * toJailX + forwardZ * toJailZ >= 0) {
                action = 'rescue';
                break;
              }
            }
          }
        }
      }
    }
    if (action !== lastAimAction) {
      lastAimAction = action;
      actionPrompt.hidden = action === null;
      if (action) {
        actionPrompt.textContent = action === 'capture' ? '⚡ [CHUỘT TRÁI / E] BẮT CƯỚP!' : '🔓 [GIỮ E / F] CỨU ĐỒNG ĐỘI (2s)';
        actionPrompt.className = 'action-prompt prompt-' + action;
      }
      const color = action === 'capture' ? '#ff4d4d' : '#52b788';
      crosshair.style.background = action ? color : '#ffffff';
      crosshair.style.boxShadow = action ? '0 0 8px ' + color : '0 1px 3px #263d30';
    }
  }

  // Session Callbacks
  const session = new GameSession(scene, {
    onStatus(msg, isErr) {
      status.textContent = msg;
      status.style.color = isErr ? '#963624' : '#263d30';
      connectionInfo.textContent = msg;
    },
    onInterrupted() {
      latestSnapshot = null;
      controls.input.clear();
      if (document.pointerLockElement) document.exitPointerLock();
      hudOverlay.hidden = true;
    },
    onRoom(room) {
      if (!room || room.phase === 'LOBBY') latestSnapshot = null;
      if (room) isOffline = false;
      updateRoomUI(room);
    },
    onSnapshot(snapshot) {
      latestSnapshot = snapshot;
      if (snapshot.phase === 'RESULT') {
        if (snapshot.result && resultShown !== snapshot.matchId) {
          resultShown = snapshot.matchId;
          const { winner, reason } = snapshot.result;
          resultTitle.textContent = winner === 'POLICE' ? 'Cảnh sát thắng' : winner === 'ROBBER' ? 'Cướp thắng' : 'Ván đấu đã hủy';
          const reasons: Record<string, string> = {
            ALL_ROBBERS_JAILED: 'Toàn bộ cướp đã bị bắt.',
            TIME_EXPIRED: 'Hết giờ, vẫn còn cướp tự do.',
            DISCONNECT_TIMEOUT: 'Người chơi mất kết nối quá thời gian cho phép.',
          };
          resultReason.textContent = reasons[reason] ?? reason;

          // Render MVP and Summary Stats Card
          if (snapshot.result.stats) {
            matchStatsContainer.hidden = false;
            matchStatsTbody.replaceChildren();
            for (const [pId, pStat] of Object.entries(snapshot.result.stats)) {
              const member = session.currentRoom?.roster.find((m) => m.id === pId);
              const row = document.createElement('tr');
              const nameCell = document.createElement('td');
              nameCell.textContent = member?.name || pId;
              if (pId === session.playerId) nameCell.style.fontWeight = '700';

              const roleCell = document.createElement('td');
              roleCell.textContent = member?.role === 'POLICE' ? '👮 Cảnh sát' : '🥷 Cướp';

              const capCell = document.createElement('td');
              capCell.textContent = String(pStat.captures || 0);

              const resCell = document.createElement('td');
              resCell.textContent = String(pStat.rescues || 0);

              const jailCell = document.createElement('td');
              jailCell.textContent = `${Math.round((pStat.timeJailedMs || 0) / 1000)}s`;

              row.append(nameCell, roleCell, capCell, resCell, jailCell);
              matchStatsTbody.append(row);
            }
          }

          if (snapshot.result.mvpPolice || snapshot.result.mvpRobber) {
            mvpCardsContainer.hidden = false;
            if (snapshot.result.mvpPolice) {
              const pMember = session.currentRoom?.roster.find((m) => m.id === snapshot.result!.mvpPolice);
              const pStat = snapshot.result.stats?.[snapshot.result.mvpPolice];
              mvpPoliceName.textContent = pMember?.name || snapshot.result.mvpPolice;
              mvpPoliceStat.textContent = `${pStat?.captures || 0} lần bắt`;
            }
            if (snapshot.result.mvpRobber) {
              const rMember = session.currentRoom?.roster.find((m) => m.id === snapshot.result!.mvpRobber);
              const rStat = snapshot.result.stats?.[snapshot.result.mvpRobber];
              mvpRobberName.textContent = rMember?.name || snapshot.result.mvpRobber;
              mvpRobberStat.textContent = `${rStat?.rescues || 0} lần giải cứu`;
            }
          }

          resultPanel.hidden = false;
          resultTitle.focus();
        }
        return;
      }
      world.setServerJail(snapshot.jailId);
      activeJailId = snapshot.jailId || 'J1';
      updateJailRescueBeacons(activeJailId);

      const self = snapshot.self;
      if (!self) return;
      const identity = snapshot.matchId + '/' + self.id;
      currentRole = self.role;
      viewmodel.setRole(self.role);

      // Phase transition or new match: Snap cleanly to authoritative spawn point & clear prediction history
      if (lastObservedPhase !== snapshot.phase || viewSession !== identity) {
        lastObservedPhase = snapshot.phase;
        viewSession = identity;
        yaw = self.yaw;
        pitch = 0;
        player = {
          ...player,
          pos: [self.pos[0], self.pos[1], self.pos[2]],
          stamina: self.stamina,
          grounded: self.grounded,
          crouched: Boolean(self.crouch),
          verticalSpeed: self.vel ? self.vel[1] : 0,
        };
        previous = { ...player, pos: [...player.pos] };
        predictionHistory.length = 0;
        visualErrorOffset.x = visualErrorOffset.y = visualErrorOffset.z = 0;
        if (playing) camera.rotation.set(pitch, yaw, 0, 'YXZ');
      } else if (self.state === 'JAILED') {
        player = {
          ...player,
          pos: [self.pos[0], self.pos[1], self.pos[2]],
          stamina: self.stamina,
          grounded: self.grounded,
          crouched: false,
          verticalSpeed: 0,
        };
        previous = { ...player, pos: [...player.pos] };
        predictionHistory.length = 0;
        visualErrorOffset.x = visualErrorOffset.y = visualErrorOffset.z = 0;
      } else {
        // Authoritative Client-Side Prediction: Reconcile against self.ackSeq
        const ackIndex = predictionHistory.findIndex((f) => f.seq === self.ackSeq);
        if (ackIndex >= 0) {
          const ackFrame = predictionHistory[ackIndex]!;
          const errX = self.pos[0] - ackFrame.predictedPos[0];
          const errZ = self.pos[2] - ackFrame.predictedPos[2];
          const errY = self.pos[1] - ackFrame.predictedPos[1];
          const errDist = Math.hypot(errX, errZ);
          const errHeight = Math.abs(errY);

          // Discard acknowledged frames up to ackSeq
          predictionHistory.splice(0, ackIndex + 1);

          if (errDist > 2.0 || errHeight > 1.5) {
            // Hard snap on large server correction / teleport / boundary clamp
            player.pos = [self.pos[0], self.pos[1], self.pos[2]];
            player.verticalSpeed = self.vel ? self.vel[1] : 0;
            player.grounded = self.grounded;
            previous = { ...player, pos: [...player.pos] };
            predictionHistory.length = 0;
            visualErrorOffset.x = visualErrorOffset.y = visualErrorOffset.z = 0;
          } else if (errDist > 0.04 || errHeight > 0.04) {
            // Replay pending unacknowledged frames starting from authoritative server state
            let replayed: MovementState = {
              pos: [self.pos[0], self.pos[1], self.pos[2]],
              verticalSpeed: self.vel ? self.vel[1] : 0,
              grounded: self.grounded,
              crouched: Boolean(self.crouch),
              sprinting: false,
              stamina: self.stamina,
              exhausted: false,
              regenDelayTicks: 0,
            };
            for (const pending of predictionHistory) {
              replayed = stepMovement(
                replayed,
                { ...pending.input, yaw: pending.yaw },
                currentRole || 'ROBBER',
                villageMap
              );
              pending.predictedPos = [replayed.pos[0], replayed.pos[1], replayed.pos[2]];
              pending.verticalSpeed = replayed.verticalSpeed;
              pending.grounded = replayed.grounded;
            }

            // Smooth Visual Error Absorption (Unreal/Source style)
            // Absorb positional delta into visualErrorOffset so the camera glides without any pop or hitch!
            const deltaX = player.pos[0] - replayed.pos[0];
            const deltaY = player.pos[1] - replayed.pos[1];
            const deltaZ = player.pos[2] - replayed.pos[2];

            if (Math.hypot(deltaX, deltaZ) < 1.2 && Math.abs(deltaY) < 1.0) {
              visualErrorOffset.x += deltaX;
              visualErrorOffset.y += deltaY;
              visualErrorOffset.z += deltaZ;
            }

            player.pos = [replayed.pos[0], replayed.pos[1], replayed.pos[2]];
            player.verticalSpeed = replayed.verticalSpeed;
            player.grounded = replayed.grounded;
            previous.pos[0] -= deltaX;
            previous.pos[1] -= deltaY;
            previous.pos[2] -= deltaZ;
          }
          // If error <= 0.04m: Prediction matches server authoritative physics exactly.
          // Zero jitter, zero pull-back!
        } else if (predictionHistory.length === 0) {
          const errDist = Math.hypot(self.pos[0] - player.pos[0], self.pos[2] - player.pos[2]);
          if (errDist > 1.5) {
            player.pos = [self.pos[0], self.pos[1], self.pos[2]];
            player.verticalSpeed = 0;
            previous = { ...player, pos: [...player.pos] };
            visualErrorOffset.x = visualErrorOffset.y = visualErrorOffset.z = 0;
          }
        }
        player.stamina = self.stamina;
        player.crouched = Boolean(self.crouch);
      }

      if (session.isMock) sceneLabel.textContent = 'MOCK01 · ' + self.id + ' · ' + session.currentRoom?.roster.length + ' nhân vật';

      // Countdown audio warning in the final 5 seconds
      const sec = Math.ceil(snapshot.remainingMs / 1000);
      if (snapshot.phase === 'PLAYING' && sec <= 5 && sec > 0 && sec !== lastRemainingSec) {
        lastRemainingSec = sec;
        sound.playCountdownBeep(sec === 1);
      }

      // Update HUD
      hudOverlay.hidden = snapshot.phase === 'LOBBY';
      hudTimer.textContent = formatRemainingTime(snapshot.remainingMs);
      hudPhase.textContent = snapshot.phase;
      hudRole.textContent = self.role === 'POLICE' ? 'CẢNH SÁT' : 'CƯỚP';
      hudRole.style.color = self.role === 'POLICE' ? '#58a6ff' : '#ffa657';
      hudJail.textContent = snapshot.jailId || 'Chưa chọn';
      const robberCount = session.currentRoom?.roster.filter(p => p.role === 'ROBBER').length ?? 0;
      hudAction.textContent = self.state === 'JAILED'
        ? 'Bạn đang bị giam · Chờ đồng đội cứu'
        : snapshot.phase === 'HEAD_START' && self.role === 'POLICE'
        ? '⏳ CẢNH SÁT TẠM ĐỨNG YÊN (10s cướp chạy trốn) · Sẽ xuất kích khi hết đếm ngược!'
        : snapshot.phase === 'PLAYING' && self.role === 'POLICE'
        ? 'Áp sát và nhấn chuột trái để bắt'
        : self.rescueProgressMs > 0
        ? 'Đang cứu ' + Math.round(self.rescueProgressMs / 20) + '%'
        : '';
      hudJailedCount.textContent = `${snapshot.jailedCount} / ${robberCount}`;

      // Stealth & Immunity HUD flags
      hudStealthCard.hidden = !(self.role === 'ROBBER' && self.state === 'HIDDEN');
      if (self.immuneRemainingMs > 0) {
        hudImmuneCard.hidden = false;
        hudImmuneSec.textContent = (self.immuneRemainingMs / 1000).toFixed(1);
      } else {
        hudImmuneCard.hidden = true;
      }

      // Smooth Rescue Progress Fill Bar
      if (self.role === 'ROBBER' && self.rescueProgressMs > 0) {
        rescueBarContainer.hidden = false;
        rescueBarFill.style.width = `${Math.min(100, (self.rescueProgressMs / 2000) * 100)}%`;
      } else {
        rescueBarContainer.hidden = true;
      }

      // Spectator Mode handling when Jailed
      if (self.state === 'JAILED' && self.role === 'ROBBER') {
        const freeTeammates = snapshot.players.filter((p) => p.role === 'ROBBER' && p.state !== 'JAILED');
        if (freeTeammates.length > 0) {
          isSpectating = true;
          spectatorHud.hidden = false;
          const target = freeTeammates[spectatorIndex % freeTeammates.length]!;
          spectatorTargetName.textContent = target.id;
          updateSpectatorModeButton();
        } else {
          isSpectating = false;
          spectatorHud.hidden = true;
        }
      } else {
        isSpectating = false;
        spectatorHud.hidden = true;
      }

      if (!isSpectating && lastSpectatedTargetId) {
        const prevEntity = session.getRemoteEntities().get(lastSpectatedTargetId);
        if (prevEntity) prevEntity.avatar.root.visible = true;
        lastSpectatedTargetId = null;
        hasValidSpectatorCamPos = false;
      }

      // 3D Spatial Audio & Ambient Atmosphere
      if (snapshot.phase === 'PLAYING') {
        sound.startAmbientVillage();
        for (const other of snapshot.players) {
          const isMoving = Math.hypot(other.vel[0], other.vel[2]) > 0.4;
          const isSprinting = Math.hypot(other.vel[0], other.vel[2]) > 4.5;
          if (isMoving && other.grounded && !other.crouch) {
            sound.playRemoteFootstep(
              other.id,
              other.pos,
              player.pos,
              yaw,
              isSprinting,
              Boolean(other.crouch)
            );
          }
        }

        if (self.role === 'ROBBER' && self.state !== 'JAILED') {
          let minPoliceDist = Infinity;
          for (const other of snapshot.players) {
            if (other.role === 'POLICE') {
              const d = Math.hypot(other.pos[0] - player.pos[0], other.pos[2] - player.pos[2]);
              if (d < minPoliceDist) minPoliceDist = d;
            }
          }
          if (minPoliceDist < 8.0) {
            const danger = Math.max(0, Math.min(1, (8.0 - minPoliceDist) / 6.0));
            sound.updateTensionHeartbeat(danger);
          }
        }
      } else {
        sound.stopAmbientVillage();
      }

      debug.dataset.ack = String(self.ackSeq);
      debug.dataset.z = String(self.pos[2]);
    },
    onGameEvent(event: GameEvent) {
      if (event.type === 'CAPTURE') {
        const data = event.data as { policeId: string; robberId: string; jailId: string };
        sound.playCaptureSound();
        flashScreen('flash-capture');
        showToast(`🚨 Cảnh sát đã bắt cướp ${data.robberId}!`);
      } else if (event.type === 'RESCUE') {
        const data = event.data as { rescuerId: string; rescuedId: string };
        sound.playRescueSound();
        flashScreen('flash-rescue');
        showToast(`🔓 Cướp ${data.rescuerId} đã giải cứu đồng đội!`);
      } else if (event.type === 'CAPTURE_MISS') {
        sound.playCaptureMiss();
        showToast('⚠️ Bắt hụt! Đối tượng ở ngoài tầm hoặc góc nhìn.', 1800);
      } else if (event.type === 'GUARD_CHANGED') {
        const data = event.data as { guardId: string | null };
        if (data.guardId) {
          showToast(`🛡️ Cảnh sát ${data.guardId} đang canh gác nhà giam!`);
        }
      } else if (event.type === 'PHASE') {
        const data = event.data as { phase: string; jailId?: string };
        showToast(`⏳ Chuyển sang pha: ${data.phase} ${data.jailId ? `(${data.jailId})` : ''}`);
      }
    },
    onChat(chat: QuickChatMessage) {
      sound.playQuickChatChime();
      const item = document.createElement('div');
      item.className = `quick-chat-item ${chat.role === 'ROBBER' ? 'team-robber' : 'team-police'}`;
      const sender = document.createElement('span');
      sender.className = 'quick-chat-sender';
      sender.textContent = `${chat.role === 'POLICE' ? '👮' : '🥷'} ${chat.senderName}:`;
      const text = document.createElement('span');
      text.textContent = chat.text;
      item.append(sender, text);
      quickChatFeed.append(item);
      quickChatFeed.hidden = false;
      window.setTimeout(() => {
        item.remove();
        if (quickChatFeed.children.length === 0) quickChatFeed.hidden = true;
      }, 4500);
    },
    onPing(ping: TacticalPing) {
      sound.playPingSound();
      spawnTacticalPingRing(ping.pos, ping.role);
      activeMinimapPings.push({ pos: ping.pos, role: ping.role, expireTime: performance.now() + 3000 });
      showToast(`📍 ${ping.role === 'POLICE' ? 'Cảnh sát' : 'Đồng đội'} đã đánh dấu vị trí!`, 1500);
    },
    onPebble(pebble: PebbleEvent) {
      sound.playPebbleThrow();
      window.setTimeout(() => {
        sound.playPebbleHit();
        spawnPebbleImpact(pebble.landingPos);
      }, 350);
      showToast('🪨 Có tiếng sỏi rơi ở gần!', 1200);
    },
  });

  function updateRoomUI(room: RoomState | null) {
    mockDetails.update(room?.roomCode === 'MOCK01' ? room : null);
    const finished = room?.phase === 'RESULT';
    button.hidden = finished;
    if (!finished) {
      resultPanel.hidden = true;
      mvpCardsContainer.hidden = true;
      matchStatsContainer.hidden = true;
      resultShown = '';
    }
    if (!room || room.phase === 'LOBBY' || finished) {
      controls.input.clear();
      hudOverlay.hidden = actionPrompt.hidden = rescueBarContainer.hidden = true;
      hudImmuneCard.hidden = hudStealthCard.hidden = true;
      eventToast.hidden = hitFlash.hidden = true;
      if (document.pointerLockElement) document.exitPointerLock();
      if (!finished) {
        viewSession = '';
        currentRole = null;
        lastRemainingSec = -1;
        world.setServerJail(null);
      }
    }
    if (!room) {
      viewSession = '';
      menuView.hidden = false;
      roomView.hidden = true;
      hudOverlay.hidden = true;
      actionPrompt.hidden = true;
      rescueBarContainer.hidden = true;
      sceneLabel.textContent = 'Máy chủ Authoritative · Chưa vào phòng';
      notice.textContent = 'Multiplayer trực tuyến 30Hz · 2 Cảnh sát vs 4 Cướp';
      world.setServerJail(null);
      button.textContent = 'Vào sân tập 3D';
      void refreshPublicRooms();
      return;
    }

    menuView.hidden = true;
    roomView.hidden = false;
    displayRoomCode.textContent = room.roomCode;
    sceneLabel.textContent = `Phòng ${room.roomCode} · Pha: ${room.phase}`;
    notice.textContent = `Đã kết nối phòng ${room.roomCode} (${room.roster.length}/6 người). Bấm Sẵn sàng để thi đấu.`;

    // Render Roster
    rosterList.replaceChildren();
    const isHost = session.playerId === room.hostId;
    const isCaptain = session.playerId === room.captainId;
    mapVariantContainer.hidden = !isHost || room.phase !== 'LOBBY';

    for (const member of room.roster) {
      const li = document.createElement('li');
      li.className = 'roster-item';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = member.name + (member.id === session.playerId ? ' (Bạn)' : '');
      nameSpan.style.fontWeight = member.id === session.playerId ? '700' : '400';

      const badgeGroup = document.createElement('div');
      badgeGroup.className = 'roster-item-badges';

      if (member.id === room.hostId) {
        const hostBadge = document.createElement('span');
        hostBadge.className = 'badge-host';
        hostBadge.textContent = 'Chủ phòng';
        badgeGroup.append(hostBadge);
      }

      if (member.isCaptain) {
        const capBadge = document.createElement('span');
        capBadge.className = 'badge-host';
        capBadge.style.background = '#2876c9';
        capBadge.textContent = 'Đội trưởng';
        badgeGroup.append(capBadge);
      }

      if (member.isBot) {
        const botBadge = document.createElement('span');
        botBadge.className = 'badge-bot';
        botBadge.textContent = 'Máy';
        badgeGroup.append(botBadge);
      }

      const roleBadge = document.createElement('span');
      roleBadge.className = `role-badge ${member.role === 'POLICE' ? 'role-police' : member.role === 'ROBBER' ? 'role-robber' : 'role-none'}`;
      roleBadge.textContent = member.role === 'POLICE' ? 'Cảnh sát' : member.role === 'ROBBER' ? 'Cướp' : 'Chờ';
      badgeGroup.append(roleBadge);

      const statusSpan = document.createElement('span');
      statusSpan.className = member.ready ? 'status-ready' : 'status-unready';
      statusSpan.textContent = !member.connected ? 'Mất mạng' : member.ready ? '✓ Sẵn sàng' : 'Chưa';
      badgeGroup.append(statusSpan);

      li.append(nameSpan, badgeGroup);
      rosterList.append(li);
    }

    // Role selection buttons state
    rolePickerContainer.hidden = room.phase !== 'LOBBY';
    const myMember = room.roster.find((m) => m.id === session.playerId);
    const myRole = myMember?.role ?? null;
    btnRoleAuto.classList.toggle('active', myRole === null);
    btnRolePolice.classList.toggle('active', myRole === 'POLICE');
    btnRoleRobber.classList.toggle('active', myRole === 'ROBBER');

    // Host room controls (bot add/remove, auto roles)
    hostRoomControls.hidden = !(isHost && room.phase === 'LOBBY');
    if (isHost && room.phase === 'LOBBY') {
      btnAddBot.disabled = room.roster.length >= 6;
      btnRemoveBot.disabled = !room.roster.some((m) => m.isBot);
      btnAutoRoles.disabled = room.roster.length < 2;
    }

    btnToggleReady.hidden = room.phase !== 'LOBBY';
    if (room.phase !== 'LOBBY') notice.textContent = 'Nhấn nút vào sân để điều khiển nhân vật. Esc để xem phòng.';
    // Toggle Ready Button state
    const me = room.roster.find((m) => m.id === session.playerId);
    isReady = Boolean(me?.ready);
    btnToggleReady.textContent = isReady ? 'Hủy sẵn sàng' : 'Sẵn sàng';
    btnToggleReady.className = isReady ? 'btn-unready' : 'btn-ready';

    // Auto-ready player in LOBBY so only host start is needed
    if (room.phase === 'LOBBY' && me && !me.ready) {
      session.toggleReady(true).catch(() => {});
    }

    // Host start button (available in LOBBY when >= 2 players; host can start directly!)
    const canStart = isHost && room.phase === 'LOBBY';
    btnStartGame.hidden = !canStart;
    if (canStart) {
      const canLaunch = room.roster.length >= 2;
      btnStartGame.disabled = !canLaunch;
      btnStartGame.textContent = canLaunch
        ? `🚀 Bắt đầu trận đấu (${room.roster.length} người)`
        : `Chờ thêm người chơi (${room.roster.length}/6)`;
    }

    const roomCapacityLabel = document.getElementById('room-capacity-label');
    if (roomCapacityLabel) {
      roomCapacityLabel.textContent = isHost
        ? (room.roster.length >= 2 ? `Sẵn sàng (${room.roster.length}/6 người)` : 'Cần ít nhất 2 người')
        : 'Chờ chủ phòng bắt đầu';
    }

    // Host rematch button (available in RESULT phase)
    btnRematch.hidden = !(isHost && room.phase === 'RESULT');
    resultWait.hidden = !finished || isHost;
    if (finished) notice.textContent = 'Trận đấu đã kết thúc.';

    // Captain jail selection (available in JAIL_SELECTION phase)
    const showJailPicker = isCaptain && room.phase === 'JAIL_SELECTION';
    captainJailPicker.hidden = !showJailPicker;

    // Enter 3D button label
    if (room.phase === 'HEAD_START' || room.phase === 'PLAYING') {
      button.textContent = 'Vào trận đấu (Khóa chuột)';
      hudOverlay.hidden = false;
    } else {
      button.textContent = 'Vào sân thử 3D';
    }
  }

  // Button Listeners
  btnCreateRoom.addEventListener('click', async () => {
    const name = playerNameInput.value.trim() || 'Cảnh sát viên';
    status.textContent = 'Đang tạo phòng mới trên máy chủ Authoritative…';
    btnCreateRoom.disabled = true;

    try {
      const res = await session.createRoom(name);
      btnCreateRoom.disabled = false;
      if (!res.ok) {
        status.textContent = `Không tạo được phòng: ${res.message || res.code}`;
        status.style.color = '#963624';
        return;
      }
      isOffline = false;
      showToast(`Tạo phòng thành công! Mã phòng: ${res.data?.roomCode}`);
    } catch (err) {
      btnCreateRoom.disabled = false;
      status.textContent = `Lỗi kết nối: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  btnJoinRoom.addEventListener('click', async () => {
    const code = joinRoomCodeInput.value.trim().toUpperCase();
    const name = playerNameInput.value.trim() || 'Thành viên';
    if (!code || code.length !== 6) {
      status.textContent = 'Mã phòng phải gồm 6 ký tự.';
      status.style.color = '#963624';
      return;
    }

    status.textContent = `Đang kết nối phòng ${code}…`;
    btnJoinRoom.disabled = true;

    try {
      const res = await session.joinRoom(code, name);
      btnJoinRoom.disabled = false;
      if (!res.ok) {
        status.textContent = `Không thể vào phòng ${code}: ${res.message || res.code}`;
        status.style.color = '#963624';
        return;
      }
      isOffline = false;
      showToast(`Đã tham gia phòng ${code}!`);
    } catch (err) {
      btnJoinRoom.disabled = false;
      status.textContent = `Lỗi kết nối: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  btnCopyCode.addEventListener('click', async () => {
    const code = displayRoomCode.textContent;
    if (code && code !== '------') {
      try {
        await navigator.clipboard.writeText(code);
        showToast(`Đã sao chép mã phòng: ${code}`);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(displayRoomCode);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        showToast(`Mã phòng ${code}. Nhấn Ctrl+C hoặc ⌘C để sao chép.`);
      }
    }
  });

  btnToggleReady.addEventListener('click', async () => {
    btnToggleReady.disabled = true;
    try {
      const res = await session.toggleReady(!isReady);
      btnToggleReady.disabled = false;
      if (!res.ok) {
        status.textContent = `Lỗi cập nhật sẵn sàng: ${res.message || res.code}`;
      }
    } catch (err) {
      btnToggleReady.disabled = false;
      status.textContent = `Lỗi: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  btnStartGame.addEventListener('click', async () => {
    btnStartGame.disabled = true;
    try {
      if (!isReady) {
        await session.toggleReady(true);
      }
      const res = await session.startMatch();
      btnStartGame.disabled = false;
      if (!res.ok) {
        status.textContent = `Không thể bắt đầu: ${res.message || res.code}`;
      } else {
        showToast('Trận đấu bắt đầu!');
      }
    } catch (err) {
      btnStartGame.disabled = false;
      status.textContent = `Lỗi: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  btnRematch.addEventListener('click', async () => {
    btnRematch.disabled = true;
    try {
      const res = await session.restartMatch();
      btnRematch.disabled = false;
      if (!res.ok) {
        status.textContent = `Không thể rematch: ${res.message || res.code}`;
      }
    } catch (err) {
      btnRematch.disabled = false;
      status.textContent = `Lỗi: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  btnLeaveRoom.addEventListener('click', () => {
    session.leaveRoom();
    showToast('Đã rời phòng');
  });

  // Role selector listeners
  btnRoleAuto.addEventListener('click', async () => {
    try {
      await session.setRole(null);
    } catch (err) {
      showToast(`Lỗi chọn vai: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  btnRolePolice.addEventListener('click', async () => {
    try {
      await session.setRole('POLICE');
    } catch (err) {
      showToast(`Lỗi chọn vai: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  btnRoleRobber.addEventListener('click', async () => {
    try {
      await session.setRole('ROBBER');
    } catch (err) {
      showToast(`Lỗi chọn vai: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Host bot control listeners
  btnAddBot.addEventListener('click', async () => {
    btnAddBot.disabled = true;
    try {
      const res = await session.addBot();
      btnAddBot.disabled = false;
      if (!res.ok) {
        showToast(`Không thể thêm máy: ${res.message || res.code}`);
      } else {
        showToast('🤖 Đã thêm máy vào phòng!');
      }
    } catch (err) {
      btnAddBot.disabled = false;
      showToast(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  btnRemoveBot.addEventListener('click', async () => {
    btnRemoveBot.disabled = true;
    try {
      const res = await session.removeBot();
      btnRemoveBot.disabled = false;
      if (!res.ok) {
        showToast(`Không thể bớt máy: ${res.message || res.code}`);
      } else {
        showToast('Đã bớt máy khỏi phòng');
      }
    } catch (err) {
      btnRemoveBot.disabled = false;
      showToast(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  btnAutoRoles.addEventListener('click', async () => {
    btnAutoRoles.disabled = true;
    try {
      const res = await session.autoRoles();
      btnAutoRoles.disabled = false;
      if (!res.ok) {
        showToast(`Không thể chia vai: ${res.message || res.code}`);
      } else {
        showToast('🎲 Đã tự động chia vai cho toàn phòng!');
      }
    } catch (err) {
      btnAutoRoles.disabled = false;
      showToast(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Captain Jail Picker
  captainJailPicker.querySelectorAll<HTMLButtonElement>('.jail-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const jailId = btn.dataset.jail;
      if (!jailId) return;
      try {
        const res = await session.selectJail(jailId);
        if (res.ok) {
          showToast(`Đã chọn nhà giam ${jailId}!`);
        } else {
          status.textContent = `Lỗi chọn nhà giam: ${res.message || res.code}`;
        }
      } catch (err) {
        status.textContent = `Lỗi: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
  });

  // Quick Mock Mode
  btnMockMode.addEventListener('click', () => {
    isOffline = false;
    const query = new URLSearchParams(location.search);
    session.connectMock(import.meta.env.DEV && query.get('spawn') === 'near' ? 'near' : undefined);
    menuView.hidden = true;
    roomView.hidden = true;
    sceneLabel.textContent = 'Phòng thử nghiệm nhanh · MOCK01';
    notice.textContent = 'Đang kết nối phòng thử nghiệm MOCK01…';
    status.textContent = 'Đang nhận snapshot từ MOCK01. Nhấn Vào sân tập để điều khiển.';
    showToast('Đã nối vào phòng thử MOCK01!');
  });

  // Offline Mode
  btnOfflineMode.addEventListener('click', () => {
    isOffline = true;
    session.leaveRoom();
    menuView.hidden = false;
    roomView.hidden = true;
    hudOverlay.hidden = true;
    actionPrompt.hidden = true;
    rescueBarContainer.hidden = true;
    sceneLabel.textContent = 'Sân tập offline';
    notice.textContent = 'Chế độ luyện tập offline · WASD di chuyển, C cúi, Shift chạy';
    status.textContent = 'Sân tập offline sẵn sàng. Nhấn Vào sân tập để khóa chuột.';
    void controls.lock();
  });

  // Public Room Browser
  async function refreshPublicRooms() {
    publicRoomsList.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'room-empty-note';
    loading.textContent = 'Đang làm mới danh sách...';
    publicRoomsList.append(loading);

    try {
      const rooms = await session.listRooms();
      publicRoomsList.replaceChildren();
      if (!rooms || rooms.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'room-empty-note';
        empty.textContent = 'Chưa có phòng nào đang mở. Hãy tạo phòng mới!';
        publicRoomsList.append(empty);
        return;
      }

      for (const r of rooms) {
        const item = document.createElement('div');
        item.className = 'public-room-item';
        const info = document.createElement('div');
        info.innerHTML = `<span class="room-code-tag">${r.roomCode}</span> · <strong>${r.hostName}</strong> (${r.playerCount}/${r.maxPlayers})`;

        const btnJoin = document.createElement('button');
        btnJoin.className = 'btn-tool';
        btnJoin.style.fontSize = '11px';
        btnJoin.style.padding = '3px 8px';
        btnJoin.textContent = r.phase === 'LOBBY' ? 'Vào phòng' : 'Đang chơi';
        btnJoin.disabled = r.phase !== 'LOBBY' || r.playerCount >= r.maxPlayers;
        btnJoin.addEventListener('click', () => {
          joinRoomCodeInput.value = r.roomCode;
          btnJoinRoom.click();
        });

        item.append(info, btnJoin);
        publicRoomsList.append(item);
      }
    } catch {
      publicRoomsList.replaceChildren();
      const errNote = document.createElement('div');
      errNote.className = 'room-empty-note';
      errNote.textContent = 'Chưa có phòng trực tuyến khả dụng.';
      publicRoomsList.append(errNote);
    }
  }
  btnRefreshRooms.addEventListener('click', () => { void refreshPublicRooms(); });

  // Interactive 1-Player Tutorial Mode
  btnTutorial.addEventListener('click', () => {
    isOffline = true;
    isTutorial = true;
    tutorialStep = 1;
    tutorialTimer = 0;
    session.leaveRoom();
    currentRole = 'ROBBER';
    player = initialMovement([-15, 0, 8]);
    previous = { ...player, pos: [...player.pos] };
    yaw = 0;
    pitch = 0;
    menuView.hidden = true;
    roomView.hidden = true;
    hudOverlay.hidden = false;
    tutorialOverlay.hidden = false;
    tutorialStepTag.textContent = 'Bước 1/3';
    tutorialTitle.textContent = 'Vượt chướng ngại vật';
    tutorialDesc.textContent = 'Dùng phím W, A, S, D di chuyển, giữ Shift chạy nhanh và bấm Space để nhảy qua hàng rào gỗ.';
    tutorialProgressFill.style.width = '33%';
    void controls.lock();
  });

  btnExitTutorial.addEventListener('click', () => {
    isTutorial = false;
    tutorialOverlay.hidden = true;
    hudOverlay.hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    menuView.hidden = false;
    status.textContent = 'Đã thoát chế độ hướng dẫn.';
  });

  // Folk Costume Customization Listeners
  selectCosmeticHat.addEventListener('change', () => {
    currentHat = selectCosmeticHat.value as HatCosmetic;
    const cosmetic: CosmeticPreferences = { hat: currentHat };
    if (currentShirtColor) cosmetic.shirtColor = currentShirtColor;
    void session.setCosmetic(cosmetic);
  });

  document.querySelectorAll<HTMLButtonElement>('.shirt-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.shirt-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      currentShirtColor = swatch.dataset.color || '';
      viewmodel.setShirtColor(currentShirtColor || undefined);
      const cosmetic: CosmeticPreferences = { hat: currentHat };
      if (currentShirtColor) cosmetic.shirtColor = currentShirtColor;
      void session.setCosmetic(cosmetic);
    });
  });

  // Map Variant Selection
  selectMapVariant.addEventListener('change', () => {
    showToast(`Bản đồ đã chọn: ${selectMapVariant.options[selectMapVariant.selectedIndex]?.text}`);
  });

  // Weather / Atmosphere Setup
  const savedWeather = (localStorage.getItem('folk_tag_weather') as AtmospherePreset) || 'midday';
  settingWeather.value = savedWeather;
  setAtmosphere(savedWeather, scene, sun, hemi);

  settingWeather.addEventListener('change', () => {
    const val = settingWeather.value as AtmospherePreset;
    setAtmosphere(val, scene, sun, hemi);
    localStorage.setItem('folk_tag_weather', val);
  });

  // Controls setup
  const controls = createControls({
    canvas: renderer.domElement,
    camera,
    onToggleHelp() {
      toggleHelp();
    },
    onLockChange(locked) {
      if (locked && !playing) {
        surveyPosition.copy(camera.position);
        surveyRotation.copy(camera.rotation);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
      } else if (!locked && playing) {
        if (!isOffline) {
          session.send(controls.input.peek(), camera.rotation.y, camera.rotation.x);
        }
        pitch = camera.rotation.x;
        yaw = camera.rotation.y;
        camera.position.copy(surveyPosition);
        camera.rotation.copy(surveyRotation);
      }
      playing = locked;
      viewmodel.setVisible(locked && !isSpectating);
      if (locked) {
        prevCameraYaw = camera.rotation.y;
        prevCameraPitch = camera.rotation.x;
      }
      renderer.shadowMap.needsUpdate = true;
      previous = player;
      lastFrame = undefined;
      accumulated = 0;
      document.body.classList.toggle('looking', locked);
      crosshair.hidden = !locked;
      if (!locked) {
        actionPrompt.hidden = true;
        rescueBarContainer.hidden = true;
      }
      status.textContent = locked ? 'Chuột đã khóa. Nhấn Esc để thả / xem Menu.' : 'Chuột đã nhả. Nhấn Vào sân tập để điều khiển.';
      if (!locked && session.currentRoom?.phase === 'RESULT') {
        status.textContent = '';
        if (!resultPanel.hidden) resultTitle.focus({ preventScroll: true });
      } else if (!locked) button.focus({ preventScroll: true });
    },
    onError(message) { status.textContent = message; },
  });

  // Touch Controller Initialization for Mobile / Tablet Devices
  const touchController = new TouchController({
    onMovement(moveX, moveZ) {
      if (moveX === 1) controls.pressVirtual('KeyD');
      else if (moveX === -1) controls.pressVirtual('KeyA');
      else { controls.releaseVirtual('KeyD'); controls.releaseVirtual('KeyA'); }

      if (moveZ === 1) controls.pressVirtual('KeyW');
      else if (moveZ === -1) controls.pressVirtual('KeyS');
      else { controls.releaseVirtual('KeyW'); controls.releaseVirtual('KeyS'); }
    },
    onLook(dx, dy) {
      controls.addLookDelta(dx, dy);
    },
    onSprint(sprinting) {
      if (sprinting) controls.pressVirtual('ShiftLeft');
      else controls.releaseVirtual('ShiftLeft');
    },
    onCrouch(crouched) {
      if (crouched) controls.pressVirtual('KeyC');
      else controls.releaseVirtual('KeyC');
    },
    onJump() {
      controls.pressVirtual('Space');
      setTimeout(() => controls.releaseVirtual('Space'), 120);
    },
    onAction(held) {
      if (currentRole === 'POLICE') {
        if (held) controls.triggerCapture();
      } else {
        if (held) controls.pressVirtual('KeyE');
        else controls.releaseVirtual('KeyE');
      }
    },
  });
  touchController.mount(document.body);

  // Settings Modal Controls
  function toggleSettings(open?: boolean) {
    const shouldOpen = open !== undefined ? open : settingsModal.hidden;
    settingsModal.hidden = !shouldOpen;
    if (shouldOpen && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
  btnToggleSettings.addEventListener('click', () => toggleSettings(true));
  btnCloseSettings.addEventListener('click', () => toggleSettings(false));

  const savedSens = parseFloat(localStorage.getItem('folk_tag_sens') || '1.0');
  if (savedSens && !isNaN(savedSens)) {
    settingMouseSens.value = savedSens.toString();
    valMouseSens.textContent = savedSens.toFixed(1);
    controls.setSensitivity(savedSens);
  }
  settingMouseSens.addEventListener('input', () => {
    const val = parseFloat(settingMouseSens.value);
    valMouseSens.textContent = val.toFixed(1);
    controls.setSensitivity(val);
    localStorage.setItem('folk_tag_sens', val.toString());
  });

  const savedFov = parseInt(localStorage.getItem('folk_tag_fov') || '75', 10);
  if (savedFov && !isNaN(savedFov)) {
    settingFov.value = savedFov.toString();
    valFov.textContent = savedFov.toString();
    camera.fov = savedFov;
    currentBaseFov = savedFov;
    camera.updateProjectionMatrix();
  }
  settingFov.addEventListener('input', () => {
    const val = parseInt(settingFov.value, 10);
    valFov.textContent = val.toString();
    camera.fov = val;
    currentBaseFov = val;
    camera.updateProjectionMatrix();
    localStorage.setItem('folk_tag_fov', val.toString());
  });

  const savedVol = parseFloat(localStorage.getItem('folk_tag_vol') || '1.0');
  if (!isNaN(savedVol)) {
    settingVolume.value = Math.round(savedVol * 100).toString();
    valVolume.textContent = Math.round(savedVol * 100).toString();
    sound.setMasterVolume(savedVol);
  }
  settingVolume.addEventListener('input', () => {
    const val = parseInt(settingVolume.value, 10);
    valVolume.textContent = val.toString();
    sound.setMasterVolume(val / 100);
    localStorage.setItem('folk_tag_vol', (val / 100).toString());
  });

  const savedTouch = localStorage.getItem('folk_tag_touch');
  if (savedTouch === '1') {
    settingTouchToggle.checked = true;
    touchController.setVisible(true);
  } else if (savedTouch === '0') {
    settingTouchToggle.checked = false;
    touchController.setVisible(false);
  } else {
    settingTouchToggle.checked = touchController.enabled;
  }
  settingTouchToggle.addEventListener('change', () => {
    touchController.setVisible(settingTouchToggle.checked);
    localStorage.setItem('folk_tag_touch', settingTouchToggle.checked ? '1' : '0');
  });

  // Spectator, Quick Chat & Tactical Interaction
  window.addEventListener('keydown', (e) => {
    if (isSpectating) {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        spectatorIndex += e.code === 'ArrowRight' ? 1 : -1;
        if (spectatorIndex < 0) spectatorIndex = 999;
        hasValidSpectatorCamPos = false;
        return;
      }
      if (e.code === 'KeyV') {
        e.preventDefault();
        spectatorMode = spectatorMode === 'THIRD_PERSON' ? 'FIRST_PERSON' : 'THIRD_PERSON';
        updateSpectatorModeButton();
        hasValidSpectatorCamPos = false;
        return;
      }
    }

    if (!playing) return;

    // Quick Radio Chat (hotkeys 1, 2, 3, 4)
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
      e.preventDefault();
      const index = parseInt(e.code.replace('Digit', ''), 10);
      const presetsPolice = [
        'Cảnh sát đây, tập trung vây bắt!',
        'Phát hiện cướp gần đống rơm!',
        'Bảo vệ nhà giam cẩn thận!',
        'Đã bắt được 1 tên cướp!',
      ];
      const presetsRobber = [
        'Cảnh sát đang tới gần, tản ra mau!',
        'Tôi chuẩn bị cứu bốt, yểm trợ!',
        'Núp kỹ trong đống rơm đi!',
        'Đã cứu thành công đồng đội!',
      ];
      const text = (currentRole === 'POLICE' ? presetsPolice : presetsRobber)[index - 1]!;
      session.sendChat(text, true);
      sound.playQuickChatChime();
      showToast(`📢 Bạn: "${text}"`, 1800);
      return;
    }

    // Tactical Ping (hotkey Q)
    if (e.code === 'KeyQ') {
      e.preventDefault();
      const fX = -Math.sin(camera.rotation.y);
      const fZ = -Math.cos(camera.rotation.y);
      const pingPos: Vec3 = [
        player.pos[0] + fX * 12,
        0.05,
        player.pos[2] + fZ * 12,
      ];
      session.sendPing(pingPos);
      sound.playPingSound();
      spawnTacticalPingRing(pingPos, currentRole || 'ROBBER');
      activeMinimapPings.push({ pos: pingPos, role: currentRole || 'ROBBER', expireTime: performance.now() + 3000 });
      showToast('📍 Đã đánh dấu vị trí chiến thuật!', 1500);
      return;
    }

    // Distraction Pebble (hotkey F)
    if (e.code === 'KeyF' && currentRole === 'ROBBER' && latestSnapshot?.self?.state !== 'JAILED') {
      e.preventDefault();
      const fX = -Math.sin(camera.rotation.y);
      const fZ = -Math.cos(camera.rotation.y);
      const landingPos: Vec3 = [
        player.pos[0] + fX * 10,
        0.05,
        player.pos[2] + fZ * 10,
      ];
      session.sendPebble(player.pos, landingPos);
      sound.playPebbleThrow();
      window.setTimeout(() => {
        sound.playPebbleHit();
        spawnPebbleImpact(landingPos);
      }, 350);
      showToast('🪨 Đã ném sỏi đánh lạc hướng cảnh sát!', 1600);
      return;
    }
  });

  // Renderer canvas mouse clicks for Ping (Middle mouse) and Pebble (Right click)
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!playing) return;
    if (e.button === 1) { // Middle click -> Ping
      e.preventDefault();
      const fX = -Math.sin(camera.rotation.y);
      const fZ = -Math.cos(camera.rotation.y);
      const pingPos: Vec3 = [
        player.pos[0] + fX * 12,
        0.05,
        player.pos[2] + fZ * 12,
      ];
      session.sendPing(pingPos);
      sound.playPingSound();
      spawnTacticalPingRing(pingPos, currentRole || 'ROBBER');
      activeMinimapPings.push({ pos: pingPos, role: currentRole || 'ROBBER', expireTime: performance.now() + 3000 });
    } else if (e.button === 2 && currentRole === 'ROBBER' && latestSnapshot?.self?.state !== 'JAILED') { // Right click -> Pebble
      e.preventDefault();
      const fX = -Math.sin(camera.rotation.y);
      const fZ = -Math.cos(camera.rotation.y);
      const landingPos: Vec3 = [
        player.pos[0] + fX * 10,
        0.05,
        player.pos[2] + fZ * 10,
      ];
      session.sendPebble(player.pos, landingPos);
      sound.playPebbleThrow();
      window.setTimeout(() => {
        sound.playPebbleHit();
        spawnPebbleImpact(landingPos);
      }, 350);
    }
  });
  btnSpectatorMode.addEventListener('click', (e) => {
    e.stopPropagation();
    spectatorMode = spectatorMode === 'THIRD_PERSON' ? 'FIRST_PERSON' : 'THIRD_PERSON';
    updateSpectatorModeButton();
    hasValidSpectatorCamPos = false;
  });

  spectatorHud.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#btn-spectator-mode')) return;
    spectatorIndex++;
    hasValidSpectatorCamPos = false;
  });

  let disposed = false;
  let removePreview: (() => void) | undefined;
  if (import.meta.env.DEV) {
    void import('./world/mount-preview').then(({ mountPreview }) => {
      if (!disposed) removePreview = mountPreview(world, camera, menuView);
    });
  }
  container.setAttribute('aria-busy', 'true');
  void loadVillageModels(world.village, world.jailModel, () => disposed).finally(() => {
    if (!disposed) {
      renderer.shadowMap.needsUpdate = true;
      container.setAttribute('aria-busy', 'false');
    }
  });

  const enter = () => { void controls.lock(); };
  button.addEventListener('click', enter);

  const resize = () => resizeScene(renderer, camera, container.clientWidth, container.clientHeight);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  if (import.meta.env.DEV) debug.hidden = false;

  const tickMs = 1000 / movementRules.tickHz;
  const eyeHeight = (crouched: boolean) => (crouched ? movementRules.crouchEyeHeight : movementRules.eyeHeight);

  // Page Visibility API: Stop rendering & reset timers when tab is hidden (drops CPU to 0%)
  let isTabHidden = false;
  document.addEventListener('visibilitychange', () => {
    isTabHidden = document.hidden;
    if (!isTabHidden) {
      lastFrame = undefined;
      accumulated = 0;
      renderer.shadowMap.needsUpdate = true;
    }
  });

  let lastMenuRender = 0;
  let lastShadowUpdate = 0;
  let lastDebugUpdate = 0;

  // Authoritative Render Loop with CPU throttling and anti-death-spiral guards
  renderer.setAnimationLoop((time) => {
    if (isTabHidden || document.hidden) return;

    if (!playing) {
      // Throttle idle lobby/menu render to 30 FPS to save 60%+ CPU when idle
      if (time - lastMenuRender < 32) return;
      lastMenuRender = time;
    } else {
      // Throttle shadow map computation to 30Hz during gameplay (saves 50% shadow pass overhead)
      if (time - lastShadowUpdate >= 33) {
        lastShadowUpdate = time;
        renderer.shadowMap.needsUpdate = true;
      }
    }

    if (playing) {
      const frameMs = Math.max(0, time - (lastFrame ?? time - 1000 / 60));
      controls.updateLook();
      accumulated = Math.min(accumulated + (lastFrame === undefined ? 0 : frameMs), tickMs * movementRules.maxCatchUpTicks);
      lastFrame = time;

      let steps = 0;
      while (accumulated >= tickMs && steps < 3) {
        previous = { ...player, pos: [player.pos[0], player.pos[1], player.pos[2]] };
        const input = controls.input.consume();

        // Immediate Client-Side Prediction: Step physics locally at 30Hz!
        const role = currentRole || 'ROBBER';
        const isJailed = latestSnapshot?.self?.state === 'JAILED';
        const isPoliceFrozen = latestSnapshot?.phase === 'HEAD_START' && currentRole === 'POLICE';

        if (isPoliceFrozen && (input.moveX !== 0 || input.moveZ !== 0 || input.jumpPressed)) {
          const now = performance.now();
          if (now - lastFrozenNoticeTime > 3500) {
            lastFrozenNoticeTime = now;
            showToast('⏳ Bạn là Cảnh sát: Đang trong 10s Head Start cướp chạy trốn, hãy đợi đếm ngược kết thúc!');
          }
        }

        const currentYaw = camera.rotation.y;
        if (!isJailed && !isPoliceFrozen) {
          player = stepMovement(player, { ...input, yaw: currentYaw }, role, villageMap);
        }

        if (!isOffline) {
          // Stream input frame to Authoritative Server at 30Hz & record prediction history
          const seq = session.send(input, currentYaw, camera.rotation.x);
          if (seq > 0 && !isJailed && !isPoliceFrozen) {
            predictionHistory.push({
              seq,
              input,
              yaw: currentYaw,
              predictedPos: [...player.pos],
              verticalSpeed: player.verticalSpeed,
              grounded: player.grounded,
            });
            if (predictionHistory.length > 60) predictionHistory.shift();
          }
        }

        // Procedural footstep audio when moving
        if (input.moveX !== 0 || input.moveZ !== 0) {
          sound.playFootstep(input.sprint, input.crouch || player.crouched);
        }

        // Capture action visual & sound feedback on client click
        if (input.capturePressed && currentRole === 'POLICE') {
          const now = performance.now();
          if (now - lastCaptureAttemptTime >= 1100) {
            lastCaptureAttemptTime = now;
            sound.playCaptureSwing();
            crosshair.classList.remove('swing');
            void crosshair.offsetWidth; // trigger reflow for animation
            crosshair.classList.add('swing');
            viewmodel.triggerCapture();
          }
        }

        accumulated -= tickMs;
        steps++;
      }

      if (accumulated >= tickMs) {
        accumulated = 0; // Discard excess time to prevent catch-up spiral
      }

      // Smooth exponential decay of reconciliation offset (eliminates any micro-pop)
      const decay = Math.exp(-22 * (frameMs / 1000));
      visualErrorOffset.x *= decay;
      visualErrorOffset.y *= decay;
      visualErrorOffset.z *= decay;

      const blend = accumulated / tickMs;
      const lerp = (from: number, to: number) => from + (to - from) * blend;

      // N04: Interpolate all remote players smoothly at 60 FPS before computing camera position
      session.updateRemoteInterpolation(frameMs / 1000);

      const freeTeammates = latestSnapshot?.players.filter((p) => p.role === 'ROBBER' && p.state !== 'JAILED') || [];
      const spectateTarget = (isSpectating && freeTeammates.length > 0)
        ? freeTeammates[spectatorIndex % freeTeammates.length]
        : null;

      if (spectateTarget) {
        viewmodel.setVisible(false);
        const remoteEntity = session.getRemoteEntities().get(spectateTarget.id);
        const targetPos = remoteEntity
          ? remoteEntity.currentPos
          : new Vector3(spectateTarget.pos[0], spectateTarget.pos[1], spectateTarget.pos[2]);
        const targetYaw = remoteEntity ? remoteEntity.currentYaw : spectateTarget.yaw;
        const targetCrouch = remoteEntity ? remoteEntity.crouch : Boolean(spectateTarget.crouch);

        // If target changed, restore previous target's avatar visibility
        if (lastSpectatedTargetId && lastSpectatedTargetId !== spectateTarget.id) {
          const prevEntity = session.getRemoteEntities().get(lastSpectatedTargetId);
          if (prevEntity) prevEntity.avatar.root.visible = true;
          hasValidSpectatorCamPos = false;
        }

        if (spectatorMode === 'THIRD_PERSON') {
          if (remoteEntity) remoteEntity.avatar.root.visible = true;
          lastSpectatedTargetId = null;

          const camDist = 2.4;
          const camHeight = targetCrouch ? 1.05 : 1.45;
          const lookHeight = targetCrouch ? 0.85 : 1.25;

          const desiredX = targetPos.x + Math.sin(targetYaw) * camDist;
          const desiredY = Math.max(0.4, targetPos.y + camHeight);
          const desiredZ = targetPos.z + Math.cos(targetYaw) * camDist;

          const clampedX = Math.max(-38.5, Math.min(38.5, desiredX));
          const clampedZ = Math.max(-38.5, Math.min(38.5, desiredZ));

          const camLerp = 1 - Math.exp(-12 * (frameMs / 1000));
          if (!hasValidSpectatorCamPos) {
            spectatorCamPos.set(clampedX, desiredY, clampedZ);
            hasValidSpectatorCamPos = true;
          } else {
            spectatorCamPos.lerp(new Vector3(clampedX, desiredY, clampedZ), camLerp);
          }
          camera.position.copy(spectatorCamPos);
          camera.lookAt(targetPos.x, targetPos.y + lookHeight, targetPos.z);
        } else {
          // First-person POV: Hide avatar to prevent head clipping!
          if (remoteEntity) remoteEntity.avatar.root.visible = false;
          lastSpectatedTargetId = spectateTarget.id;

          const targetEyeY = targetPos.y + eyeHeight(targetCrouch);
          const camLerp = 1 - Math.exp(-22 * (frameMs / 1000));
          if (!hasValidSpectatorCamPos) {
            spectatorCamPos.set(targetPos.x, targetEyeY, targetPos.z);
            spectatorCamYaw = targetYaw;
            hasValidSpectatorCamPos = true;
          } else {
            spectatorCamPos.lerp(new Vector3(targetPos.x, targetEyeY, targetPos.z), camLerp);
          }
          camera.position.copy(spectatorCamPos);

          let diff = (targetYaw - spectatorCamYaw + Math.PI) % (Math.PI * 2) - Math.PI;
          if (diff < -Math.PI) diff += Math.PI * 2;
          spectatorCamYaw += diff * (1 - Math.exp(-18 * (frameMs / 1000)));
          camera.rotation.set(0, spectatorCamYaw, 0, 'YXZ');
        }
      } else {
        if (lastSpectatedTargetId) {
          const prevEntity = session.getRemoteEntities().get(lastSpectatedTargetId);
          if (prevEntity) prevEntity.avatar.root.visible = true;
          lastSpectatedTargetId = null;
        }
        hasValidSpectatorCamPos = false;
        viewmodel.setVisible(true);

        const baseCamX = lerp(previous.pos[0], player.pos[0]) + visualErrorOffset.x;
        const baseCamY = lerp(previous.pos[1] + eyeHeight(previous.crouched), player.pos[1] + eyeHeight(player.crouched)) + visualErrorOffset.y;
        const baseCamZ = lerp(previous.pos[2], player.pos[2]) + visualErrorOffset.z;

        const horizDist = Math.hypot(player.pos[0] - previous.pos[0], player.pos[2] - previous.pos[2]);
        const speed = horizDist / (tickMs / 1000);

        const deltaYaw = camera.rotation.y - prevCameraYaw;
        const deltaPitch = camera.rotation.x - prevCameraPitch;
        prevCameraYaw = camera.rotation.y;
        prevCameraPitch = camera.rotation.x;

        const peekInput = controls.input.peek();
        const distToJail = Math.hypot(
          villageMap.jails[0]!.center[0] - player.pos[0],
          villageMap.jails[0]!.center[2] - player.pos[2]
        );
        const isRescuing = currentRole === 'ROBBER' && peekInput.rescueHeld && distToJail <= 4.0;

        const motion = viewmodel.update({
          dtSeconds: frameMs / 1000,
          speed,
          sprint: peekInput.sprint && (peekInput.moveX !== 0 || peekInput.moveZ !== 0),
          crouch: player.crouched,
          grounded: player.grounded,
          verticalSpeed: player.verticalSpeed,
          deltaYaw,
          deltaPitch,
          strafeInput: peekInput.moveX,
          isRescuing,
        });

        const currentYaw = camera.rotation.y;
        camera.position.set(
          baseCamX + motion.bobX * Math.cos(currentYaw),
          baseCamY + motion.bobY + motion.landingDip,
          baseCamZ + motion.bobX * (-Math.sin(currentYaw))
        );
        camera.rotation.set(camera.rotation.x, camera.rotation.y, motion.roll, 'YXZ');

        // Dynamic sprint FOV kick
        const isSprinting = peekInput.sprint && (peekInput.moveX !== 0 || peekInput.moveZ !== 0);
        const targetFov = currentBaseFov + (isSprinting ? 5.0 : 0) + (player.crouched ? -2.0 : 0);
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-8 * (frameMs / 1000)));
        camera.updateProjectionMatrix();
      }

      const staminaVal = Math.round(player.stamina);
      if (staminaVal !== lastStaminaVal) {
        lastStaminaVal = staminaVal;
        stamina.textContent = `${staminaVal}/${movementRules.maxStamina}`;
        const staminaBar = document.getElementById('hud-stamina-bar');
        if (staminaBar) {
          staminaBar.style.width = `${Math.min(100, Math.max(0, (staminaVal / movementRules.maxStamina) * 100))}%`;
        }
      }

      // Gentle cloud drift across the sky
      const cloudsCluster = scene.getObjectByName('clouds-cluster');
      if (cloudsCluster) {
        cloudsCluster.position.x += (frameMs / 1000) * 0.4;
        if (cloudsCluster.position.x > 80) {
          cloudsCluster.position.x -= 160;
        }
      }

      // T03: Update Compass, Minimap, and Aim Interaction (throttled to 30Hz)
      updateCompass(camera.rotation.y, player.pos, activeJailId, time);
      renderMinimap(player.pos, camera.rotation.y, activeJailId, time);
      checkAimInteraction(latestSnapshot, camera.rotation.y, time);

      // Update and fade 3D tactical ping rings
      for (let i = activePingRings.length - 1; i >= 0; i--) {
        const pingRing = activePingRings[i]!;
        pingRing.scale += 0.012;
        pingRing.opacity *= 0.95;
        pingRing.mesh.scale.set(pingRing.scale, pingRing.scale, 1);
        (pingRing.mesh.material as MeshBasicMaterial).opacity = pingRing.opacity;
        if (pingRing.opacity <= 0.04) {
          scene.remove(pingRing.mesh);
          pingRing.mesh.geometry.dispose();
          (pingRing.mesh.material as MeshBasicMaterial).dispose();
          activePingRings.splice(i, 1);
        }
      }

      // Interactive Tutorial step progression
      if (isTutorial) {
        if (tutorialStep === 1) {
          tutorialStepTag.textContent = 'Bước 1/3';
          tutorialTitle.textContent = 'Vượt chướng ngại vật';
          tutorialDesc.textContent = 'Dùng WASD di chuyển, giữ Shift chạy nhanh và bấm Space để nhảy qua hàng rào gỗ.';
          tutorialProgressFill.style.width = '33%';
          if (player.pos[2] < 0.0) {
            tutorialStep = 2;
            sound.playRescueSound();
            showToast('🎉 Xuất sắc! Bạn đã vượt qua hàng rào gỗ.', 2500);
          }
        } else if (tutorialStep === 2) {
          tutorialStepTag.textContent = 'Bước 2/3';
          tutorialTitle.textContent = 'Ẩn nấp rơm rạ (Tàng hình)';
          tutorialDesc.textContent = 'Chạy đến đống rơm gần đó và giữ phím C để cúi người tàng hình.';
          tutorialProgressFill.style.width = '66%';
          if (player.crouched) {
            tutorialTimer += 1;
            if (tutorialTimer >= 45) { // 1.5s
              tutorialStep = 3;
              tutorialTimer = 0;
              sound.playRescueSound();
              showToast('🌾 Đã tàng hình thành công! Cảnh sát ngoài 2m sẽ không thể nhìn thấy bạn.', 3000);
            }
          } else {
            tutorialTimer = 0;
          }
        } else if (tutorialStep === 3) {
          tutorialStepTag.textContent = 'Bước 3/3';
          tutorialTitle.textContent = 'Giải cứu đồng đội';
          tutorialDesc.textContent = 'Tiến lại gần nhà giam J1 trung tâm và giữ phím E trong 2 giây để bẻ khóa cứu đồng đội!';
          tutorialProgressFill.style.width = '90%';
          const distToJail = Math.hypot(villageMap.jails[0]!.center[0] - player.pos[0], villageMap.jails[0]!.center[2] - player.pos[2]);
          if (distToJail <= 4.0 && controls.input.peek().rescueHeld) {
            tutorialTimer += 1;
            if (tutorialTimer >= 60) { // 2s
              tutorialStep = 4;
              tutorialProgressFill.style.width = '100%';
              sound.playRescueSound();
              flashScreen('flash-rescue');
              tutorialStepTag.textContent = 'Hoàn thành';
              tutorialTitle.textContent = '🏆 Huấn luyện hoàn tất!';
              tutorialDesc.textContent = 'Bạn đã nắm vững toàn bộ kỹ năng vượt rào, ẩn nấp và giải cứu! Hãy tham gia phòng chơi thực tế để so tài.';
            }
          }
        }
      }

      quickChatHints.hidden = !playing || isSpectating;
    }

    renderer.render(scene, camera);

    if (import.meta.env.DEV) {
      if (time - lastDebugUpdate >= 100) { // 10Hz debug UI updates
        lastDebugUpdate = time;
        const input = controls.input.peek();
        debug.dataset.x = player.pos[0].toFixed(3);
        debug.dataset.yaw = String(camera.rotation.y);
        debug.dataset.eye = camera.position.y.toFixed(3);
        debug.dataset.grounded = String(player.grounded);
        debug.textContent = `X/Z: ${player.pos[0].toFixed(2)}/${player.pos[2].toFixed(2)} · Sprint: ${Number(input.sprint)} · Cúi: ${Number(input.crouch)} · Cứu: ${Number(input.rescueHeld)} · Input X/Z ${input.moveX}/${input.moveZ} · E ${Number(input.rescueHeld)} · Yaw ${camera.rotation.y.toFixed(2)} · Pitch ${camera.rotation.x.toFixed(2)}`;
      }
    }
  });

  status.textContent = 'Sẵn sàng. Tạo phòng, vào phòng hoặc chọn sân tập offline.';

  if (import.meta.env.DEV && new URLSearchParams(location.search).get('backend') === 'mock') btnMockMode.click();
  else if (session.restore()) {
    isOffline = false;
    menuView.hidden = true;
    status.textContent = 'Đang kết nối lại phòng…';
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    viewmodel.dispose();
    removePreview?.();
    mockDetails.dispose();
    session.dispose();
    controls.dispose();
    button.removeEventListener('click', enter);
    observer.disconnect();
    renderer.setAnimationLoop(null);
    disposeScene(scene);
    renderer.dispose();
    renderer.domElement.remove();
  };

  window.addEventListener('pagehide', (e) => {
    if (!e.persisted) dispose();
  });

  if (import.meta.hot) import.meta.hot.dispose(dispose);
} catch (error) {
  button.disabled = true;
  status.textContent = 'Không khởi tạo được WebGL. Hãy thử Chrome/Edge với tăng tốc đồ họa rồi tải lại trang.';
  console.error('Scene initialization failed', error);
}
