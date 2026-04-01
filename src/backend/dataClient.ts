import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { RoomSummary } from '../types/room';

const dataClient = generateClient<Schema>();

export function getDataClient() {
  return dataClient;
}

export async function listRooms(): Promise<RoomSummary[]> {
  const response = await dataClient.models.Room.list();
  const rooms = Array.isArray(response.data) ? response.data : [];

  return rooms
    .filter((room) => typeof room?.slug === 'string' && typeof room?.name === 'string' && typeof room?.maxUsers === 'number')
    .map((room) => ({
      id: room.id,
      slug: room.slug,
      name: room.name,
      maxUsers: room.maxUsers,
      isPrivate: room.isPrivate ?? undefined,
      isLocked: room.isLocked ?? undefined,
      createdBy: room.createdBy ?? undefined,
      createdAt: room.createdAt ?? undefined,
      updatedAt: room.updatedAt ?? undefined,
    }))
    .sort((a, b) => {
      const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bTime - aTime;
    });
}

export async function listRecentRoomMessages(roomId: string) {
  return dataClient.models.RoomMessage.list({
    filter: {
      roomId: {
        eq: roomId,
      },
    },
  });
}
