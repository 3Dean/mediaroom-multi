import { STORAGE_KEYS } from '../app/config';
import type { RoomSummary } from '../types/room';

const ROOM_ADJECTIVES = ['amber', 'brisk', 'crimson', 'electric', 'golden', 'hidden', 'ivory', 'lunar', 'neon', 'quiet', 'silver', 'velvet'];
const ROOM_MODIFIERS = ['aurora', 'breeze', 'echo', 'forest', 'harbor', 'meadow', 'midnight', 'signal', 'solar', 'violet', 'whisper', 'willow'];
const ROOM_NOUNS = ['alcove', 'cabin', 'groove', 'hideout', 'lagoon', 'lounge', 'parlor', 'retreat', 'river', 'studio', 'temple', 'voyage'];

function pickRandomWord(words: string[]) {
  return words[Math.floor(Math.random() * words.length)];
}

function generateRoomSlug() {
  return [pickRandomWord(ROOM_ADJECTIVES), pickRandomWord(ROOM_MODIFIERS), pickRandomWord(ROOM_NOUNS)].join('-');
}

type RoomPanelValues = {
  roomSlug: string;
  displayName: string;
};

type RoomPanelOptions = {
  initialRoomSlug?: string;
  initialDisplayName?: string;
};

function resolveDisplayName(input: HTMLInputElement): string {
  return input.value.trim() || 'Guest';
}

function formatRoomTimestamp(room: RoomSummary): string {
  const raw = room.updatedAt ?? room.createdAt;
  if (!raw) {
    return 'No activity yet';
  }

  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    return 'Recently updated';
  }

  const deltaMs = Date.now() - timestamp;
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (deltaMs < minuteMs) {
    return 'Updated just now';
  }
  if (deltaMs < hourMs) {
    return `Updated ${Math.max(1, Math.floor(deltaMs / minuteMs))}m ago`;
  }
  if (deltaMs < dayMs) {
    return `Updated ${Math.max(1, Math.floor(deltaMs / hourMs))}h ago`;
  }

  return `Updated ${Math.max(1, Math.floor(deltaMs / dayMs))}d ago`;
}

export class RoomPanel {
  private readonly container: HTMLDivElement;
  private readonly form: HTMLFormElement;
  private readonly roomInput: HTMLInputElement;
  private readonly nameInput: HTMLInputElement;
  private readonly statusLabel: HTMLDivElement;
  private readonly metaLabel: HTMLDivElement;
  private readonly roomListStatus: HTMLDivElement;
  private readonly roomList: HTMLDivElement;
  private readonly onJoin: (values: RoomPanelValues) => void;
  private readonly generatedRoomSlug: string;
  private readonly hasUrlRoom: boolean;

