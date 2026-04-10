import type { ChatMessage } from './chat';
import type { InteractableObjectState, SeatState } from './interactions';
import type { ObjectTransform, PlayerPresence, PlayerTransform } from './player';
import type { RoomAuthority, RoomRole, RoomSurfaceId, RoomSurfaceSnapshot, RoomTvMediaState } from './room';

export type RoomJoinMessage = {
  type: 'room.join';
  roomId: string;
  sessionId: string;
  displayName: string;
  userId?: string;
  avatarStyle?: string | null;
  token?: string;
};

export type RoomLeaveMessage = {
  type: 'room.leave';
  roomId: string;
  sessionId: string;
};

export type PresenceUpdateMessage = {
  type: 'presence.update';
  roomId: string;
  sessionId: string;
  transform: PlayerTransform;
  isSitting: boolean;
  seatId: string | null;
  heldObjectId?: string | null;
};

export type ChatSendMessage = {
  type: 'chat.send';
  roomId: string;
  sessionId: string;
  body: string;
  clientMessageId: string;
};

export type SeatClaimMessage = {
  type: 'seat.claim';
  roomId: string;
  sessionId: string;
  seatId: string;
};

export type SeatReleaseMessage = {
  type: 'seat.release';
  roomId: string;
  sessionId: string;
  seatId: string;
};

export type ObjectClaimMessage = {
  type: 'object.claim';
  roomId: string;
  sessionId: string;
  objectId: string;
};

export type ObjectReleaseMessage = {
  type: 'object.release';
  roomId: string;
  sessionId: string;
  objectId: string;
  transform: ObjectTransform;
};

export type PingMessage = {
  type: 'ping';
  ts: number;
};

export type AdminKickMessage = {
  type: 'admin.kick';
  roomId: string;
  sessionId: string;
  targetSessionId: string;
};

export type AdminSetRoleMessage = {
  type: 'admin.setRole';
  roomId: string;
  sessionId: string;
  targetUserId: string;
  role: 'admin' | 'member';
};

export type AdminSetMuteMessage = {
  type: 'admin.setMute';
  roomId: string;
  sessionId: string;
  targetUserId: string;
  muted: boolean;
};

export type AdminSetRoomLockMessage = {
  type: 'admin.setRoomLock';
  roomId: string;
  sessionId: string;
  locked: boolean;
};

export type AdminSetSurfaceImageMessage = {
  type: 'admin.setSurfaceImage';
  roomId: string;
  sessionId: string;
  surfaceId: RoomSurfaceId;
  imagePath: string | null;
  uploadId?: string;
  assetId?: string;
};

export type AdminSetTvMediaMessage = {
  type: 'admin.setTvMedia';
  roomId: string;
  sessionId: string;
  sourceUrl: string | null;
  uploadId?: string;
  assetId?: string;
};

export type AdminSetTvPlaybackMessage = {
  type: 'admin.setTvPlayback';
  roomId: string;
  sessionId: string;
  isPlaying: boolean;
  currentTime: number;
};

export type ClientMessage =
  | RoomJoinMessage
  | RoomLeaveMessage
  | PresenceUpdateMessage
  | ChatSendMessage
  | SeatClaimMessage
  | SeatReleaseMessage
  | ObjectClaimMessage
  | ObjectReleaseMessage
  | AdminKickMessage
  | AdminSetRoleMessage
  | AdminSetMuteMessage
  | AdminSetRoomLockMessage
  | AdminSetSurfaceImageMessage
  | AdminSetTvMediaMessage
  | AdminSetTvPlaybackMessage
  | PingMessage;

export type RoomJoinedMessage = {
  type: 'room.joined';
  roomId: string;
  isPersisted: boolean;
  selfSessionId: string;
  participants: PlayerPresence[];
  seats: SeatState[];
  objects: InteractableObjectState[];
  surfaces: RoomSurfaceSnapshot[];
  tvMedia: RoomTvMediaState | null;
  authority: RoomAuthority;
  selfRole: RoomRole;
  recentMessages: ChatMessage[];
  serverTime: number;
};

export type ParticipantJoinedMessage = {
  type: 'participant.joined';
  participant: PlayerPresence;
};

export type ParticipantLeftMessage = {
  type: 'participant.left';
  sessionId: string;
};

export type ParticipantUpdatedMessage = {
  type: 'participant.updated';
  participant: PlayerPresence;
};

export type ChatReceivedMessage = {
  type: 'chat.received';
  message: ChatMessage;
};

export type SeatUpdatedMessage = {
  type: 'seat.updated';
  seat: SeatState;
};

export type ObjectUpdatedMessage = {
  type: 'object.updated';
  object: InteractableObjectState;
};

export type SurfaceUpdatedMessage = {
  type: 'surface.updated';
  surface: RoomSurfaceSnapshot;
};

export type SurfaceClearedMessage = {
  type: 'surface.cleared';
  surfaceId: RoomSurfaceId;
};

export type TvMediaUpdatedMessage = {
  type: 'tv.updated';
  tvMedia: RoomTvMediaState | null;
};

export type RoomAuthorityUpdatedMessage = {
  type: 'room.authority.updated';
  authority: RoomAuthority;
  selfRole?: RoomRole;
};

export type SystemNoticeMessage = {
  type: 'system.notice';
  notice: ChatMessage;
};

export type ErrorMessage = {
  type: 'error';
  code: string;
  message: string;
};

export type PongMessage = {
  type: 'pong';
  ts: number;
};

export type ServerMessage =
  | RoomJoinedMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | ParticipantUpdatedMessage
  | ChatReceivedMessage
  | SeatUpdatedMessage
  | ObjectUpdatedMessage
  | SurfaceUpdatedMessage
  | SurfaceClearedMessage
  | TvMediaUpdatedMessage
  | RoomAuthorityUpdatedMessage
  | SystemNoticeMessage
  | ErrorMessage
  | PongMessage;
