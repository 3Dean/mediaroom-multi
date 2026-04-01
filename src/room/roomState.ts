import type { ChatMessage } from '../types/chat';
import type { InteractableObjectState, SeatState } from '../types/interactions';
import type { PlayerPresence } from '../types/player';
import type { RoomAuthority, RoomSnapshot, RoomState } from '../types/room';

const emptyAuthority = (): RoomAuthority => ({
  ownerUserId: null,
  adminUserIds: [],
  mutedUserIds: [],
  isLocked: false,
});

const emptyRoomState = (): RoomState => ({
  roomId: '',
  selfSessionId: null,
  participants: {},
  seats: {},
  objects: {},
  authority: emptyAuthority(),
  selfRole: null,
  messages: [],
});

export class RoomStateStore {
  private state: RoomState = emptyRoomState();

  getSnapshot(): RoomState {
    return {
      roomId: this.state.roomId,
      selfSessionId: this.state.selfSessionId,
      participants: { ...this.state.participants },
      seats: { ...this.state.seats },
      objects: { ...this.state.objects },
      authority: {
        ownerUserId: this.state.authority.ownerUserId,
        adminUserIds: [...this.state.authority.adminUserIds],
        mutedUserIds: [...this.state.authority.mutedUserIds],
        isLocked: this.state.authority.isLocked,
      },
      selfRole: this.state.selfRole,
      messages: [...this.state.messages],
    };
  }

  reset(roomId = ''): void {
    this.state = {
      ...emptyRoomState(),
      roomId,
    };
  }

  clearPresence(): void {
    this.state.participants = {};
    this.state.seats = {};
    this.state.objects = {};
    this.state.authority = emptyAuthority();
    this.state.selfRole = null;
    this.state.selfSessionId = null;
  }

  hydrate(snapshot: RoomSnapshot): void {
    this.state.roomId = snapshot.roomId;
    this.state.selfSessionId = snapshot.selfSessionId;
    this.state.participants = Object.fromEntries(
      snapshot.participants.map((participant) => [participant.sessionId, participant]),
    );
    this.state.seats = Object.fromEntries(snapshot.seats.map((seat) => [seat.seatId, seat]));
    this.state.objects = Object.fromEntries(snapshot.objects.map((object) => [object.objectId, object]));
    this.state.authority = {
      ownerUserId: snapshot.authority.ownerUserId,
      adminUserIds: [...snapshot.authority.adminUserIds],
      mutedUserIds: [...snapshot.authority.mutedUserIds],
      isLocked: snapshot.authority.isLocked,
    };
    this.state.selfRole = snapshot.selfRole;
    this.state.messages = [...snapshot.recentMessages];
  }

  upsertParticipant(participant: PlayerPresence): void {
    this.state.participants[participant.sessionId] = participant;
  }

  removeParticipant(sessionId: string): void {
    delete this.state.participants[sessionId];
  }

  upsertSeat(seat: SeatState): void {
    this.state.seats[seat.seatId] = seat;
  }

  upsertObject(object: InteractableObjectState): void {
    this.state.objects[object.objectId] = object;
  }

  setAuthority(authority: RoomAuthority, selfRole: RoomState['selfRole']): void {
    this.state.authority = {
      ownerUserId: authority.ownerUserId,
      adminUserIds: [...authority.adminUserIds],
      mutedUserIds: [...authority.mutedUserIds],
      isLocked: authority.isLocked,
    };
    this.state.selfRole = selfRole;
  }

  addMessage(message: ChatMessage): void {
    this.state.messages = [...this.state.messages, message];
  }
}
