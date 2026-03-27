import type { ObjectTransform } from './player';

export type SeatDefinition = {
  seatId: string;
  anchorObjectName: string;
  position: ObjectTransform['position'];
  yaw: number;
};

export type SeatState = {
  seatId: string;
  occupiedBySessionId: string | null;
  updatedAt: number;
};

export type InteractableObjectState = {
  objectId: string;
  ownerSessionId: string | null;
  position: ObjectTransform['position'];
  rotation: ObjectTransform['rotation'];
  updatedAt: number;
};