  constructor(onJoin: (values: RoomPanelValues) => void, options: RoomPanelOptions = {}) {
    this.onJoin = onJoin;
    this.generatedRoomSlug = generateRoomSlug();
    this.hasUrlRoom = !!options.initialRoomSlug?.trim();
    this.container = document.createElement('div');
    this.container.id = 'room-panel';
    this.container.className = 'musicspace-panel';

    const title = document.createElement('div');
    title.textContent = 'Room Session';
    title.style.color = '#fff';
    title.style.fontWeight = '700';
    title.style.fontSize = '14px';
    title.style.marginBottom = '4px';

    const formSection = document.createElement('div');
    formSection.className = 'room-section';

    const formHeader = document.createElement('div');
    formHeader.className = 'room-section-header';

    const formTitle = document.createElement('div');
    formTitle.className = 'room-section-title';
    formTitle.textContent = 'Create / Join';

    const formHint = document.createElement('div');
    formHint.className = 'room-section-hint';
    formHint.textContent = 'Use the room link to create a room or reconnect to one.';

    formHeader.append(formTitle, formHint);

    this.form = document.createElement('form');
    this.form.className = 'room-join-form';

    this.roomInput = document.createElement('input');
    this.roomInput.type = 'text';
    this.roomInput.placeholder = 'Room link / slug';
    this.roomInput.value = options.initialRoomSlug?.trim() || this.generatedRoomSlug;

    const roomSlugLabel = document.createElement('label');
    roomSlugLabel.className = 'room-field-label';
    roomSlugLabel.textContent = 'Room link';

    const displayNameLabel = document.createElement('label');
    displayNameLabel.className = 'room-field-label';
    displayNameLabel.textContent = 'Display name';

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.placeholder = 'Display name';
    this.nameInput.value = options.initialDisplayName?.trim() || localStorage.getItem(STORAGE_KEYS.displayName) || '';

    const joinButton = document.createElement('button');
    joinButton.type = 'submit';
    joinButton.textContent = 'Enter Room';

    const helper = document.createElement('div');
    helper.className = 'room-join-helper';
    helper.textContent = 'Saved rooms appear in the browser list after they are created.';

    this.statusLabel = document.createElement('div');
    this.statusLabel.style.color = '#c8c8c8';
    this.statusLabel.style.fontSize = '12px';
    this.statusLabel.textContent = 'Multiplayer wiring will attach here.';

    this.metaLabel = document.createElement('div');
    this.metaLabel.style.color = '#9bd5ff';
    this.metaLabel.style.fontSize = '12px';
    this.metaLabel.textContent = 'Connection idle';

    const listSection = document.createElement('div');
    listSection.className = 'room-section room-browser';

    const listHeader = document.createElement('div');
    listHeader.className = 'room-section-header room-browser-header';

    const listTitle = document.createElement('div');
    listTitle.className = 'room-section-title';
    listTitle.textContent = 'Browse Rooms';

    this.roomListStatus = document.createElement('div');
    this.roomListStatus.className = 'room-section-hint room-browser-status';
    this.roomListStatus.textContent = 'Sign in to load persisted rooms.';

    this.roomList = document.createElement('div');
    this.roomList.className = 'room-browser-list';

    listHeader.append(listTitle, this.roomListStatus);
    listSection.append(listHeader, this.roomList);

    this.form.append(
      roomSlugLabel,
      this.roomInput,
      displayNameLabel,
      this.nameInput,
      joinButton,
      helper,
    );
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitRoomJoin(this.roomInput.value.trim() || this.generatedRoomSlug);
    });

    formSection.append(formHeader, this.form);
    this.container.append(title, formSection, listSection, this.statusLabel, this.metaLabel);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  applyPreferenceDefaults(values: Partial<RoomPanelValues>): void {
    if (values.displayName !== undefined) {
      const nextDisplayName = values.displayName.trim();
      if (nextDisplayName) {
        this.nameInput.value = nextDisplayName;
      }
    }

    if (values.roomSlug !== undefined && !this.hasUrlRoom) {
      const nextRoomSlug = values.roomSlug.trim();
      if (nextRoomSlug) {
        this.roomInput.value = nextRoomSlug;
      }
    }
  }

  setStatus(message: string): void {
    this.statusLabel.textContent = message;
  }

  setMeta(message: string): void {
    this.metaLabel.textContent = message;
  }

  setRoomListLoading(message = 'Loading rooms...'): void {
    this.roomListStatus.textContent = message;
    this.roomList.replaceChildren();
  }

  setRoomListSignedOut(message = 'Sign in to load persisted rooms.'): void {
    this.roomListStatus.textContent = message;
    this.roomList.replaceChildren();
  }

  setRoomListError(message = 'Unable to load rooms right now.'): void {
    this.roomListStatus.textContent = message;
    this.roomList.replaceChildren();
  }

  setRooms(rooms: RoomSummary[], activeRoomSlug?: string | null): void {
    this.roomList.replaceChildren();

    if (rooms.length === 0) {
      this.roomListStatus.textContent = 'No persisted rooms yet.';
      return;
    }

    this.roomListStatus.textContent = `${rooms.length} room${rooms.length === 1 ? '' : 's'} available`;
    const rows = rooms.slice(0, 8).map((room) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'room-browser-item';
      if (activeRoomSlug && room.slug === activeRoomSlug) {
        button.dataset.active = 'true';
      }

      const title = document.createElement('div');
      title.className = 'room-browser-item-title';
      title.textContent = room.name;

      const badges = document.createElement('div');
      badges.className = 'room-browser-item-badges';

      const capacityBadge = document.createElement('span');
      capacityBadge.className = 'room-browser-badge';
      capacityBadge.textContent = `max ${room.maxUsers}`;
      badges.appendChild(capacityBadge);

      if (room.isLocked) {
        const lockedBadge = document.createElement('span');
        lockedBadge.className = 'room-browser-badge is-warn';
        lockedBadge.textContent = 'Locked';
        badges.appendChild(lockedBadge);
      }

      if (room.isPrivate) {
        const privateBadge = document.createElement('span');
        privateBadge.className = 'room-browser-badge';
        privateBadge.textContent = 'Private';
        badges.appendChild(privateBadge);
      }

      const slug = document.createElement('div');
      slug.className = 'room-browser-item-slug';
      slug.textContent = room.slug;

      const meta = document.createElement('div');
      meta.className = 'room-browser-item-meta';
      meta.textContent = formatRoomTimestamp(room);

      button.append(title, badges, slug, meta);
      button.addEventListener('click', () => {
        this.roomInput.value = room.slug;
        this.submitRoomJoin(room.slug);
      });
      return button;
    });

    this.roomList.replaceChildren(...rows);
  }

  private submitRoomJoin(roomSlug: string): void {
    const values = {
      roomSlug,
      displayName: resolveDisplayName(this.nameInput),
    };

    localStorage.setItem(STORAGE_KEYS.lastRoomSlug, values.roomSlug);
    localStorage.setItem(STORAGE_KEYS.displayName, values.displayName);
    this.onJoin(values);
  }
}
