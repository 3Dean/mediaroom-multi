import type { ChatMessage } from '../types/chat';
import type { RoomRole, RoomSurfaceId } from '../types/room';
import { createSectionIcon } from './sectionIcons';

type ChatPanelOptions = {
  onSend: (body: string) => void;
  onUploadSurface: (surfaceId: RoomSurfaceId, file: File) => Promise<void>;
  onSetTvMedia: (sourceUrl: string | null) => Promise<void>;
  onUploadTvMedia: (file: File) => Promise<void>;
  onSetTvPlayback: (isPlaying: boolean, currentTime: number) => Promise<void>;
};

const SURFACE_IDS: RoomSurfaceId[] = ['image01', 'image02', 'image03', 'image04'];

export class ChatPanel {
  private readonly container: HTMLDivElement;
  private readonly sharedMediaContainer: HTMLDetailsElement;
  private readonly log: HTMLDivElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly surfaceSection: HTMLDivElement;
  private readonly surfaceSelect: HTMLSelectElement;
  private readonly surfaceFileInput: HTMLInputElement;
  private readonly surfaceUploadButton: HTMLButtonElement;
  private readonly surfaceHelper: HTMLDivElement;
  private readonly tvSection: HTMLDivElement;
  private readonly tvInput: HTMLInputElement;
  private readonly tvFileInput: HTMLInputElement;
  private readonly tvUploadButton: HTMLButtonElement;
  private readonly tvClearButton: HTMLButtonElement;
  private readonly tvTogglePlaybackButton: HTMLButtonElement;
  private readonly tvSeekInput: HTMLInputElement;
  private readonly tvSeekButton: HTMLButtonElement;
  private readonly tvHelper: HTMLDivElement;
  private readonly onSend: (body: string) => void;
  private readonly onUploadSurface: (surfaceId: RoomSurfaceId, file: File) => Promise<void>;
  private readonly onSetTvMedia: (sourceUrl: string | null) => Promise<void>;
  private readonly onUploadTvMedia: (file: File) => Promise<void>;
  private readonly onSetTvPlayback: (isPlaying: boolean, currentTime: number) => Promise<void>;
  private surfaceUploadEnabled = false;
  private surfaceUploadVisible = false;
  private tvEnabled = false;
  private tvVisible = false;
  private tvIsPlaying = false;

