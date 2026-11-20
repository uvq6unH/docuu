import { villagePreview } from './world/village';
import './style.css';
import { createRenderer, createScene, disposeScene, resizeScene } from './core/scene';
import { createControls } from './input/controls';
import { initialMovement, stepMovement } from '../../packages/shared/src/movement';
import { movementRules } from '../../packages/shared/src/rules';
import { villageMap } from './world/shared-map';
import { loadVillageModels } from './world/load-village-models';
import { mountRoomDetails } from './net/room-details';
import { GameSession } from './net/game-session';
import type { RoomState, GameEvent, Snapshot } from '../../packages/shared/src/protocol';
import { sound } from './core/audio';
import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';

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
const rescueBarContainer = requireElement('#rescue-bar-container');
const rescueBarFill = requireElement('#rescue-bar-fill');
const hitFlash = requireElement('#hit-flash');
const helpModal = requireElement('#help-modal');
const btnToggleHelp = requireElement<HTMLButtonElement>('#btn-toggle-help');
const btnCloseHelp = requireElement<HTMLButtonElement>('#btn-close-help');

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
  let isOffline = true;
  let isReady = false;
  let toastTimer: number | null = null;
  let latestSnapshot: Snapshot | null = null;
  let currentRole: 'POLICE' | 'ROBBER' | null = null;
  let activeJailId = 'J1';
  let lastRemainingSec = -1;
  let lastCaptureAttemptTime = 0;

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
  // Compass heading update
  function updateCompass(cameraYaw: number, selfPos: [number, number, number], targetJailId: string) {
    const deg = (Math.round((-cameraYaw * 180) / Math.PI) % 360 + 360) % 360;
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

    const jail = villageMap.jails.find((j) => j.id === targetJailId) || villageMap.jails[0]!;
    const dist = Math.hypot(jail.center[0] - selfPos[0], jail.center[2] - selfPos[2]);
    compassJailIndicator.textContent = `🏛️ ${jail.id}: ${Math.round(dist)}m`;
  }

  // 2D Radar Minimap (T03)
  function renderMinimap(selfPos: [number, number, number], cameraYaw: number, targetJailId: string) {
    if (!minimapCtx) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    minimapCtx.clearRect(0, 0, w, h);

    const toX = (wx: number) => ((wx + 40) / 80) * w;
    const toY = (wz: number) => ((wz + 40) / 80) * h;

    // Outer village boundary
    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(1, 1, w - 2, h - 2);

    // Colliders (Houses)
    minimapCtx.fillStyle = 'rgba(160, 175, 160, 0.35)';
    for (const col of villageMap.colliders) {
      const cx = toX(col.center[0] - col.size[0] / 2);
      const cy = toY(col.center[2] - col.size[2] / 2);
      const sw = (col.size[0] / 80) * w;
      const sh = (col.size[2] / 80) * h;
      minimapCtx.fillRect(cx, cy, sw, sh);
    }

    // Active Jail
    const jail = villageMap.jails.find((j) => j.id === targetJailId) || villageMap.jails[0]!;
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
  }

  // Aim Assist & Proximity Action Prompts
  function checkAimInteraction(snapshot: Snapshot | null, yaw: number) {
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
        const jail = villageMap.jails.find(candidate => candidate.id === snapshot.jailId);
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
    actionPrompt.hidden = action === null;
    if (action) {
      actionPrompt.textContent = action === 'capture' ? '⚡ [CHUỘT TRÁI / E] BẮT CƯỚP!' : '🔓 [GIỮ E / F] CỨU ĐỒNG ĐỘI (2s)';
      actionPrompt.className = 'action-prompt prompt-' + action;
    }
    const color = action === 'capture' ? '#ff4d4d' : '#52b788';
    crosshair.style.background = action ? color : '#ffffff';
    crosshair.style.boxShadow = action ? '0 0 8px ' + color : '0 1px 3px #263d30';
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
      if (viewSession !== identity) {
        yaw = self.yaw;
        pitch = 0;
        if (playing) camera.rotation.set(pitch, yaw, 0, 'YXZ');
        viewSession = identity;
      }
      if (session.isMock) sceneLabel.textContent = 'MOCK01 · ' + self.id + ' · ' + session.currentRoom?.roster.length + ' nhân vật';

      currentRole = self.role;

      if (self.state === 'JAILED') {
        player = {
          ...player,
          pos: [...self.pos],
          stamina: self.stamina,
          grounded: self.grounded,
          crouched: false,
          verticalSpeed: 0,
        };
        previous = player;
      } else {
        // Smooth prediction error reconciliation to prevent camera hitching
        const errX = self.pos[0] - player.pos[0];
        const errZ = self.pos[2] - player.pos[2];
        const errY = self.pos[1] - player.pos[1];
        const errDist = Math.hypot(errX, errZ);

        if (errDist > 1.8) {
          // Hard snap on large server correction / teleport
          player.pos = [...self.pos];
          player.verticalSpeed = 0;
          previous = player;
        } else if (errDist > 0.03) {
          // Gentle correction nudge towards server position
          player.pos[0] += errX * 0.15;
          player.pos[2] += errZ * 0.15;
          if (Math.abs(errY) > 0.25) {
            player.pos[1] += errY * 0.2;
          }
        }
        player.stamina = self.stamina;
        player.grounded = self.grounded;
        player.crouched = self.crouch;
      }

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
      requireElement('#hud-action').textContent = self.state === 'JAILED' ? 'Bạn đang bị giam · Chờ đồng đội cứu'
        : snapshot.phase === 'PLAYING' && self.role === 'POLICE' ? 'Áp sát và nhấn chuột trái để bắt'
        : self.rescueProgressMs > 0 ? 'Đang cứu ' + Math.round(self.rescueProgressMs / 20) + '%' : '';
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
  });

  function updateRoomUI(room: RoomState | null) {
    mockDetails.update(room?.roomCode === 'MOCK01' ? room : null);
    const finished = room?.phase === 'RESULT';
    button.hidden = finished;
    if (!finished) {
      resultPanel.hidden = true;
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

    btnToggleReady.hidden = room.phase !== 'LOBBY';
    if (room.phase !== 'LOBBY') notice.textContent = 'Nhấn nút vào sân để điều khiển nhân vật. Esc để xem phòng.';
    // Toggle Ready Button state
    const me = room.roster.find((m) => m.id === session.playerId);
    isReady = Boolean(me?.ready);
    btnToggleReady.textContent = isReady ? 'Hủy sẵn sàng' : 'Sẵn sàng';
    btnToggleReady.className = isReady ? 'btn-unready' : 'btn-ready';

    // Host start button (available in LOBBY when >= 2 players and all ready)
    const canStart = isHost && room.phase === 'LOBBY';
    btnStartGame.hidden = !canStart;
    if (canStart) {
      const allReady = room.roster.length >= 2 && room.roster.every((m) => m.ready);
      btnStartGame.disabled = !allReady;
      btnStartGame.textContent = allReady
        ? `Bắt đầu trận đấu (${room.roster.length} người)`
        : `Chờ mọi người sẵn sàng (${room.roster.filter(m => m.ready).length}/${room.roster.length})`;
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

  let disposed = false;
  let removePreview: (() => void) | undefined;
  if (import.meta.env.DEV) {
    void import('./world/mount-preview').then(({ mountPreview }) => {
      if (!disposed) removePreview = mountPreview(world, camera, menuView);
    });
  }
  container.setAttribute('aria-busy', 'true');
  void loadVillageModels(world.village, world.jailModel, () => disposed).finally(() => {
    if (!disposed) container.setAttribute('aria-busy', 'false');
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

  // Authoritative Render Loop
  renderer.setAnimationLoop((time) => {
    if (playing) {
      const frameMs = Math.max(0, time - (lastFrame ?? time - 1000 / 60));
      controls.updateLook(frameMs);
      accumulated = Math.min(accumulated + (lastFrame === undefined ? 0 : frameMs), tickMs * movementRules.maxCatchUpTicks);
      lastFrame = time;

      while (accumulated >= tickMs) {
        previous = player;
        const input = controls.input.consume();

        // Immediate Client-Side Prediction: Step physics locally at 30Hz!
        const role = currentRole || 'ROBBER';
        const isJailed = latestSnapshot?.self?.state === 'JAILED';
        const isPoliceFrozen = latestSnapshot?.phase === 'HEAD_START' && currentRole === 'POLICE';

        if (!isJailed && !isPoliceFrozen) {
          player = stepMovement(player, { ...input, yaw: camera.rotation.y }, role, villageMap);
        }

        if (!isOffline) {
          // Stream input frame to Authoritative Server at 30Hz
          session.send(input, camera.rotation.y, camera.rotation.x);
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
          }
        }

        accumulated -= tickMs;
      }

      const blend = accumulated / tickMs;
      const lerp = (from: number, to: number) => from + (to - from) * blend;
      camera.position.set(
        lerp(previous.pos[0], player.pos[0]),
        lerp(previous.pos[1] + eyeHeight(previous.crouched), player.pos[1] + eyeHeight(player.crouched)),
        lerp(previous.pos[2], player.pos[2])
      );
      stamina.textContent = `Thể lực ${Math.round(player.stamina)}/${movementRules.maxStamina}`;

      // N04: Interpolate all remote players smoothly at 60 FPS
      session.updateRemoteInterpolation(frameMs / 1000);

      // T03: Update Compass, Minimap, and Aim Interaction
      updateCompass(camera.rotation.y, player.pos, activeJailId);
      renderMinimap(player.pos, camera.rotation.y, activeJailId);
      checkAimInteraction(latestSnapshot, camera.rotation.y);
    }

    renderer.render(scene, camera);

    if (import.meta.env.DEV) {
      const input = controls.input.peek();
      debug.dataset.yaw = String(camera.rotation.y);
      debug.dataset.x = player.pos[0].toFixed(3);
      debug.dataset.eye = camera.position.y.toFixed(3);
      debug.dataset.grounded = String(player.grounded);
      debug.textContent = `X/Z: ${player.pos[0].toFixed(2)}/${player.pos[2].toFixed(2)} · Sprint: ${Number(input.sprint)} · Cúi: ${Number(input.crouch)} · Cứu: ${Number(input.rescueHeld)} · Input X/Z ${input.moveX}/${input.moveZ} · E ${Number(input.rescueHeld)} · Yaw ${camera.rotation.y.toFixed(2)} · Pitch ${camera.rotation.x.toFixed(2)}`;
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
