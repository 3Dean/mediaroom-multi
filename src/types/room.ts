import type { ChatMessage } from './chat';
import type { InteractableObjectState, SeatState } from './interactions';
import type { PlayerPresence } from './player';

export type RoomSummary = {
  id: string;
  slug: string;
  name: string;
  maxUsers: number;
  isPersisted?: boolean;
  isLive?: boolean;
  liveParticipantCount?: number;
  lastActiveAt?: string;
  isPrivate?: boolean;
  isLocked?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RoomRole = 'owner' | 'admin' | 'member';

export type RoomSurfaceId = 'image01' | 'image02' | 'image03' | 'image04';

export type RoomSurfaceSnapshot = {
  surfaceId: RoomSurfaceId;
  imagePath: string;
  updatedByUserId: string;
  updatedAt: string;
};

export type RoomTvMediaState = {
  sourceUrl: string;
  updatedByUserId: string;
  updatedAt: string;
};

export type RoomAuthority = {
  ownerUserId: string | null;
  adminUserIds: string[];
  mutedUserIds: string[];
  isLocked: boolean;
};

export type RoomSnapshot = {
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

export type RoomState = {
  roomId: string;
  isPersisted: boolean;
  selfSessionId: string | null;
  participants: Record<string, PlayerPresence>;
  seats: Record<string, SeatState>;
  objects: Record<string, InteractableObjectState>;
  surfaces: Record<string, RoomSurfaceSnapshot>;
  tvMedia: RoomTvMediaState | null;
  authority: RoomAuthority;
  selfRole: RoomRole | null;
  messages: ChatMessage[];
};
