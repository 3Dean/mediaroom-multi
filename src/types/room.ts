import type { ChatMessage } from './chat';
import type { InteractableObjectState, SeatState } from './interactions';
import type { PlayerPresence } from './player';

export type RoomSummary = {
  id: string;
  slug: string;
  name: string;
  maxUsers: number;
  isPrivate?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RoomSnapshot = {
  roomId: string;
  selfSessionId: string;
  participants: PlayerPresence[];
  seats: SeatState[];
  objects: InteractableObjectState[];
  recentMessages: ChatMessage[];
  serverTime: number;
};

export type RoomState = {
  roomId: string;
  selfSessionId: string | null;
  participants: Record<string, PlayerPresence>;
  seats: Record<string, SeatState>;
  objects: Record<string, InteractableObjectState>;
  messages: ChatMessage[];
};
