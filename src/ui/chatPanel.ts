import type { ChatMessage } from '../types/chat';
import type { RoomRole, RoomSurfaceId } from '../types/room';

type ChatPanelOptions = {
  onSend: (body: string) => void;
  onUploadSurface: (surfaceId: RoomSurfaceId, file: File) => Promise<void>;
};

const SURFACE_IDS: RoomSurfaceId[] = ['image01', 'image02', 'image03', 'image04'];

export class ChatPanel {
  private readonly container: HTMLDivElement;
  private readonly log: HTMLDivElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly surfaceSection: HTMLDivElement;
  private readonly surfaceSelect: HTMLSelectElement;
  private readonly surfaceFileInput: HTMLInputElement;
  private readonly surfaceUploadButton: HTMLButtonElement;
  private readonly surfaceHelper: HTMLDivElement;
  private readonly onSend: (body: string) => void;
  private readonly onUploadSurface: (surfaceId: RoomSurfaceId, file: File) => Promise<void>;
  private surfaceUploadEnabled = false;

  constructor(options: ChatPanelOptions) {
    this.onSend = options.onSend;
    this.onUploadSurface = options.onUploadSurface;
    this.container = document.createElement('div');
    this.container.id = 'chat-panel';
    this.container.className = 'musicspace-panel musicspace-panel--utility';

    const header = document.createElement('div');
    header.className = 'panel-header';

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Chat';

    const status = document.createElement('div');
    status.className = 'panel-meta';
    status.textContent = 'Room messages';

    this.log = document.createElement('div');
    this.log.className = 'chat-log';

    this.form = document.createElement('form');
    this.form.className = 'chat-form';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Message the room';
    this.input.className = 'chat-input';

    const sendButton = document.createElement('button');
    sendButton.type = 'submit';
    sendButton.textContent = 'Send';
    sendButton.className = 'chat-send-button';

    this.form.append(this.input, sendButton);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = this.input.value.trim();
      if (!body) {
        return;
      }

      this.onSend(body);
      this.input.value = '';
    });

    this.surfaceSection = document.createElement('div');
    this.surfaceSection.className = 'chat-surface-section';

    const surfaceTitle = document.createElement('div');
    surfaceTitle.className = 'chat-surface-title';
    surfaceTitle.textContent = 'Shared surfaces';

    this.surfaceHelper = document.createElement('div');
    this.surfaceHelper.className = 'chat-surface-helper';
    this.surfaceHelper.textContent = 'Owner/admin can replace image01-image04 for everyone in the room.';

    const surfaceControls = document.createElement('div');
    surfaceControls.className = 'chat-surface-controls';

    this.surfaceSelect = document.createElement('select');
    this.surfaceSelect.className = 'chat-surface-select';
    SURFACE_IDS.forEach((surfaceId) => {
      const option = document.createElement('option');
      option.value = surfaceId;
      option.textContent = surfaceId;
      this.surfaceSelect.appendChild(option);
    });

    this.surfaceFileInput = document.createElement('input');
    this.surfaceFileInput.type = 'file';
    this.surfaceFileInput.accept = 'image/png,image/jpeg,image/webp';
    this.surfaceFileInput.className = 'chat-surface-file';

    this.surfaceUploadButton = document.createElement('button');
    this.surfaceUploadButton.type = 'button';
    this.surfaceUploadButton.textContent = 'Upload';
    this.surfaceUploadButton.className = 'chat-surface-upload-button';
    this.surfaceUploadButton.addEventListener('click', () => {
      void this.handleSurfaceUpload();
    });

    surfaceControls.append(this.surfaceSelect, this.surfaceFileInput, this.surfaceUploadButton);
    this.surfaceSection.append(surfaceTitle, this.surfaceHelper, surfaceControls);

    header.append(title, status);
    this.container.append(header, this.log, this.form, this.surfaceSection);
    this.setSurfaceUploadState(null);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  setMessages(messages: ChatMessage[]): void {
    this.log.replaceChildren(...messages.map((message) => this.createMessageRow(message)));
    this.log.scrollTop = this.log.scrollHeight;
  }

  appendMessage(message: ChatMessage): void {
    this.log.appendChild(this.createMessageRow(message));
    this.log.scrollTop = this.log.scrollHeight;
  }

  setSurfaceUploadState(role: RoomRole | null): void {
    const enabled = role === 'owner' || role === 'admin';
    this.surfaceUploadEnabled = enabled;
    this.surfaceSection.style.display = enabled ? 'grid' : 'none';
    this.surfaceSelect.disabled = !enabled;
    this.surfaceFileInput.disabled = !enabled;
    this.surfaceUploadButton.disabled = !enabled;
    this.surfaceHelper.textContent = enabled
      ? 'Upload PNG, JPG, or WebP to replace image01-image04 for everyone in the room.'
      : 'Owner/admin can replace image01-image04 for everyone in the room.';
    if (!enabled) {
      this.surfaceFileInput.value = '';
      this.surfaceUploadButton.textContent = 'Upload';
    }
  }

  private async handleSurfaceUpload(): Promise<void> {
    if (!this.surfaceUploadEnabled) {
      return;
    }

    const file = this.surfaceFileInput.files?.[0];
    if (!file) {
      this.surfaceHelper.textContent = 'Choose an image before uploading.';
      return;
    }

    const surfaceId = this.surfaceSelect.value as RoomSurfaceId;
    this.surfaceUploadButton.disabled = true;
    this.surfaceSelect.disabled = true;
    this.surfaceFileInput.disabled = true;
    this.surfaceUploadButton.textContent = 'Uploading...';
    this.surfaceHelper.textContent = `Uploading ${file.name} to ${surfaceId}...`;

    try {
      await this.onUploadSurface(surfaceId, file);
      this.surfaceHelper.textContent = `${surfaceId} updated for the room.`;
      this.surfaceFileInput.value = '';
    } catch (error) {
      this.surfaceHelper.textContent = getErrorMessage(error, 'Unable to upload that image right now.');
    } finally {
      this.surfaceUploadButton.disabled = !this.surfaceUploadEnabled;
      this.surfaceSelect.disabled = !this.surfaceUploadEnabled;
      this.surfaceFileInput.disabled = !this.surfaceUploadEnabled;
      this.surfaceUploadButton.textContent = 'Upload';
    }
  }

  private createMessageRow(message: ChatMessage): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'chat-message';
    row.innerHTML = `<strong>${message.displayName}:</strong> ${message.body}`;
    return row;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
