import { ensureAmplifyConfigured } from './amplifyClient';
import type { Schema } from '../../amplify/data/resource';
import type { RoomSummary } from '../types/room';

let dataClientPromise: Promise<any> | null = null;

export async function getDataClient() {
  if (!dataClientPromise) {
    dataClientPromise = (async () => {
      await ensureAmplifyConfigured();
      const { generateClient } = await import('aws-amplify/data');
      return generateClient<Schema>();
    })();
  }

  return await dataClientPromise;
}

export async function listRooms(): Promise<RoomSummary[]> {
  const dataClient = await getDataClient();
  const response = await dataClient.models.Room.list();
  const rooms = Array.isArray(response.data) ? response.data : [];

  return rooms
    .filter((room: any) => typeof room?.slug === 'string' && typeof room?.name === 'string' && typeof room?.maxUsers === 'number')
    .map((room: any) => ({
      id: room.id,
      slug: room.slug,
      name: room.name,
      maxUsers: room.maxUsers,
      isPersisted: true,
      isLive: false,
      isPrivate: room.isPrivate ?? undefined,
      isLocked: room.isLocked ?? undefined,
      createdBy: room.createdBy ?? undefined,
      createdAt: room.createdAt ?? undefined,
      updatedAt: room.updatedAt ?? undefined,
    }))
    .sort((a: RoomSummary, b: RoomSummary) => {
      const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bTime - aTime;
    });
}

export async function listLiveRooms(): Promise<RoomSummary[]> {
  const response = await fetch('/api/rooms/live');
  if (!response.ok) {
    throw new Error(`Live room request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const rooms = Array.isArray(payload?.rooms) ? payload.rooms : [];

  return rooms
    .filter((room: any) => typeof room?.slug === 'string' && typeof room?.name === 'string')
    .map((room: any) => ({
      id: typeof room.id === 'string' ? room.id : room.slug,
      slug: room.slug,
      name: room.name,
      maxUsers: typeof room.maxUsers === 'number' ? room.maxUsers : 8,
      isPersisted: Boolean(room.isPersisted),
      isLive: true,
      liveParticipantCount: typeof room.liveParticipantCount === 'number' ? room.liveParticipantCount : 0,
      lastActiveAt: typeof room.lastActiveAt === 'string' ? room.lastActiveAt : undefined,
      isPrivate: Boolean(room.isPrivate),
      isLocked: Boolean(room.isLocked),
      createdBy: typeof room.createdBy === 'string' ? room.createdBy : undefined,
      createdAt: typeof room.createdAt === 'string' ? room.createdAt : undefined,
      updatedAt: typeof room.updatedAt === 'string' ? room.updatedAt : undefined,
    }))
    .sort((a: RoomSummary, b: RoomSummary) => {
      const aTime = Date.parse(a.lastActiveAt ?? a.updatedAt ?? a.createdAt ?? '') || 0;
      const bTime = Date.parse(b.lastActiveAt ?? b.updatedAt ?? b.createdAt ?? '') || 0;
      return bTime - aTime || a.slug.localeCompare(b.slug);
    });
}

export function mergeRoomSummaries(savedRooms: RoomSummary[], liveRooms: RoomSummary[]): RoomSummary[] {
  const bySlug = new Map<string, RoomSummary>();

  savedRooms.forEach((room) => {
    bySlug.set(room.slug.toLowerCase(), room);
  });

  liveRooms.forEach((room) => {
    const key = room.slug.toLowerCase();
    const existing = bySlug.get(key);
    if (!existing) {
      bySlug.set(key, room);
      return;
    }

    bySlug.set(key, {
      ...existing,
      isLive: true,
      liveParticipantCount: room.liveParticipantCount,
      lastActiveAt: room.lastActiveAt ?? existing.lastActiveAt,
      isLocked: room.isLocked ?? existing.isLocked,
    });
  });

  return Array.from(bySlug.values());
}

export async function listRecentRoomMessages(roomId: string) {
  const dataClient = await getDataClient();
  return dataClient.models.RoomMessage.list({
    filter: {
      roomId: {
        eq: roomId,
      },
    },
  });
}
