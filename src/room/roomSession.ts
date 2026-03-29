import { STORAGE_KEYS } from '../app/config';
import { createSessionId } from '../utils/ids';

export type ActiveRoomSession = {
  roomId: string;
  roomSlug: string;
  sessionId: string;
  userId: string;
  displayName: string;
  avatarStyle: string | null;
};

export class RoomSessionStore {
  private currentSession: ActiveRoomSession | null = null;

  getCurrentSession(): ActiveRoomSession | null {
    return this.currentSession;
  }

  createSession(roomSlug: string, displayName: string, userId?: string, avatarStyle?: string | null): ActiveRoomSession {
    const session = {
      roomId: roomSlug,
      roomSlug,
      sessionId: createSessionId('room'),
      userId: userId ?? displayName,
      displayName,
      avatarStyle: avatarStyle ?? null,
    };

    this.currentSession = session;
    localStorage.setItem(STORAGE_KEYS.lastRoomSlug, roomSlug);
    localStorage.setItem(STORAGE_KEYS.displayName, displayName);
    return session;
  }

  clear(): void {
    this.currentSession = null;
  }
}
