import type { InteractableObjectState } from '../types/interactions';
import type { ServerMessage } from '../types/network';
import { RoomStateStore } from './roomState';

export function applyServerMessage(store: RoomStateStore, message: ServerMessage): void {
  switch (message.type) {
    case 'room.joined': {
      store.hydrate({
        roomId: message.roomId,
        isPersisted: message.isPersisted,
        selfSessionId: message.selfSessionId,
        participants: message.participants,
        seats: message.seats,
        objects: message.objects,
        surfaces: message.surfaces,
        tvMedia: message.tvMedia,
        authority: message.authority,
        selfRole: message.selfRole,
        recentMessages: message.recentMessages,
        serverTime: message.serverTime,
      });
      return;
    }
    case 'participant.joined':
    case 'participant.updated': {
      store.upsertParticipant(message.participant);
      return;
    }
    case 'participant.left': {
      store.removeParticipant(message.sessionId);
      return;
    }
    case 'seat.updated': {
      store.upsertSeat(message.seat);
      return;
    }
    case 'object.updated': {
      store.upsertObject(message.object as InteractableObjectState);
      return;
    }
    case 'surface.updated': {
      store.upsertSurface(message.surface);
      return;
    }
    case 'surface.cleared': {
      store.removeSurface(message.surfaceId);
      return;
    }
    case 'tv.updated': {
      store.setTvMedia(message.tvMedia);
      return;
    }
    case 'room.authority.updated': {
      store.setAuthority(message.authority, message.selfRole ?? store.getSnapshot().selfRole);
      return;
    }
    case 'chat.received': {
      store.addMessage(message.message);
      return;
    }
    case 'system.notice': {
      store.addMessage(message.notice);
      return;
    }
    case 'error': {
      console.error(`[room] ${message.code}: ${message.message}`);
      return;
    }
    case 'pong': {
      return;
    }
    default: {
      const exhaustiveCheck: never = message;
      return exhaustiveCheck;
    }
  }
}
