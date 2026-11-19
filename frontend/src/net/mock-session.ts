import { io } from 'socket.io-client';
import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
import {
  CLIENT_EVENTS, SERVER_EVENTS, PROTOCOL_VERSION,
  type InputFrame, type RoomState, type Snapshot,
} from '../../../packages/shared/src/protocol';
import type { InputState } from '../input/state';

export function connectMock(scene: Scene, onSnapshot: (snapshot: Snapshot) => void, onStatus: (message: string) => void) {
  const socket = io({ autoConnect: false });
  const group = new Group();
  scene.add(group);
  const geometry = new CapsuleGeometry(.35, 1);
  const materials = {
    POLICE: new MeshStandardMaterial({ color: '#2876c9' }),
    ROBBER: new MeshStandardMaterial({ color: '#ec8f32' }),
  };
  const markers = new Map<string, Mesh>();
  let roomReady = false;
  let lastTick = -1;
  let seq = 0, jumpId = 0, captureId = 0;

  function reset(message: string) {
    roomReady = false;
    lastTick = -1;
    seq = jumpId = captureId = 0;
    group.clear();
    markers.clear();
    onStatus(message);
  }
  socket.on('disconnect', () => reset('Đã mất kết nối backend thử nghiệm.'));
  socket.on('connect_error', () => reset('Chưa kết nối được backend thử nghiệm. Đang thử lại…'));
  socket.on(SERVER_EVENTS.ROOM_STATE, (room: RoomState) => {
    if (room?.protocolVersion !== PROTOCOL_VERSION || room.mapHash !== 'mock-map-hash' || room.roomCode !== 'MOCK01') {
      socket.disconnect();
      reset('Backend này không phải phòng thử MOCK01 phiên bản 1.');
      return;
    }
    roomReady = true;
  });
  socket.on(SERVER_EVENTS.GAME_SNAPSHOT, (snapshot: Snapshot) => {
    if (!roomReady || snapshot?.protocolVersion !== PROTOCOL_VERSION || snapshot.tick <= lastTick ||
        !snapshot.self?.pos?.every(Number.isFinite) || !Array.isArray(snapshot.players)) return;
    lastTick = snapshot.tick;
    const visible = new Set<string>();
    for (const p of snapshot.players) {
      if (!p.connected || !materials[p.role] || !p.pos?.every(Number.isFinite) ||
          (p.role !== snapshot.self.role && p.state === 'HIDDEN')) continue;
      visible.add(p.id);
      let mesh = markers.get(p.id);
      if (!mesh) {
        mesh = new Mesh(geometry, materials[p.role]);
        group.add(mesh);
        markers.set(p.id, mesh);
      }
      mesh.scale.y = p.crouch ? 1.1 / 1.7 : 1;
      mesh.position.set(p.pos[0], p.pos[1] + .85 * mesh.scale.y, p.pos[2]);
    }
    for (const [id, mesh] of markers) {
      if (!visible.has(id)) { group.remove(mesh); markers.delete(id); }
    }
    onSnapshot(snapshot);
  });
  socket.connect();
  return {
    send(input: ReturnType<InputState['consume']>, yaw: number, pitch: number) {
      if (!socket.connected || !roomReady || lastTick < 0) return;
      if (input.jumpPressed) jumpId++;
      if (input.capturePressed) captureId++;
      const { moveX, moveZ, sprint, crouch, rescueHeld } = input;
      const frame: InputFrame = { seq: ++seq, moveX, moveZ, sprint, crouch, rescueHeld, yaw, pitch, jumpId, captureId };
      socket.volatile.emit(CLIENT_EVENTS.GAME_INPUT, frame);
    },
    dispose() {
      socket.off().disconnect();
      group.removeFromParent();
      group.clear();
      markers.clear();
      geometry.dispose();
      materials.POLICE.dispose();
      materials.ROBBER.dispose();
    },
  };
}

