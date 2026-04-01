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

export type RoomRole = 'owner' | 'admin' | 'member';

export type RoomAuthority = {
  ownerUserId: string | null;
  adminUserIds: string[];
  mutedUserIds: string[];
  isLocked: boolean;
};

export type RoomSnapshot = {
  roomId: string;
  selfSessionId: string;
  participants: PlayerPresence[];
  seats: SeatState[];
  objects: InteractableObjectState[];
  authority: RoomAuthority;
  selfRole: RoomRole;
  recentMessages: ChatMessage[];
  serverTime: number;
};

export type RoomState = {
  roomId: string;
  selfSessionId: string | null;
  participants: Record<string, PlayerPresence>;
  seats: Record<string, SeatState>;
  objects: Record<string, InteractableObjectState>;
  authority: RoomAuthority;
  selfRole: RoomRole | null;
  messages: ChatMessage[];
};
