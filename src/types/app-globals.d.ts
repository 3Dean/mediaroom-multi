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
    __musicspaceRequestObjectClaim?: (objectId: string) => void;
    __musicspaceRequestObjectRelease?: (objectId: string, transform: RemoteObjectSnapshot) => void;
    __musicspaceApplyObjectSnapshot?: (snapshot: RemoteObjectSnapshot) => void;
  }
}

export {};