  constructor(options: ChatPanelOptions) {
    this.onSend = options.onSend;
    this.onUploadSurface = options.onUploadSurface;
    this.onSetTvMedia = options.onSetTvMedia;
    this.onUploadTvMedia = options.onUploadTvMedia;
    this.onSetTvPlayback = options.onSetTvPlayback;

    this.container = document.createElement('div');
    this.container.id = 'chat-panel';
    this.container.className = 'musicspace-card musicspace-card--chat';

    const header = document.createElement('div');
    header.className = 'musicspace-card-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'musicspace-card-title-wrap';

    const title = document.createElement('h2');
    title.className = 'musicspace-card-title';
    title.textContent = 'Chat';
    titleWrap.append(createSectionIcon('chat'), title);

    const status = document.createElement('div');
    status.className = 'musicspace-card-meta';
    status.textContent = 'Room messages';

    this.log = document.createElement('div');
    this.log.className = 'chat-log';

    this.form = document.createElement('form');
    this.form.className = 'chat-form';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Message the room';
    this.input.className = 'musicspace-input chat-input';

    const sendButton = document.createElement('button');
    sendButton.type = 'submit';
    sendButton.textContent = 'Send';
    sendButton.className = 'musicspace-button musicspace-button--primary';

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

    header.append(titleWrap, status);
    this.container.append(header, this.log, this.form);

    this.sharedMediaContainer = document.createElement('details');
    this.sharedMediaContainer.id = 'shared-media-panel';
    this.sharedMediaContainer.className = 'musicspace-accordion musicspace-card--media-alt';

    const sharedMediaSummary = document.createElement('summary');
    sharedMediaSummary.className = 'musicspace-accordion-summary';

    const sharedMediaTitle = document.createElement('span');
    sharedMediaTitle.className = 'musicspace-accordion-title-wrap';
    const sharedMediaLabel = document.createElement('span');
    sharedMediaLabel.textContent = 'Shared Media';
    sharedMediaTitle.append(createSectionIcon('shared'), sharedMediaLabel);

    const sharedMediaMeta = document.createElement('span');
    sharedMediaMeta.className = 'musicspace-accordion-meta';
    sharedMediaMeta.textContent = 'Saved rooms only';

    sharedMediaSummary.append(sharedMediaTitle, sharedMediaMeta);

    const sharedMediaBody = document.createElement('div');
    sharedMediaBody.className = 'musicspace-accordion-body';

    this.surfaceSection = document.createElement('div');
    this.surfaceSection.className = 'musicspace-subsection chat-surface-section';

    const surfaceTitle = document.createElement('div');
    surfaceTitle.className = 'musicspace-subsection-title chat-surface-title';
    surfaceTitle.textContent = 'Shared Surfaces';

    this.surfaceHelper = document.createElement('div');
    this.surfaceHelper.className = 'musicspace-helper-text chat-surface-helper';
    this.surfaceHelper.textContent = 'Owner/admin can replace image01-image04 for everyone in the room.';

    const surfaceControls = document.createElement('div');
    surfaceControls.className = 'chat-surface-controls';

    this.surfaceSelect = document.createElement('select');
    this.surfaceSelect.className = 'musicspace-input chat-surface-select';
    SURFACE_IDS.forEach((surfaceId) => {
      const option = document.createElement('option');
      option.value = surfaceId;
      option.textContent = surfaceId;
      this.surfaceSelect.appendChild(option);
    });

    this.surfaceFileInput = document.createElement('input');
    this.surfaceFileInput.type = 'file';
    this.surfaceFileInput.accept = 'image/png,image/jpeg,image/webp';
    this.surfaceFileInput.className = 'musicspace-input chat-surface-file';

    this.surfaceUploadButton = document.createElement('button');
    this.surfaceUploadButton.type = 'button';
    this.surfaceUploadButton.textContent = 'Upload';
    this.surfaceUploadButton.className = 'musicspace-button musicspace-button--primary musicspace-button--block chat-surface-upload-button';
    this.surfaceUploadButton.addEventListener('click', () => {
      void this.handleSurfaceUpload();
    });

    surfaceControls.append(this.surfaceSelect, this.surfaceFileInput, this.surfaceUploadButton);
    this.surfaceSection.append(surfaceTitle, this.surfaceHelper, surfaceControls);

    this.tvSection = document.createElement('div');
    this.tvSection.className = 'musicspace-subsection chat-surface-section';

    const tvTitle = document.createElement('div');
    tvTitle.className = 'musicspace-subsection-title chat-surface-title';
    tvTitle.textContent = 'Shared TV';

    this.tvHelper = document.createElement('div');
    this.tvHelper.className = 'musicspace-helper-text chat-surface-helper';
    this.tvHelper.textContent = 'Owner/admin can upload an MP4 for the shared TV.';

    const tvControls = document.createElement('div');
    tvControls.className = 'chat-tv-upload-controls';
    const tvUploadActions = document.createElement('div');
    tvUploadActions.className = 'chat-tv-upload-actions';

    this.tvInput = document.createElement('input');
    this.tvInput.type = 'hidden';
    this.tvInput.className = 'chat-tv-input';

    this.tvFileInput = document.createElement('input');
    this.tvFileInput.type = 'file';
    this.tvFileInput.accept = 'video/mp4';
    this.tvFileInput.className = 'musicspace-input chat-surface-file';

    this.tvClearButton = document.createElement('button');
    this.tvClearButton.type = 'button';
    this.tvClearButton.textContent = 'Clear';
    this.tvClearButton.className = 'musicspace-button musicspace-button--secondary';
    this.tvClearButton.addEventListener('click', () => {
      void this.handleTvMediaUpdate(null);
    });

    this.tvUploadButton = document.createElement('button');
    this.tvUploadButton.type = 'button';
    this.tvUploadButton.textContent = 'Upload';
    this.tvUploadButton.className = 'musicspace-button musicspace-button--secondary musicspace-button--block chat-tv-upload-button';
    this.tvUploadButton.addEventListener('click', () => {
      void this.handleTvUpload();
    });

    tvControls.append(this.tvFileInput);
    tvUploadActions.append(this.tvUploadButton, this.tvClearButton);

    const tvPlaybackControls = document.createElement('div');
    tvPlaybackControls.className = 'chat-tv-controls';

    this.tvTogglePlaybackButton = document.createElement('button');
    this.tvTogglePlaybackButton.type = 'button';
    this.tvTogglePlaybackButton.textContent = 'Play';
    this.tvTogglePlaybackButton.className = 'musicspace-button musicspace-button--secondary';
    this.tvTogglePlaybackButton.addEventListener('click', () => {
      void this.handleTvPlaybackUpdate(!this.tvIsPlaying);
    });

    this.tvSeekInput = document.createElement('input');
    this.tvSeekInput.type = 'number';
    this.tvSeekInput.min = '0';
    this.tvSeekInput.step = '0.1';
    this.tvSeekInput.placeholder = '0';
    this.tvSeekInput.className = 'musicspace-input musicspace-input--small chat-tv-input';

    const tvSeekLabel = document.createElement('div');
    tvSeekLabel.className = 'musicspace-inline-unit chat-tv-seek-label';
    tvSeekLabel.textContent = 'Seconds';

    this.tvSeekButton = document.createElement('button');
    this.tvSeekButton.type = 'button';
    this.tvSeekButton.textContent = 'Seek';
    this.tvSeekButton.className = 'musicspace-button musicspace-button--secondary';
    this.tvSeekButton.addEventListener('click', () => {
      void this.handleTvSeekUpdate();
    });

    tvPlaybackControls.append(this.tvTogglePlaybackButton, this.tvSeekInput, tvSeekLabel, this.tvSeekButton);
    this.tvSection.append(tvTitle, this.tvHelper, tvControls, tvUploadActions, tvPlaybackControls);

    sharedMediaBody.append(this.surfaceSection, this.tvSection);
    this.sharedMediaContainer.append(sharedMediaSummary, sharedMediaBody);
    this.sharedMediaContainer.open = false;

    this.setSurfaceUploadState(null, false);
    this.setTvMediaState(null, false, null);
  }

