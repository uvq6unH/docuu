import mapUrl from '../../../packages/shared/maps/vietnam-village.json?url';
import type { RoomState } from '../../../packages/shared/src/protocol';

export async function readMapDigest() {
  const response = await fetch(mapUrl);
  if (!response.ok) throw new Error('Map unavailable');
  const bytes = await response.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const { sha256 } = await import('js-sha256');
  return sha256(new Uint8Array(bytes));
}

export function mountRoomDetails(panel: HTMLElement) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  const roster = document.createElement('ul');
  const compatibility = document.createElement('p');
  const digest = document.createElement('code');
  details.className = 'room-details';
  details.hidden = true;
  details.append(summary, roster, compatibility, digest);
  panel.append(details);

  let room: RoomState | null = null;
  let localHash: string | undefined;
  function compareMap() {
    if (!room) return;
    if (!localHash) {
      compatibility.textContent = localHash === undefined ? 'Đang kiểm tra bản đồ…' : 'Chưa đọc được bản đồ FE.';
      digest.textContent = '';
      return;
    }
    compatibility.textContent = room.mapHash === 'mock-map-hash'
      ? 'Server đang dùng hash thử nghiệm. SHA-256 của bản đồ FE ở bên dưới.'
      : room.mapHash.toLowerCase() === localHash ? 'Bản đồ FE khớp với server.' : 'Bản đồ FE và server khác nhau.';
    digest.textContent = localHash;
  }
  void readMapDigest().then(hash => { localHash = hash; }, () => { localHash = ''; }).then(compareMap);
  return {
    update(next: RoomState | null) {
      room = next;
      details.hidden = !room;
      roster.replaceChildren();
      if (!room) {
        details.open = false;
        summary.textContent = compatibility.textContent = digest.textContent = '';
        return;
      }
      summary.textContent = 'Phòng ' + room.roomCode + ' · ' + room.roster.length + ' nhân vật';
      for (const member of room.roster) {
        const row = document.createElement('li');
        const role = member.role === 'POLICE' ? 'Cảnh sát' : member.role === 'ROBBER' ? 'Cướp' : 'Chưa chia đội';
        const state = !member.connected ? 'Mất kết nối' : member.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng';
        row.textContent = [member.name, role, ...(member.id === room.hostId ? ['Chủ phòng'] : []), state].join(' · ');
        roster.append(row);
      }
      compareMap();
    },
    dispose() { room = null; details.remove(); },
  };
}
