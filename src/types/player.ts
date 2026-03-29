export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type EulerY = {
  yaw: number;
  pitch: number;
};

export type PlayerTransform = {
  position: Vec3;
  rotation: EulerY;
};

export type ObjectTransform = {
  position: Vec3;
  rotation: EulerY | null;
};

export type PlayerPresence = {
  sessionId: string;
  userId: string;
  displayName: string;
  roomId: string;
  transform: PlayerTransform;
  isSitting: boolean;
  seatId: string | null;
  heldObjectId: string | null;
  avatarStyle?: string | null;
  spawnId?: string | null;
  updatedAt: number;
};

export type PlayerProfile = {
  userId: string;
  displayName: string;
  avatarStyle?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
