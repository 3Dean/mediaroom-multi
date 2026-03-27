import type { ChatMessage } from './chat';
import type { InteractableObjectState, SeatState } from './interactions';
import type { ObjectTransform, PlayerPresence, PlayerTransform } from './player';

export type RoomJoinMessage = {
  type: 'room.join';
  roomId: string;
  sessionId: string;
  displayName: string;
  userId?: string;
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

export type ClientMessage =
  | RoomJoinMessage
  | RoomLeaveMessage
  | PresenceUpdateMessage
  | ChatSendMessage
  | SeatClaimMessage
  | SeatReleaseMessage
  | ObjectClaimMessage
  | ObjectReleaseMessage
  | PingMessage;

export type RoomJoinedMessage = {
  type: 'room.joined';
  roomId: string;
  selfSessionId: string;
  participants: PlayerPresence[];
  seats: SeatState[];
  objects: InteractableObjectState[];
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
  | ErrorMessage
  | PongMessage;
