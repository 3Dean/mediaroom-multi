import { STORAGE_KEYS } from '../app/config';

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

export class RoomPanel {
  private readonly container: HTMLDivElement;
  private readonly form: HTMLFormElement;
  private readonly roomInput: HTMLInputElement;
  private readonly nameInput: HTMLInputElement;
  private readonly statusLabel: HTMLDivElement;
  private readonly metaLabel: HTMLDivElement;
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
    title.style.marginBottom = '10px';

    this.form = document.createElement('form');
    this.form.style.display = 'grid';
    this.form.style.gap = '8px';

    this.roomInput = document.createElement('input');
    this.roomInput.type = 'text';
    this.roomInput.placeholder = 'Room slug';
    this.roomInput.value = options.initialRoomSlug?.trim() || this.generatedRoomSlug;

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.placeholder = 'Display name';
    this.nameInput.value = options.initialDisplayName?.trim() || localStorage.getItem(STORAGE_KEYS.displayName) || '';

    const joinButton = document.createElement('button');
    joinButton.type = 'submit';
    joinButton.textContent = 'Enter Room';

    this.statusLabel = document.createElement('div');
    this.statusLabel.style.color = '#c8c8c8';
    this.statusLabel.style.fontSize = '12px';
    this.statusLabel.textContent = 'Multiplayer wiring will attach here.';

    this.metaLabel = document.createElement('div');
    this.metaLabel.style.color = '#9bd5ff';
    this.metaLabel.style.fontSize = '12px';
    this.metaLabel.textContent = 'Connection idle';

    this.form.append(this.roomInput, this.nameInput, joinButton);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {
        roomSlug: this.roomInput.value.trim() || this.generatedRoomSlug,
        displayName: this.nameInput.value.trim() || 'Guest',
      };

      localStorage.setItem(STORAGE_KEYS.lastRoomSlug, values.roomSlug);
      localStorage.setItem(STORAGE_KEYS.displayName, values.displayName);
      this.onJoin(values);
    });

    this.container.append(title, this.form, this.statusLabel, this.metaLabel);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  applyPreferenceDefaults(values: Partial<RoomPanelValues>): void {
    if (values.displayName !== undefined) {
      this.nameInput.value = values.displayName;
    }

    if (values.roomSlug !== undefined && !this.hasUrlRoom) {
      this.roomInput.value = values.roomSlug.trim() || this.generatedRoomSlug;
    }
  }

  setStatus(message: string): void {
    this.statusLabel.textContent = message;
  }

  setMeta(message: string): void {
    this.metaLabel.textContent = message;
  }
}
