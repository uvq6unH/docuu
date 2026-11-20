import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import type { RoomState } from '../../../packages/shared/src/protocol';
import { mountRoomDetails, readMapDigest } from '../../src/net/room-details';

afterEach(() => vi.unstubAllGlobals());

it('hashes fetched map bytes on a LAN HTTP origin without SubtleCrypto', async () => {
  vi.stubGlobal('crypto', {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('abc')));
  expect(await readMapDigest()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

it('replaces the roster and compares the current room against the fetched bytes', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('abc')));
  const panel = document.createElement('section');
  const details = mountRoomDetails(panel);
  const room: RoomState = {
    roomCode: 'ABC123', protocolVersion: 1, phase: 'LOBBY', hostId: 'p1',
    mapHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    roster: [{ id: 'p1', name: 'An', ready: false, connected: true, role: null }],
  };
  details.update(room);
  await vi.waitFor(() => expect(panel.textContent).toContain('Bản đồ FE khớp'));
  details.update({ ...room, mapHash: '0'.repeat(64), roster: [] });
  expect(panel.textContent).toContain('khác nhau');
  expect(panel.querySelectorAll('li')).toHaveLength(0);
  details.update(null);
  expect(panel.querySelector('details')?.hidden).toBe(true);
  expect(panel.textContent).toBe('');
  details.dispose();
  expect(panel.childElementCount).toBe(0);
});
