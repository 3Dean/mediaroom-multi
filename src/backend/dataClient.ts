import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const dataClient = generateClient<Schema>();

export function getDataClient() {
  return dataClient;
}

export async function listRooms() {
  return dataClient.models.Room.list();
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
