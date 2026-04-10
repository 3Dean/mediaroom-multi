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
  isPlaying: boolean;
  currentTime: number;
  updatedByUserId: string;
  updatedAt: string;
};

export type RoomMediaAssetKind = 'surface-image' | 'tv-video';

export type RoomMediaAsset = {
  id: string;
  roomId: string;
  kind: RoomMediaAssetKind;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  inUseSurfaceIds: RoomSurfaceId[];
  inUseTv: boolean;
};

export type RoomMediaUsage = {
  bytesUsed: number;
  assetCount: number;
  byteLimit: number;
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
