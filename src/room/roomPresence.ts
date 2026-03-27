import type { InteractableObjectState } from '../types/interactions';
import type { ServerMessage } from '../types/network';
import { RoomStateStore } from './roomState';

export function applyServerMessage(store: RoomStateStore, message: ServerMessage): void {
  switch (message.type) {
    case 'room.joined': {
      store.hydrate({
        roomId: message.roomId,
        selfSessionId: message.selfSessionId,
        participants: message.participants,
        seats: message.seats,
        objects: message.objects,
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
    case 'chat.received': {
      store.addMessage(message.message);
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
