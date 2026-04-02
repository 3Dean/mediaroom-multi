import type * as THREE from 'three';

type SeatStateSnapshot = {
  nearbySeatId: string | null;
  currentSeatId: string | null;
  isSitting: boolean;
};

type ObjectStateSnapshot = {
  hoveredObjectId: string | null;
  heldObjectId: string | null;
};

type RemoteObjectSnapshot = {
  objectId: string;
  ownerSessionId: string | null;
  position: { x: number; y: number; z: number };
  rotation: { yaw: number; pitch: number } | null;
};

type StationOptionSnapshot = {
  label: string;
  mood: string;
};

type LivePreferencesSnapshot = {
  preferredStationMood?: string | null;
  defaultVolume?: number;
  backgroundOverrideMood?: string | null;
};

type SurfaceSnapshot = {
  surfaceId: 'image01' | 'image02' | 'image03' | 'image04';
  imagePath: string;
  updatedByUserId: string;
  updatedAt: string;
};

type RemoteParticipantSnapshot = {
  sessionId: string;
  position: { x: number; y: number; z: number };
  isSitting: boolean;
};

declare global {
  interface Window {
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    customLights?: THREE.PointLight[];
    __MUSICSPACE_REALTIME_URL__?: string;
    __musicspaceGetSeatState?: () => SeatStateSnapshot;
    __musicspaceOccupySeat?: (seatId: string) => boolean;
    __musicspaceReleaseSeat?: () => void;
    __musicspaceRequestSeatClaim?: (seatId: string) => void;
    __musicspaceRequestSeatRelease?: (seatId: string) => void;
    __musicspaceGetObjectState?: () => ObjectStateSnapshot;
    __musicspaceOccupyObject?: (objectId: string) => boolean;
    __musicspaceRequestObjectClaim?: (objectId: string) => boolean;
    __musicspaceRequestObjectRelease?: (objectId: string, transform: RemoteObjectSnapshot) => void;
    __musicspaceApplyObjectSnapshot?: (snapshot: RemoteObjectSnapshot) => void;
    __musicspaceApplyLocalPlayerTransform?: (transform: { position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number } }) => void;
    __musicspaceGetLocalPlayerTransform?: () => { position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number } } | null;
    __musicspaceGetStationOptions?: () => StationOptionSnapshot[];
    __musicspaceApplyPreferences?: (preferences: LivePreferencesSnapshot) => void;
    __musicspaceGetRemoteParticipants?: () => RemoteParticipantSnapshot[];
    __musicspaceSyncRoomSurfaces?: (surfaces: SurfaceSnapshot[]) => void;
  }
}

export {};
