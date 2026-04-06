import type { PlayerPresence } from '../types/player';
import type { RoomAuthority, RoomRole } from '../types/room';
import { createSectionIcon } from './sectionIcons';

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
    this.container.className = 'musicspace-card musicspace-card--people';

    const header = document.createElement('div');
    header.className = 'musicspace-card-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'musicspace-card-title-wrap';

    const title = document.createElement('h2');
    title.className = 'musicspace-card-title';
    title.textContent = 'People';
    titleWrap.append(createSectionIcon('people'), title);

    this.status = document.createElement('div');
    this.status.className = 'musicspace-card-meta';
    this.status.textContent = 'Offline';

    this.controls = document.createElement('div');
    this.controls.className = 'participant-controls';

    this.roleBadge = document.createElement('div');
    this.roleBadge.className = 'musicspace-pill participant-role-badge';
    this.roleBadge.textContent = 'Member';

    this.lockButton = document.createElement('button');
    this.lockButton.type = 'button';
    this.lockButton.className = 'musicspace-button musicspace-button--secondary participant-lock-button';
    this.lockButton.style.display = 'none';
    this.lockButton.addEventListener('click', () => {
      const locked = this.lockButton.dataset.locked === 'true';
      this.options.onSetRoomLock(!locked);
    });

    this.controls.append(this.roleBadge, this.lockButton);

    this.list = document.createElement('div');
    this.list.className = 'participant-list-body';

    header.append(titleWrap, this.status);
    this.container.append(header, this.controls, this.list);
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
      empty.className = 'musicspace-inline-note';
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
    name.className = 'participant-name';
    name.textContent = participant.sessionId === selfSessionId
      ? `${participant.displayName} (You)`
      : participant.displayName;

    nameLine.append(name);

    const participantRole = resolveParticipantRole(participant.userId, authority);
    if (participantRole !== 'member') {
      const badge = document.createElement('span');
      badge.className = 'musicspace-pill participant-inline-badge';
      badge.textContent = formatRoleLabel(participantRole);
      nameLine.appendChild(badge);
    }

    if (authority.mutedUserIds.includes(participant.userId)) {
      const mutedBadge = document.createElement('span');
      mutedBadge.className = 'musicspace-pill participant-inline-badge is-muted';
      mutedBadge.textContent = 'Muted';
      nameLine.appendChild(mutedBadge);
    }

    const state = document.createElement('div');
    state.className = 'participant-state';
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
    muteButton.className = 'musicspace-button musicspace-button--secondary participant-action-button';
    muteButton.textContent = authority.mutedUserIds.includes(participant.userId) ? 'Unmute' : 'Mute';
    muteButton.addEventListener('click', () => {
      this.options.onSetMute(participant.userId, !authority.mutedUserIds.includes(participant.userId));
    });
    actions.appendChild(muteButton);

    if (isOwner) {
      const roleButton = document.createElement('button');
      roleButton.type = 'button';
      roleButton.className = 'musicspace-button musicspace-button--secondary participant-action-button';
      roleButton.textContent = participantRole === 'admin' ? 'Remove Admin' : 'Make Admin';
      roleButton.addEventListener('click', () => {
        this.options.onSetRole(participant.userId, participantRole === 'admin' ? 'member' : 'admin');
      });
      actions.appendChild(roleButton);
    }

    const kickButton = document.createElement('button');
    kickButton.type = 'button';
    kickButton.className = 'musicspace-button musicspace-button--secondary participant-action-button is-danger';
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

