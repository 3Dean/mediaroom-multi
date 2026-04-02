import type { ChatMessage } from '../types/chat';
import type { InteractableObjectState, SeatState } from '../types/interactions';
import type { PlayerPresence } from '../types/player';
import type { RoomAuthority, RoomSnapshot, RoomState, RoomSurfaceSnapshot } from '../types/room';

const emptyAuthority = (): RoomAuthority => ({
  ownerUserId: null,
  adminUserIds: [],
  mutedUserIds: [],
  isLocked: false,
});

const emptyRoomState = (): RoomState => ({
  roomId: '',
  isPersisted: false,
  selfSessionId: null,
  participants: {},
  seats: {},
  objects: {},
  surfaces: {},
  authority: emptyAuthority(),
  selfRole: null,
  messages: [],
});

export class RoomStateStore {
  private state: RoomState = emptyRoomState();

  getSnapshot(): RoomState {
    return {
      roomId: this.state.roomId,
      isPersisted: this.state.isPersisted,
      selfSessionId: this.state.selfSessionId,
      participants: { ...this.state.participants },
      seats: { ...this.state.seats },
      objects: { ...this.state.objects },
      surfaces: { ...this.state.surfaces },
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
    this.state.surfaces = {};
    this.state.isPersisted = false;
    this.state.authority = emptyAuthority();
    this.state.selfRole = null;
    this.state.selfSessionId = null;
  }

  hydrate(snapshot: RoomSnapshot): void {
    this.state.roomId = snapshot.roomId;
    this.state.isPersisted = snapshot.isPersisted;
    this.state.selfSessionId = snapshot.selfSessionId;
    this.state.participants = Object.fromEntries(
      snapshot.participants.map((participant) => [participant.sessionId, participant]),
    );
    this.state.seats = Object.fromEntries(snapshot.seats.map((seat) => [seat.seatId, seat]));
    this.state.objects = Object.fromEntries(snapshot.objects.map((object) => [object.objectId, object]));
    this.state.surfaces = Object.fromEntries(snapshot.surfaces.map((surface) => [surface.surfaceId, surface]));
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

  upsertSurface(surface: RoomSurfaceSnapshot): void {
    this.state.surfaces[surface.surfaceId] = surface;
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
