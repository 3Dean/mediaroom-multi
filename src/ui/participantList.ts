import type { PlayerPresence } from '../types/player';
import type { RoomAuthority, RoomRole } from '../types/room';

type ParticipantListOptions = {
  onKick: (targetSessionId: string) => void;
  onSetRole: (targetUserId: string, role: 'admin' | 'member') => void;
  onSetMute: (targetUserId: string, muted: boolean) => void;
  onSetRoomLock: (locked: boolean) => void;
};

export class ParticipantList {
  private readonly container: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly controls: HTMLDivElement;
  private readonly roleBadge: HTMLDivElement;
  private readonly lockButton: HTMLButtonElement;
  private readonly list: HTMLDivElement;
  private readonly options: ParticipantListOptions;

  constructor(options: ParticipantListOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.id = 'participant-list';
    this.container.className = 'musicspace-panel';

    const title = document.createElement('div');
    title.textContent = 'Participants';
    title.style.color = '#fff';
    title.style.fontWeight = '700';
    title.style.fontSize = '14px';
    title.style.marginBottom = '8px';

    this.status = document.createElement('div');
    this.status.style.color = '#c8c8c8';
    this.status.style.fontSize = '12px';
    this.status.style.marginBottom = '8px';
    this.status.textContent = 'Offline';

    this.controls = document.createElement('div');
    this.controls.className = 'participant-controls';

    this.roleBadge = document.createElement('div');
    this.roleBadge.className = 'participant-role-badge';
    this.roleBadge.textContent = 'Member';

    this.lockButton = document.createElement('button');
    this.lockButton.type = 'button';
    this.lockButton.className = 'participant-lock-button';
    this.lockButton.style.display = 'none';
    this.lockButton.addEventListener('click', () => {
      const locked = this.lockButton.dataset.locked === 'true';
      this.options.onSetRoomLock(!locked);
    });

    this.controls.append(this.roleBadge, this.lockButton);

    this.list = document.createElement('div');
    this.list.style.display = 'flex';
    this.list.style.flexDirection = 'column';
    this.list.style.gap = '6px';
    this.list.style.maxHeight = '220px';
    this.list.style.overflowY = 'auto';

    this.container.append(title, this.status, this.controls, this.list);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  setConnectionStatus(status: string): void {
    this.status.textContent = status;
  }

  setParticipants(
    participants: PlayerPresence[],
    selfSessionId: string | null,
    authority: RoomAuthority,
    selfRole: RoomRole | null,
  ): void {
    this.roleBadge.textContent = formatRoleLabel(selfRole);
    const canManageRoom = selfRole === 'owner';
    this.lockButton.style.display = canManageRoom ? 'inline-flex' : 'none';
    this.lockButton.dataset.locked = String(authority.isLocked);
    this.lockButton.textContent = authority.isLocked ? 'Unlock Room' : 'Lock Room';

    if (participants.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = '#c8c8c8';
      empty.style.fontSize = '12px';
      empty.textContent = 'No active participants';
      this.list.replaceChildren(empty);
      return;
    }

    const rows = participants
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map((participant) => this.createParticipantRow(participant, selfSessionId, authority, selfRole));

    this.list.replaceChildren(...rows);
  }

  private createParticipantRow(
    participant: PlayerPresence,
    selfSessionId: string | null,
    authority: RoomAuthority,
    selfRole: RoomRole | null,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'participant-row';

    const left = document.createElement('div');
    left.className = 'participant-row-main';

    const nameLine = document.createElement('div');
    nameLine.className = 'participant-name-line';

    const name = document.createElement('span');
    name.style.color = '#fff';
    name.style.fontSize = '12px';
    name.textContent = participant.sessionId === selfSessionId
      ? `${participant.displayName} (You)`
      : participant.displayName;

    nameLine.append(name);

    const participantRole = resolveParticipantRole(participant.userId, authority);
    if (participantRole !== 'member') {
      const badge = document.createElement('span');
      badge.className = 'participant-inline-badge';
      badge.textContent = formatRoleLabel(participantRole);
      nameLine.appendChild(badge);
    }

    if (authority.mutedUserIds.includes(participant.userId)) {
      const mutedBadge = document.createElement('span');
      mutedBadge.className = 'participant-inline-badge is-muted';
      mutedBadge.textContent = 'Muted';
      nameLine.appendChild(mutedBadge);
    }

    const state = document.createElement('div');
    state.style.color = participant.seatId ? '#9bd5ff' : '#c8c8c8';
    state.style.fontSize = '12px';
    state.textContent = participant.seatId ? `Seated: ${participant.seatId}` : 'Walking';

    left.append(nameLine, state);
    row.appendChild(left);

    const actions = this.createActions(participant, selfSessionId, authority, selfRole);
    if (actions) {
      row.appendChild(actions);
    }

    return row;
  }

  private createActions(
    participant: PlayerPresence,
    selfSessionId: string | null,
    authority: RoomAuthority,
    selfRole: RoomRole | null,
  ): HTMLDivElement | null {
    if (!selfSessionId || participant.sessionId === selfSessionId) {
      return null;
    }

    const participantRole = resolveParticipantRole(participant.userId, authority);
    const isOwner = selfRole === 'owner';
    const isAdmin = selfRole === 'admin';
    const canModerate = isOwner || isAdmin;
    if (!canModerate || participantRole === 'owner') {
      return null;
    }
    if (isAdmin && participantRole === 'admin') {
      return null;
    }

    const actions = document.createElement('div');
    actions.className = 'participant-actions';

    const muteButton = document.createElement('button');
    muteButton.type = 'button';
    muteButton.textContent = authority.mutedUserIds.includes(participant.userId) ? 'Unmute' : 'Mute';
    muteButton.addEventListener('click', () => {
      this.options.onSetMute(participant.userId, !authority.mutedUserIds.includes(participant.userId));
    });
    actions.appendChild(muteButton);

    if (isOwner) {
      const roleButton = document.createElement('button');
      roleButton.type = 'button';
      roleButton.textContent = participantRole === 'admin' ? 'Remove Admin' : 'Make Admin';
      roleButton.addEventListener('click', () => {
        this.options.onSetRole(participant.userId, participantRole === 'admin' ? 'member' : 'admin');
      });
      actions.appendChild(roleButton);
    }

    const kickButton = document.createElement('button');
    kickButton.type = 'button';
    kickButton.textContent = 'Kick';
    kickButton.addEventListener('click', () => {
      this.options.onKick(participant.sessionId);
    });
    actions.appendChild(kickButton);

    return actions;
  }
}

function resolveParticipantRole(userId: string, authority: RoomAuthority): RoomRole {
  if (authority.ownerUserId === userId) {
    return 'owner';
  }
  if (authority.adminUserIds.includes(userId)) {
    return 'admin';
  }
  return 'member';
}

function formatRoleLabel(role: RoomRole | null): string {
  if (role === 'owner') {
    return 'Owner';
  }
  if (role === 'admin') {
    return 'Admin';
  }
  return 'Member';
}