  mount(parent: HTMLElement = document.body, advancedParent: HTMLElement = parent): void {
    parent.appendChild(this.container);
    advancedParent.appendChild(this.sharedMediaContainer);
  }

  setMessages(messages: ChatMessage[]): void {
    this.log.replaceChildren(...messages.map((message) => this.createMessageRow(message)));
    this.log.scrollTop = this.log.scrollHeight;
  }

  appendMessage(message: ChatMessage): void {
    this.log.appendChild(this.createMessageRow(message));
    this.log.scrollTop = this.log.scrollHeight;
  }

  setSurfaceUploadState(role: RoomRole | null, isPersistedRoom: boolean): void {
    const canManageSurfaces = role === 'owner' || role === 'admin';
    const visible = canManageSurfaces || !isPersistedRoom;
    const enabled = canManageSurfaces && isPersistedRoom;
    this.surfaceUploadVisible = visible;
    this.surfaceUploadEnabled = enabled;
    this.surfaceSection.style.display = visible ? 'grid' : 'none';
    this.surfaceSelect.disabled = !enabled;
    this.surfaceFileInput.disabled = !enabled;
    this.surfaceUploadButton.disabled = !enabled;
    if (enabled) {
      this.surfaceHelper.textContent = 'Upload PNG, JPG, or WebP to replace image01-image04 for everyone in the room.';
    } else if (!isPersistedRoom) {
      this.surfaceHelper.textContent = 'Shared surfaces are available only in saved rooms. Sign in and create the room to enable them.';
    } else {
      this.surfaceHelper.textContent = 'Owner/admin can replace image01-image04 for everyone in the room.';
    }
    if (!enabled) {
      this.surfaceFileInput.value = '';
      this.surfaceUploadButton.textContent = 'Upload';
    }
  }

  setTvMediaState(role: RoomRole | null, isPersistedRoom: boolean, sourceUrl: string | null, isPlaying = false, currentTime = 0): void {
    const canManageTv = role === 'owner' || role === 'admin';
    const visible = canManageTv || !isPersistedRoom;
    const enabled = canManageTv && isPersistedRoom;
    this.tvVisible = visible;
    this.tvEnabled = enabled;
    this.tvIsPlaying = isPlaying;
    this.tvSection.style.display = visible ? 'grid' : 'none';
    this.tvFileInput.disabled = !enabled;
    this.tvUploadButton.disabled = !enabled;
    this.tvClearButton.disabled = !enabled;
    this.tvTogglePlaybackButton.disabled = !enabled || !sourceUrl;
    this.tvTogglePlaybackButton.textContent = isPlaying ? 'Pause' : 'Play';
    this.tvSeekInput.disabled = !enabled || !sourceUrl;
    this.tvSeekButton.disabled = !enabled || !sourceUrl;
    this.tvInput.value = sourceUrl ?? '';
    this.tvSeekInput.value = sourceUrl ? String(Math.max(0, Number.isFinite(currentTime) ? currentTime : 0)) : '';
    if (enabled) {
      this.tvHelper.textContent = sourceUrl
        ? `Shared TV is ${isPlaying ? 'playing' : 'paused'} at ${Math.max(0, Number.isFinite(currentTime) ? currentTime : 0).toFixed(1)}s.`
        : 'Owner/admin can upload an MP4 for the shared TV.';
    } else if (!isPersistedRoom) {
      this.tvHelper.textContent = 'Shared TV is available only in saved rooms. Sign in and create the room to enable it.';
    } else {
      this.tvHelper.textContent = 'Owner/admin can control the shared TV video source.';
    }
  }

