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

type RoomSortMode = 'recent' | 'name';

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
  private readonly roomFilterInput: HTMLInputElement;
  private readonly roomSortSelect: HTMLSelectElement;
  private readonly onJoin: (values: RoomPanelValues) => void;
  private readonly generatedRoomSlug: string;
  private readonly hasUrlRoom: boolean;
  private rooms: RoomSummary[] = [];
  private activeRoomSlug: string | null = null;

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

    const listControls = document.createElement('div');
    listControls.className = 'room-browser-controls';

    this.roomFilterInput = document.createElement('input');
    this.roomFilterInput.type = 'text';
    this.roomFilterInput.className = 'room-browser-filter';
    this.roomFilterInput.placeholder = 'Filter rooms';
    this.roomFilterInput.addEventListener('input', () => this.renderRooms());

    this.roomSortSelect = document.createElement('select');
    this.roomSortSelect.className = 'room-browser-sort';
    const recentOption = document.createElement('option');
    recentOption.value = 'recent';
    recentOption.textContent = 'Recent';
    const nameOption = document.createElement('option');
    nameOption.value = 'name';
    nameOption.textContent = 'Name';
    this.roomSortSelect.append(recentOption, nameOption);
    this.roomSortSelect.addEventListener('change', () => this.renderRooms());

    this.roomList = document.createElement('div');
    this.roomList.className = 'room-browser-list';

    listHeader.append(listTitle, this.roomListStatus);
    listControls.append(this.roomFilterInput, this.roomSortSelect);
    listSection.append(listHeader, listControls, this.roomList);

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
    this.rooms = [];
    this.roomListStatus.textContent = message;
    this.roomFilterInput.value = '';
    this.roomList.replaceChildren();
  }

  setRoomListSignedOut(message = 'Sign in to load persisted rooms.'): void {
    this.rooms = [];
    this.roomListStatus.textContent = message;
    this.roomFilterInput.value = '';
    this.roomList.replaceChildren();
  }

  setRoomListError(message = 'Unable to load rooms right now.'): void {
    this.rooms = [];
    this.roomListStatus.textContent = message;
    this.roomFilterInput.value = '';
    this.roomList.replaceChildren();
  }

  setRooms(rooms: RoomSummary[], activeRoomSlug?: string | null): void {
    this.rooms = [...rooms];
    this.activeRoomSlug = activeRoomSlug ?? null;
    this.renderRooms();
  }

  private renderRooms(): void {
    this.roomList.replaceChildren();

    if (this.rooms.length === 0) {
      this.roomListStatus.textContent = 'No persisted rooms yet.';
      return;
    }

    const query = this.roomFilterInput.value.trim().toLowerCase();
    const sortMode = this.roomSortSelect.value === 'name' ? 'name' : 'recent';
    const filteredRooms = this.rooms
      .filter((room) => {
        if (!query) {
          return true;
        }

        return room.name.toLowerCase().includes(query) || room.slug.toLowerCase().includes(query);
      })
      .sort((left, right) => compareRooms(left, right, sortMode));

    if (filteredRooms.length === 0) {
      this.roomListStatus.textContent = `No rooms match "${this.roomFilterInput.value.trim()}".`;
      return;
    }

    this.roomListStatus.textContent = `${filteredRooms.length} room${filteredRooms.length === 1 ? '' : 's'} available`;
    const rows = filteredRooms.slice(0, 12).map((room) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'room-browser-item';
      if (this.activeRoomSlug && room.slug === this.activeRoomSlug) {
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

      const actions = document.createElement('div');
      actions.className = 'room-browser-actions';

      const joinAction = document.createElement('span');
      joinAction.className = 'room-browser-action-link';
      joinAction.textContent = 'Join';

      const shareButton = document.createElement('button');
      shareButton.type = 'button';
      shareButton.className = 'room-browser-share-button';
      shareButton.textContent = 'Copy link';
      shareButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        await copyRoomLink(room.slug, shareButton);
      });

      actions.append(joinAction, shareButton);
      button.append(title, badges, slug, meta, actions);
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

function compareRooms(left: RoomSummary, right: RoomSummary, sortMode: RoomSortMode): number {
  if (sortMode === 'name') {
    return left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug);
  }

  const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? '') || 0;
  const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? '') || 0;
  return rightTime - leftTime || left.name.localeCompare(right.name);
}

async function copyRoomLink(roomSlug: string, trigger: HTMLButtonElement): Promise<void> {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomSlug);

  const fallbackCopy = () => {
    const input = document.createElement('input');
    input.value = url.toString();
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  };

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url.toString());
    } else {
      fallbackCopy();
    }
    flashShareButton(trigger, 'Copied');
  } catch {
    try {
      fallbackCopy();
      flashShareButton(trigger, 'Copied');
    } catch {
      flashShareButton(trigger, 'Failed');
    }
  }
}

function flashShareButton(button: HTMLButtonElement, label: string): void {
  const previousLabel = button.textContent;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = previousLabel;
  }, 1200);
}
