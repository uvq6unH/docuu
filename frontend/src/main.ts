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
import type { RoomState, GameEvent } from '../../packages/shared/src/protocol';

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

  const surveyPosition = camera.position.clone();
  const surveyRotation = camera.rotation.clone();

  // Load saved player name or generate random
  const savedName = localStorage.getItem('folk_tag_name') || `Người chơi ${Math.floor(100 + Math.random() * 900)}`;
  playerNameInput.value = savedName;
  playerNameInput.addEventListener('change', () => {
    localStorage.setItem('folk_tag_name', playerNameInput.value.trim());
  });

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

  function formatRemainingTime(ms: number): string {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const mockDetails = mountRoomDetails(roomView);
  let resultShown = '';
  let viewSession = '';
  // Session Callbacks
  const session = new GameSession(scene, {
    onStatus(msg, isErr) {
      status.textContent = msg;
      status.style.color = isErr ? '#963624' : '#263d30';
      connectionInfo.textContent = msg;
    },
    onInterrupted() {
      controls.input.clear();
      if (document.pointerLockElement) document.exitPointerLock();
      hudOverlay.hidden = true;
    },
    onRoom(room) {
      if (room) isOffline = false;
      updateRoomUI(room);
    },
    onSnapshot(snapshot) {
      world.setServerJail(snapshot.jailId);
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

      player = {
        ...player,
        pos: self.pos,
        stamina: self.stamina,
        grounded: self.grounded,
        crouched: self.crouch,
      };
      previous = player;

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

      if (self.rescueProgressMs > 0) {
        status.textContent = `Đang giải cứu đồng đội: ${Math.round((self.rescueProgressMs / 2000) * 100)}%`;
      }

      // Check match result
      if (snapshot.phase === 'RESULT' && snapshot.result && resultShown !== snapshot.matchId) {
        resultShown = snapshot.matchId;
        const winner = snapshot.result.winner;
        const msg = winner === 'POLICE'
          ? '🏆 CẢNH SÁT THẮNG! (Đã tống giam toàn bộ cướp)'
          : winner === 'ROBBER'
          ? '🏆 CƯỚP THẮNG! (Hết giờ, cướp đã tẩu thoát)'
          : `Trận đấu hủy: ${snapshot.result.reason}`;
        showToast(msg, 6000);
      }

      debug.dataset.ack = String(self.ackSeq);
      debug.dataset.z = String(self.pos[2]);
    },
    onGameEvent(event: GameEvent) {
      if (event.type === 'CAPTURE') {
        const data = event.data as { policeId: string; robberId: string; jailId: string };
        showToast(`🚨 Cảnh sát đã bắt cướp ${data.robberId}!`);
      } else if (event.type === 'RESCUE') {
        const data = event.data as { rescuerId: string; rescuedId: string };
        showToast(`🔓 Cướp ${data.rescuerId} đã giải cứu đồng đội!`);
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
    if (!room) {
      viewSession = '';
      menuView.hidden = false;
      roomView.hidden = true;
      hudOverlay.hidden = true;
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
    const name = playerNameInput.value.trim() || 'Người chơi';
    if (!code || code.length !== 6) {
      status.textContent = 'Mã phòng phải gồm đúng 6 ký tự chữ/số.';
      return;
    }

    status.textContent = `Đang tham gia phòng ${code}…`;
    btnJoinRoom.disabled = true;

    try {
      const res = await session.joinRoom(code, name);
      btnJoinRoom.disabled = false;
      if (!res.ok) {
        status.textContent = `Không vào được phòng: ${res.message || res.code}`;
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

  btnCopyCode.addEventListener('click', () => {
    if (session.currentRoom?.roomCode) {
      navigator.clipboard.writeText(session.currentRoom.roomCode);
      btnCopyCode.textContent = 'Đã chép!';
      setTimeout(() => { btnCopyCode.textContent = 'Sao chép mã'; }, 2000);
    }
  });

  btnToggleReady.addEventListener('click', async () => {
    btnToggleReady.disabled = true;
    try {
      const res = await session.toggleReady(!isReady);
      btnToggleReady.disabled = false;
      if (!res.ok) {
        status.textContent = `Lỗi: ${res.message || res.code}`;
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
        status.textContent = `Chưa bắt đầu được: ${res.message || res.code}`;
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
    sceneLabel.textContent = 'Sân tập offline';
    notice.textContent = 'Chế độ luyện tập offline · WASD di chuyển, C cúi, Shift chạy';
    status.textContent = 'Sân tập offline sẵn sàng. Nhấn Vào sân tập để khóa chuột.';
    void controls.lock();
  });

  // Controls setup
  const controls = createControls({
    canvas: renderer.domElement,
    camera,
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
      status.textContent = locked ? 'Chuột đã khóa. Nhấn Esc để thả / xem Menu.' : 'Chuột đã nhả. Nhấn Vào sân tập để điều khiển.';
      if (!locked) button.focus({ preventScroll: true });
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

        if (!isOffline) {
          // Stream input frame to Authoritative Server at 30Hz
          session.send(input, camera.rotation.y, camera.rotation.x);
        } else {
          // Offline single-player local physics
          player = stepMovement(player, { ...input, yaw: camera.rotation.y }, 'ROBBER', villageMap);
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