  private async handleSurfaceUpload(): Promise<void> {
    if (!this.surfaceUploadEnabled) {
      if (this.surfaceUploadVisible) {
        this.surfaceHelper.textContent = 'Shared surfaces are available only to owner/admin in saved rooms.';
      }
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

  private async handleTvMediaUpdate(sourceUrl: string | null): Promise<void> {
    if (!this.tvEnabled) {
      if (this.tvVisible) {
        this.tvHelper.textContent = 'Shared TV is available only to owner/admin in saved rooms.';
      }
      return;
    }

    if (sourceUrl && !sourceUrl.trim()) {
      this.tvHelper.textContent = 'Enter a video URL or path before setting the shared TV.';
      return;
    }

    this.tvFileInput.disabled = true;
    this.tvUploadButton.disabled = true;
    this.tvClearButton.disabled = true;
    this.tvTogglePlaybackButton.disabled = true;
    this.tvSeekInput.disabled = true;
    this.tvSeekButton.disabled = true;
    this.tvHelper.textContent = sourceUrl ? 'Updating shared TV...' : 'Clearing shared TV...';

    try {
      await this.onSetTvMedia(sourceUrl);
      this.tvHelper.textContent = sourceUrl
        ? 'Shared TV updated for the room.'
        : 'Shared TV cleared. Visualizer restored.';
    } catch (error) {
      this.tvHelper.textContent = getErrorMessage(error, 'Unable to update the shared TV right now.');
    } finally {
      this.tvFileInput.disabled = !this.tvEnabled;
      this.tvUploadButton.disabled = !this.tvEnabled;
      this.tvClearButton.disabled = !this.tvEnabled;
      const hasSource = Boolean(this.tvInput.value.trim());
      this.tvTogglePlaybackButton.disabled = !this.tvEnabled || !hasSource;
      this.tvSeekInput.disabled = !this.tvEnabled || !hasSource;
      this.tvSeekButton.disabled = !this.tvEnabled || !hasSource;
    }
  }

  private async handleTvUpload(): Promise<void> {
    if (!this.tvEnabled) {
      if (this.tvVisible) {
        this.tvHelper.textContent = 'Shared TV is available only to owner/admin in saved rooms.';
      }
      return;
    }

    const file = this.tvFileInput.files?.[0];
    if (!file) {
      this.tvHelper.textContent = 'Choose an MP4 before uploading.';
      return;
    }

    this.tvFileInput.disabled = true;
    this.tvUploadButton.disabled = true;
    this.tvClearButton.disabled = true;
    this.tvTogglePlaybackButton.disabled = true;
    this.tvSeekInput.disabled = true;
    this.tvSeekButton.disabled = true;
    this.tvHelper.textContent = `Uploading ${file.name} for the shared TV...`;

    try {
      await this.onUploadTvMedia(file);
      this.tvHelper.textContent = `${file.name} uploaded for the shared TV.`;
      this.tvFileInput.value = '';
    } catch (error) {
      this.tvHelper.textContent = getErrorMessage(error, 'Unable to upload that TV video right now.');
    } finally {
      this.tvFileInput.disabled = !this.tvEnabled;
      this.tvUploadButton.disabled = !this.tvEnabled;
      this.tvClearButton.disabled = !this.tvEnabled;
      const hasSource = Boolean(this.tvInput.value.trim());
      this.tvTogglePlaybackButton.disabled = !this.tvEnabled || !hasSource;
      this.tvSeekInput.disabled = !this.tvEnabled || !hasSource;
      this.tvSeekButton.disabled = !this.tvEnabled || !hasSource;
    }
  }

  private async handleTvPlaybackUpdate(isPlaying: boolean): Promise<void> {
    if (!this.tvEnabled || !this.tvInput.value.trim()) {
      return;
    }

    const currentTime = parseFloat(this.tvSeekInput.value || '0');
    this.tvHelper.textContent = isPlaying ? 'Resuming shared TV...' : 'Pausing shared TV...';
    try {
      await this.onSetTvPlayback(isPlaying, Number.isFinite(currentTime) ? currentTime : 0);
    } catch (error) {
      this.tvHelper.textContent = getErrorMessage(error, 'Unable to update shared TV playback right now.');
    }
  }

  private async handleTvSeekUpdate(): Promise<void> {
    if (!this.tvEnabled || !this.tvInput.value.trim()) {
      return;
    }

    const currentTime = parseFloat(this.tvSeekInput.value || '0');
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      this.tvHelper.textContent = 'Enter a valid seek time in seconds.';
      return;
    }

    this.tvHelper.textContent = `Seeking shared TV to ${currentTime.toFixed(1)}s...`;
    try {
      await this.onSetTvPlayback(this.tvIsPlaying, currentTime);
    } catch (error) {
      this.tvHelper.textContent = getErrorMessage(error, 'Unable to seek shared TV right now.');
    }
  }

  private createMessageRow(message: ChatMessage): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'chat-message';
    const name = document.createElement('strong');
    name.textContent = `${message.displayName}: `;
    row.append(name, message.body);
    return row;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}




