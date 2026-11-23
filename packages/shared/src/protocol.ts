export const PROTOCOL_VERSION = 1;

export type Vec3 = [x: number, y: number, z: number];
export type Vec2 = [x: number, z: number];

export type Role = 'POLICE' | 'ROBBER';

export type Phase = 'LOBBY' | 'JAIL_SELECTION' | 'HEAD_START' | 'PLAYING' | 'RESULT';

export type RobberState = 'FREE' | 'HIDDEN' | 'JAILED' | 'IMMUNE';

export type HatCosmetic = 'none' | 'non_la' | 'khan_ran' | 'mu_nan';

export interface CosmeticPreferences {
  hat: HatCosmetic;
  shirtColor?: string | undefined;
}

export interface PlayerView {
  id: string;
  role: Role;
  pos: Vec3;
  yaw: number;
  vel: Vec3;
  crouch: boolean;
  grounded: boolean;
  state?: RobberState; // Robber-only state
  guard?: boolean; // Police-only flag: true if inside active jail guard zone
  connected: boolean;
  cosmetic?: CosmeticPreferences;
}

export interface SelfPlayerView extends PlayerView {
  stamina: number;
  ackSeq: number;
  ackJumpId: number;
  ackCaptureId: number;
  immuneRemainingMs: number;
  rescueProgressMs: number;
}

export interface PlayerStats {
  captures: number;
  rescues: number;
  timeJailedMs: number;
}

export interface MatchResult {
  winner: 'POLICE' | 'ROBBER' | 'ABORTED';
  reason: string;
  stats?: Record<string, PlayerStats>;
  mvpPolice?: string;
  mvpRobber?: string;
}

export interface Snapshot {
  protocolVersion: 1;
  matchId: string;
  tick: number;
  phase: Phase;
  remainingMs: number;
  jailId: string | null;
  guardId: string | null;
  self: SelfPlayerView;
  players: PlayerView[]; // Excludes self, filtered per recipient role and visibility
  jailedCount: number; // Public count (0..4)
  result: MatchResult | null;
}

export interface InputFrame {
  seq: number; // uint32 monotonic sequence number
  moveX: -1 | 0 | 1;
  moveZ: -1 | 0 | 1; // +1 forward relative to yaw (where yaw=0 faces -Z)
  yaw: number; // radians [-PI, PI]
  pitch: number; // radians [-PI/2, PI/2]
  sprint: boolean;
  crouch: boolean;
  rescueHeld: boolean;
  jumpId: number; // incremented per jump press, repeated until ack
  captureId: number; // incremented per capture click, repeated until ack
}

export interface RosterMember {
  id: string;
  name: string;
  ready: boolean;
  role: Role | null;
  connected: boolean;
  isHost?: boolean;
  isCaptain?: boolean;
  isBot?: boolean;
  cosmetic?: CosmeticPreferences;
}

export interface QuickChatMessage {
  senderId: string;
  senderName: string;
  role: Role;
  text: string;
  teamOnly: boolean;
  time: number;
}

export interface TacticalPing {
  senderId: string;
  role: Role;
  pos: Vec3;
  time: number;
}

export interface PebbleEvent {
  senderId: string;
  fromPos: Vec3;
  landingPos: Vec3;
}

export interface PublicRoomSummary {
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  phase: Phase;
}

export interface RoomState {
  roomCode: string;
  hostId: string;
  phase: Phase;
  roster: RosterMember[];
  mapHash: string;
  protocolVersion: number;
  captainId?: string;
}

export type ErrorCode =
  | 'BAD_PAYLOAD'
  | 'RATE_LIMIT'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'MATCH_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NOT_CAPTAIN'
  | 'INVALID_PHASE'
  | 'MAP_MISMATCH'
  | 'VERSION_MISMATCH'
  | 'TOKEN_INVALID'
  | 'NOT_READY'
  | 'JAIL_INVALID';

export interface AckResponse<T = unknown> {
  ok: boolean;
  code?: ErrorCode;
  message?: string;
  data?: T;
}

export type GameEventType = 'CAPTURE' | 'CAPTURE_MISS' | 'RESCUE' | 'PHASE' | 'GUARD_CHANGED' | 'RESULT';

export interface GameEvent {
  eventId: string;
  tick: number;
  type: GameEventType;
  data: unknown;
}

export const CLIENT_EVENTS = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_RESUME: 'room:resume',
  ROOM_LEAVE: 'room:leave',
  ROOM_READY: 'room:ready',
  ROOM_START: 'room:start',
  ROOM_RESTART: 'room:restart',
  ROOM_ADD_BOT: 'room:add_bot',
  ROOM_REMOVE_BOT: 'room:remove_bot',
  ROOM_SET_ROLE: 'room:set_role',
  ROOM_AUTO_ROLES: 'room:auto_roles',
  ROOM_SET_COSMETIC: 'room:set_cosmetic',
  ROOM_LIST: 'room:list',
  JAIL_SELECT: 'jail:select',
  GAME_INPUT: 'game:input',
  GAME_CHAT: 'game:chat',
  GAME_PING: 'game:ping',
  GAME_PEBBLE: 'game:pebble',
} as const;

export const SERVER_EVENTS = {
  ROOM_STATE: 'room:state',
  ROOM_LIST_RESPONSE: 'room:list_response',
  GAME_SNAPSHOT: 'game:snapshot',
  GAME_EVENT: 'game:event',
  GAME_CHAT_EVENT: 'game:chat_event',
  GAME_PING_EVENT: 'game:ping_event',
  GAME_PEBBLE_EVENT: 'game:pebble_event',
  ROOM_ERROR: 'room:error',
} as const;
