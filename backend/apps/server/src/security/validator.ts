import type { InputFrame } from '@folk-tag/shared';

/**
 * Sanitizes and validates a player name:
 * - Trims whitespace
 * - Strips any HTML tags or script markup
 * - Limits length to max 24 characters (minimum 1 character)
 */
export function sanitizePlayerName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const stripped = raw.replace(/<[^>]*>/g, '').trim();
  if (stripped.length === 0) return null;
  return stripped.slice(0, 24);
}

/**
 * Validates and canonicalizes a 6-character alphanumeric room code.
 */
export function validateRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(upper)) return null;
  return upper;
}

/**
 * Validates an incoming client InputFrame packet:
 * - Validates integer sequence numbers and action IDs
 * - Enforces -1, 0, 1 for directional movements
 * - Enforces finite numbers for yaw and clamped pitch [-PI/2, PI/2]
 * - Converts flags to strict booleans
 */
export function validateInputFrame(raw: unknown): InputFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;

  if (typeof f.seq !== 'number' || !Number.isInteger(f.seq) || f.seq < 0) {
    return null;
  }

  const moveX = f.moveX === 1 ? 1 : f.moveX === -1 ? -1 : 0;
  const moveZ = f.moveZ === 1 ? 1 : f.moveZ === -1 ? -1 : 0;

  if (typeof f.yaw !== 'number' || !Number.isFinite(f.yaw)) {
    return null;
  }
  const pitchRaw = typeof f.pitch === 'number' && Number.isFinite(f.pitch) ? f.pitch : 0;
  const halfPi = Math.PI / 2;
  const pitch = Math.max(-halfPi, Math.min(halfPi, pitchRaw));

  const jumpId = typeof f.jumpId === 'number' && Number.isInteger(f.jumpId) && f.jumpId >= 0 ? f.jumpId : 0;
  const captureId = typeof f.captureId === 'number' && Number.isInteger(f.captureId) && f.captureId >= 0 ? f.captureId : 0;

  return {
    seq: f.seq,
    moveX,
    moveZ,
    yaw: f.yaw,
    pitch,
    sprint: Boolean(f.sprint),
    crouch: Boolean(f.crouch),
    rescueHeld: Boolean(f.rescueHeld),
    jumpId,
    captureId,
  };
}
