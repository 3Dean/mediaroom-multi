import type { PlayerPresence } from '../types/player';

export class ParticipantList {
  private readonly container: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly list: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'participant-list';
    this.container.style.position = 'absolute';
    this.container.style.left = '16px';
    this.container.style.bottom = '332px';
    this.container.style.width = '280px';
    this.container.style.maxHeight = '260px';
    this.container.style.padding = '12px';
    this.container.style.background = 'rgba(0, 0, 0, 0.68)';
    this.container.style.border = '1px solid rgba(255, 255, 255, 0.14)';
    this.container.style.borderRadius = '10px';
    this.container.style.pointerEvents = 'auto';
    this.container.style.zIndex = '10000';

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

    this.list = document.createElement('div');
    this.list.style.display = 'flex';
    this.list.style.flexDirection = 'column';
    this.list.style.gap = '6px';
    this.list.style.maxHeight = '180px';
    this.list.style.overflowY = 'auto';

    this.container.append(title, this.status, this.list);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  setConnectionStatus(status: string): void {
    this.status.textContent = status;
  }

  setParticipants(participants: PlayerPresence[], selfSessionId: string | null): void {
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
      .map((participant) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.color = '#fff';
        row.style.fontSize = '12px';

        const left = document.createElement('span');
        left.textContent = participant.sessionId === selfSessionId
          ? `${participant.displayName} (You)`
          : participant.displayName;

        const right = document.createElement('span');
        right.style.color = participant.seatId ? '#9bd5ff' : '#c8c8c8';
        right.textContent = participant.seatId ? `Seated: ${participant.seatId}` : 'Walking';

        row.append(left, right);
        return row;
      });

    this.list.replaceChildren(...rows);
  }
}
