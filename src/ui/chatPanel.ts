import type { ChatMessage } from '../types/chat';
import type { RoomMediaAsset, RoomMediaAssetKind, RoomMediaUsage, RoomRole, RoomSurfaceId } from '../types/room';
import { createSectionIcon } from './sectionIcons';

type ChatPanelOptions = {
  onSend: (body: string) => void;
  onUploadSurface: (file: File) => Promise<void>;
  onSetTvMedia: (sourceUrl: string | null) => Promise<void>;
  onUploadTvMedia: (file: File) => Promise<void>;
  onSetTvPlayback: (isPlaying: boolean, currentTime: number) => Promise<void>;
  onListRoomMedia: (kind?: RoomMediaAssetKind) => Promise<{ assets: RoomMediaAsset[]; usage: RoomMediaUsage }>;
  onResolveRoomMediaUserLabels: (userIds: string[]) => Promise<Record<string, string>>;
  onUseRoomMediaAsset: (asset: RoomMediaAsset, target?: RoomSurfaceId) => Promise<void>;
  onClearRoomMediaAsset: (asset: RoomMediaAsset) => Promise<void>;
  onDeleteRoomMediaAsset: (asset: RoomMediaAsset) => Promise<void>;
};

function formatPlaybackTimecode(seconds: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatMediaBytes(bytes: number): string {
  const safeBytes = Math.max(0, Number(bytes) || 0);
  if (safeBytes >= 1024 * 1024 * 1024) {
    return `${(safeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (safeBytes >= 1024 * 1024) {
    return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (safeBytes >= 1024) {
    return `${Math.round(safeBytes / 1024)} KB`;
  }
  return `${safeBytes} B`;
}

function formatRelativeTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return 'Unknown date';
  }

  const deltaMs = Date.now() - timestamp;
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (deltaMs < minuteMs) {
    return 'just now';
  }
  if (deltaMs < hourMs) {
    return `${Math.max(1, Math.floor(deltaMs / minuteMs))}m ago`;
  }
  if (deltaMs < dayMs) {
    return `${Math.max(1, Math.floor(deltaMs / hourMs))}h ago`;
  }
  return `${Math.max(1, Math.floor(deltaMs / dayMs))}d ago`;
}

export class ChatPanel {
  private readonly container: HTMLDivElement;
  private readonly sharedMediaContainer: HTMLDetailsElement;
  private readonly log: HTMLDivElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly surfaceSection: HTMLDivElement;
  private readonly surfaceFileInput: HTMLInputElement;
  private readonly surfaceUploadButton: HTMLButtonElement;
  private readonly surfaceHelper: HTMLDivElement;
  private readonly tvSection: HTMLDivElement;
  private readonly roomMediaSection: HTMLDivElement;
  private readonly roomMediaUsageLabel: HTMLDivElement;
  private readonly roomMediaStatus: HTMLDivElement;
  private readonly roomMediaKindSelect: HTMLSelectElement;
  private readonly roomMediaList: HTMLDivElement;
  private readonly tvInput: HTMLInputElement;
  private readonly tvFileInput: HTMLInputElement;
  private readonly tvUploadButton: HTMLButtonElement;
  private readonly tvClearButton: HTMLButtonElement;
  private readonly tvTogglePlaybackButton: HTMLButtonElement;
  private readonly tvHelper: HTMLDivElement;
  private readonly onSend: (body: string) => void;
  private readonly onUploadSurface: (file: File) => Promise<void>;
  private readonly onSetTvMedia: (sourceUrl: string | null) => Promise<void>;
  private readonly onUploadTvMedia: (file: File) => Promise<void>;
  private readonly onSetTvPlayback: (isPlaying: boolean, currentTime: number) => Promise<void>;
  private readonly onListRoomMedia: (kind?: RoomMediaAssetKind) => Promise<{ assets: RoomMediaAsset[]; usage: RoomMediaUsage }>;
  private readonly onResolveRoomMediaUserLabels: (userIds: string[]) => Promise<Record<string, string>>;
  private readonly onUseRoomMediaAsset: (asset: RoomMediaAsset, target?: RoomSurfaceId) => Promise<void>;
  private readonly onClearRoomMediaAsset: (asset: RoomMediaAsset) => Promise<void>;
  private readonly onDeleteRoomMediaAsset: (asset: RoomMediaAsset) => Promise<void>;
  private surfaceUploadEnabled = false;
  private surfaceUploadVisible = false;
  private tvEnabled = false;
  private tvVisible = false;
  private tvIsPlaying = false;
  private tvCurrentTime = 0;
  private roomMediaEnabled = false;
  private roomMediaRoomId: string | null = null;
  private roomMediaAssets: RoomMediaAsset[] = [];
  private roomMediaUserLabels: Record<string, string> = {};
  private roomMediaLastKind: RoomMediaAssetKind = 'surface-image';
  private roomMediaLoadingPromise: Promise<void> | null = null;

  constructor(options: ChatPanelOptions) {
    this.onSend = options.onSend;
    this.onUploadSurface = options.onUploadSurface;
    this.onSetTvMedia = options.onSetTvMedia;
    this.onUploadTvMedia = options.onUploadTvMedia;
    this.onSetTvPlayback = options.onSetTvPlayback;
    this.onListRoomMedia = options.onListRoomMedia;
    this.onResolveRoomMediaUserLabels = options.onResolveRoomMediaUserLabels;
    this.onUseRoomMediaAsset = options.onUseRoomMediaAsset;
    this.onClearRoomMediaAsset = options.onClearRoomMediaAsset;
    this.onDeleteRoomMediaAsset = options.onDeleteRoomMediaAsset;

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
    this.surfaceHelper.textContent = "Owner/admin can upload PNG, JPG, or WebP to the room's media library.";

    const surfaceControls = document.createElement('div');
    surfaceControls.className = 'chat-surface-controls';

    this.surfaceFileInput = document.createElement('input');
    this.surfaceFileInput.type = 'file';
    this.surfaceFileInput.accept = 'image/png,image/jpeg,image/webp';
    this.surfaceFileInput.className = 'musicspace-input chat-surface-file';

    this.surfaceUploadButton = document.createElement('button');
    this.surfaceUploadButton.type = 'button';
    this.surfaceUploadButton.textContent = 'Upload to Library';
    this.surfaceUploadButton.className = 'musicspace-button musicspace-button--primary musicspace-button--block chat-surface-upload-button';
    this.surfaceUploadButton.addEventListener('click', () => {
      void this.handleSurfaceUpload();
    });

    surfaceControls.append(this.surfaceFileInput, this.surfaceUploadButton);
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
    this.tvUploadButton.className = 'musicspace-button musicspace-button--primary musicspace-button--block chat-tv-upload-button';
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
    this.tvTogglePlaybackButton.className = 'musicspace-button musicspace-button--secondary musicspace-button--block';
    this.tvTogglePlaybackButton.addEventListener('click', () => {
      void this.handleTvPlaybackUpdate(!this.tvIsPlaying);
    });

    tvPlaybackControls.append(this.tvTogglePlaybackButton);
    this.tvSection.append(tvTitle, this.tvHelper, tvControls, tvUploadActions, tvPlaybackControls);

    this.roomMediaSection = document.createElement('div');
    this.roomMediaSection.className = 'musicspace-subsection chat-surface-section';

    const roomMediaHeader = document.createElement('div');
    roomMediaHeader.className = 'chat-room-media-header';

    const roomMediaTitle = document.createElement('div');
    roomMediaTitle.className = 'musicspace-subsection-title chat-surface-title';
    roomMediaTitle.textContent = 'Room Media Library';

    this.roomMediaUsageLabel = document.createElement('div');
    this.roomMediaUsageLabel.className = 'musicspace-card-meta chat-room-media-usage';
    this.roomMediaUsageLabel.textContent = 'Storage usage unavailable';

    roomMediaHeader.append(roomMediaTitle, this.roomMediaUsageLabel);

    this.roomMediaStatus = document.createElement('div');
    this.roomMediaStatus.className = 'musicspace-helper-text chat-surface-helper';
    this.roomMediaStatus.textContent = 'Owner/admin can reuse or delete room media.';

    const roomMediaControls = document.createElement('div');
    roomMediaControls.className = 'room-browser-controls';

    this.roomMediaKindSelect = document.createElement('select');
    this.roomMediaKindSelect.className = 'musicspace-input musicspace-input--small room-browser-sort';
    const imageOption = document.createElement('option');
    imageOption.value = 'surface-image';
    imageOption.textContent = 'Images';
    const videoOption = document.createElement('option');
    videoOption.value = 'tv-video';
    videoOption.textContent = 'Videos';
    this.roomMediaKindSelect.append(imageOption, videoOption);
    this.roomMediaKindSelect.addEventListener('change', () => {
      this.roomMediaLastKind = this.getSelectedRoomMediaKind();
      void this.refreshRoomMediaLibrary();
    });
    roomMediaControls.append(this.roomMediaKindSelect);

    this.roomMediaList = document.createElement('div');
    this.roomMediaList.className = 'room-browser-list';

    this.roomMediaSection.append(roomMediaHeader, this.roomMediaStatus, roomMediaControls, this.roomMediaList);

    sharedMediaBody.append(this.surfaceSection, this.tvSection, this.roomMediaSection);
    this.sharedMediaContainer.append(sharedMediaSummary, sharedMediaBody);
    this.sharedMediaContainer.open = false;

    this.setSurfaceUploadState(null, false);
    this.setTvMediaState(null, false, null);
    this.setRoomMediaLibraryState(null, false, null);
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
    this.surfaceFileInput.disabled = !enabled;
    this.surfaceUploadButton.disabled = !enabled;
    if (enabled) {
      this.surfaceHelper.textContent = "Upload PNG, JPG, or WebP to this room's media library, then place images from the library cards below.";
    } else if (!isPersistedRoom) {
      this.surfaceHelper.textContent = 'Shared surfaces are available only in saved rooms. Sign in and create the room to enable them.';
    } else {
      this.surfaceHelper.textContent = "Owner/admin can upload images to the room's media library.";
    }
    if (!enabled) {
      this.surfaceFileInput.value = '';
      this.surfaceUploadButton.textContent = 'Upload to Library';
    }
  }

  setTvMediaState(role: RoomRole | null, isPersistedRoom: boolean, sourceUrl: string | null, isPlaying = false, currentTime = 0): void {
    const canManageTv = role === 'owner' || role === 'admin';
    const visible = canManageTv || !isPersistedRoom;
    const enabled = canManageTv && isPersistedRoom;
    this.tvVisible = visible;
    this.tvEnabled = enabled;
    this.tvIsPlaying = isPlaying;
    this.tvCurrentTime = Math.max(0, Number.isFinite(currentTime) ? currentTime : 0);
    this.tvSection.style.display = visible ? 'grid' : 'none';
    this.tvFileInput.disabled = !enabled;
    this.tvUploadButton.disabled = !enabled;
    this.tvClearButton.disabled = !enabled;
    this.tvTogglePlaybackButton.disabled = !enabled || !sourceUrl;
    this.tvTogglePlaybackButton.textContent = isPlaying ? 'Pause' : 'Play';
    this.tvInput.value = sourceUrl ?? '';
    if (enabled) {
      this.tvHelper.textContent = sourceUrl
        ? (isPlaying
          ? 'Shared TV is playing.'
          : `Shared TV is paused at ${formatPlaybackTimecode(currentTime)}.`)
        : 'Owner/admin can upload an MP4 for the shared TV.';
    } else if (!isPersistedRoom) {
      this.tvHelper.textContent = 'Shared TV is available only in saved rooms. Sign in and create the room to enable it.';
    } else {
      this.tvHelper.textContent = 'Owner/admin can control the shared TV video source.';
    }
  }

  setRoomMediaLibraryState(role: RoomRole | null, isPersistedRoom: boolean, roomId: string | null): void {
    const canManageMedia = role === 'owner' || role === 'admin';
    const visible = canManageMedia && isPersistedRoom;
    const enabled = canManageMedia && isPersistedRoom;
    const roomChanged = this.roomMediaRoomId !== roomId;
    const enabledChanged = this.roomMediaEnabled !== enabled;

    this.roomMediaEnabled = enabled;
    this.roomMediaRoomId = roomId;
    this.roomMediaSection.style.display = visible ? 'grid' : 'none';
    this.roomMediaKindSelect.disabled = !enabled;

    if (!visible) {
      this.roomMediaAssets = [];
      this.roomMediaUserLabels = {};
      this.roomMediaLoadingPromise = null;
      this.roomMediaUsageLabel.textContent = 'Storage usage unavailable';
      this.roomMediaStatus.textContent = 'Owner/admin can reuse or delete room media.';
      this.roomMediaList.replaceChildren();
      return;
    }

    if (roomChanged) {
      this.roomMediaAssets = [];
      this.roomMediaUserLabels = {};
      this.roomMediaLoadingPromise = null;
      this.roomMediaList.replaceChildren();
    }

    if ((roomChanged || enabledChanged) && enabled && roomId) {
      void this.refreshRoomMediaLibrary();
    }
  }

  private async refreshRoomMediaLibrary(): Promise<void> {
    if (!this.roomMediaEnabled || !this.roomMediaRoomId) {
      return;
    }

    if (this.roomMediaLoadingPromise) {
      return this.roomMediaLoadingPromise;
    }

    const kind = this.getSelectedRoomMediaKind();
    this.roomMediaLastKind = kind;
    this.roomMediaStatus.textContent = 'Loading room media...';
    this.roomMediaList.replaceChildren();
    this.roomMediaLoadingPromise = (async () => {
      try {
        const result = await this.onListRoomMedia(kind);
        if (!this.roomMediaEnabled || !this.roomMediaRoomId || this.roomMediaLastKind !== kind) {
          return;
        }
        this.roomMediaAssets = result.assets;
        this.roomMediaUserLabels = await this.onResolveRoomMediaUserLabels(result.assets.map((asset) => asset.createdBy));
        this.roomMediaUsageLabel.textContent = `${formatMediaBytes(result.usage.bytesUsed)} / ${formatMediaBytes(result.usage.byteLimit)} used`;
        this.roomMediaStatus.textContent = result.assets.length > 0
          ? `${result.assets.length} ${kind === 'tv-video' ? 'video' : 'image'} asset${result.assets.length === 1 ? '' : 's'}`
          : `No ${kind === 'tv-video' ? 'videos' : 'images'} uploaded for this room yet.`;
        this.renderRoomMediaLibrary();
      } catch (error) {
        this.roomMediaStatus.textContent = error instanceof Error ? error.message : 'Unable to load room media right now.';
        this.roomMediaList.replaceChildren();
      } finally {
        this.roomMediaLoadingPromise = null;
      }
    })();
    return this.roomMediaLoadingPromise;
  }

  private getSelectedRoomMediaKind(): RoomMediaAssetKind {
    return this.roomMediaKindSelect.value === 'tv-video' ? 'tv-video' : 'surface-image';
  }

  private applyOptimisticImagePlacement(assetId: string, surfaceId: RoomSurfaceId): void {
    this.roomMediaAssets = this.roomMediaAssets.map((asset) => {
      if (asset.kind !== 'surface-image') {
        return asset;
      }
      if (asset.id === assetId) {
        return {
          ...asset,
          inUseSurfaceIds: [surfaceId],
        };
      }
      if (asset.inUseSurfaceIds.includes(surfaceId)) {
        return {
          ...asset,
          inUseSurfaceIds: [],
        };
      }
      return asset;
    });
  }

  private clearOptimisticImagePlacement(assetId: string): void {
    this.roomMediaAssets = this.roomMediaAssets.map((asset) => asset.id === assetId
      ? {
          ...asset,
          inUseSurfaceIds: [],
        }
      : asset);
  }

  private renderRoomMediaLibrary(): void {
    if (this.roomMediaAssets.length === 0) {
      this.roomMediaList.replaceChildren();
      return;
    }

    const rows = this.roomMediaAssets.map((asset) => {
      const card = document.createElement('div');
      card.className = 'room-browser-item';

      const title = document.createElement('div');
      title.className = 'room-browser-item-title';
      title.textContent = asset.fileName;

      const slug = document.createElement('div');
      slug.className = 'room-browser-item-slug';
      slug.textContent = `${formatMediaBytes(asset.sizeBytes)} • ${formatRelativeTimestamp(asset.createdAt)}`;

      const meta = document.createElement('div');
      meta.className = 'room-browser-item-meta';
      const usageText = asset.kind === 'tv-video'
        ? (asset.inUseTv ? 'In use on TV' : 'Video asset')
        : (asset.inUseSurfaceIds.length > 0 ? `Placed on ${asset.inUseSurfaceIds[0]}` : 'Image asset');
      const uploaderLabel = this.roomMediaUserLabels[asset.createdBy] ?? asset.createdBy.slice(0, 8);
      meta.textContent = `${usageText} • uploader ${uploaderLabel}`;

      const actions = document.createElement('div');
      actions.className = 'room-browser-actions';

      if (asset.kind === 'surface-image') {
        (['image01', 'image02', 'image03', 'image04'] as RoomSurfaceId[]).forEach((surfaceId) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'musicspace-button musicspace-button--secondary musicspace-button--small';
          button.textContent = surfaceId;
          button.addEventListener('click', async (event) => {
            event.stopPropagation();
            try {
              this.roomMediaStatus.textContent = `Applying ${asset.fileName} to ${surfaceId}...`;
              await this.onUseRoomMediaAsset(asset, surfaceId);
              this.applyOptimisticImagePlacement(asset.id, surfaceId);
              this.roomMediaStatus.textContent = `${asset.fileName} applied to ${surfaceId}.`;
              this.renderRoomMediaLibrary();
              void this.refreshRoomMediaLibrarySoon();
            } catch (error) {
              this.roomMediaStatus.textContent = getErrorMessage(error, 'Unable to apply that image right now.');
            }
          });
          actions.appendChild(button);
        });

        if (asset.inUseSurfaceIds.length > 0) {
          const assignedSurfaceId = asset.inUseSurfaceIds[0];
          const clearButton = document.createElement('button');
          clearButton.type = 'button';
          clearButton.className = 'musicspace-button musicspace-button--secondary musicspace-button--small';
          clearButton.textContent = 'Clear';
          clearButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            try {
              this.roomMediaStatus.textContent = `Clearing ${asset.fileName} from ${assignedSurfaceId}...`;
              await this.onClearRoomMediaAsset(asset);
              this.clearOptimisticImagePlacement(asset.id);
              this.roomMediaStatus.textContent = `${asset.fileName} cleared from ${assignedSurfaceId}.`;
              this.renderRoomMediaLibrary();
              void this.refreshRoomMediaLibrarySoon();
            } catch (error) {
              this.roomMediaStatus.textContent = getErrorMessage(error, 'Unable to clear that image right now.');
            }
          });
          actions.appendChild(clearButton);
        }
      } else {
        const useButton = document.createElement('button');
        useButton.type = 'button';
        useButton.className = 'musicspace-button musicspace-button--secondary musicspace-button--small';
        useButton.textContent = 'Use on TV';
        useButton.addEventListener('click', async (event) => {
          event.stopPropagation();
          try {
            this.roomMediaStatus.textContent = `Applying ${asset.fileName} to the shared TV...`;
            await this.onUseRoomMediaAsset(asset);
            this.roomMediaStatus.textContent = `${asset.fileName} applied to the shared TV.`;
            await this.refreshRoomMediaLibrary();
          } catch (error) {
            this.roomMediaStatus.textContent = getErrorMessage(error, 'Unable to apply that video right now.');
          }
        });
        actions.appendChild(useButton);
      }

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'musicspace-button musicspace-button--danger musicspace-button--small';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        const confirmed = window.confirm(`Delete "${asset.fileName}"?${asset.inUseTv || asset.inUseSurfaceIds.length > 0 ? ' It is currently in use and will be cleared from the room.' : ''}`);
        if (!confirmed) {
          return;
        }
        try {
          this.roomMediaStatus.textContent = `Deleting ${asset.fileName}...`;
          await this.onDeleteRoomMediaAsset(asset);
          this.roomMediaStatus.textContent = `${asset.fileName} deleted.`;
          await this.refreshRoomMediaLibrary();
        } catch (error) {
          this.roomMediaStatus.textContent = getErrorMessage(error, 'Unable to delete that asset right now.');
        }
      });
      actions.appendChild(deleteButton);

      card.append(title, slug, meta, actions);
      return card;
    });

    this.roomMediaList.replaceChildren(...rows);
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

    this.surfaceUploadButton.disabled = true;
    this.surfaceFileInput.disabled = true;
    this.surfaceUploadButton.textContent = 'Uploading...';
    this.surfaceHelper.textContent = `Uploading ${file.name} to the room library...`;

    try {
      await this.onUploadSurface(file);
      this.surfaceHelper.textContent = `${file.name} added to the room library.`;
      this.surfaceFileInput.value = '';
      if (this.roomMediaEnabled) {
        await this.refreshRoomMediaLibrary();
      }
    } catch (error) {
      this.surfaceHelper.textContent = getErrorMessage(error, 'Unable to upload that image right now.');
    } finally {
      this.surfaceUploadButton.disabled = !this.surfaceUploadEnabled;
      this.surfaceFileInput.disabled = !this.surfaceUploadEnabled;
      this.surfaceUploadButton.textContent = 'Upload to Library';
    }
  }

  private async refreshRoomMediaLibrarySoon(delayMs = 350): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    await this.refreshRoomMediaLibrary();
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
    this.tvHelper.textContent = `Uploading ${file.name} for the shared TV...`;

    try {
      await this.onUploadTvMedia(file);
      this.tvHelper.textContent = `${file.name} uploaded for the shared TV.`;
      this.tvFileInput.value = '';
      if (this.roomMediaEnabled) {
        await this.refreshRoomMediaLibrary();
      }
    } catch (error) {
      this.tvHelper.textContent = getErrorMessage(error, 'Unable to upload that TV video right now.');
    } finally {
      this.tvFileInput.disabled = !this.tvEnabled;
      this.tvUploadButton.disabled = !this.tvEnabled;
      this.tvClearButton.disabled = !this.tvEnabled;
      const hasSource = Boolean(this.tvInput.value.trim());
      this.tvTogglePlaybackButton.disabled = !this.tvEnabled || !hasSource;
    }
  }

  private async handleTvPlaybackUpdate(isPlaying: boolean): Promise<void> {
    if (!this.tvEnabled || !this.tvInput.value.trim()) {
      return;
    }

    const livePlaybackState = window.__musicspaceGetTvPlaybackState?.();
    const currentTime = livePlaybackState?.sourceUrl
      ? Math.max(0, Number.isFinite(livePlaybackState.currentTime) ? livePlaybackState.currentTime : this.tvCurrentTime)
      : this.tvCurrentTime;

    this.tvHelper.textContent = isPlaying ? 'Resuming shared TV...' : 'Pausing shared TV...';
    try {
      await this.onSetTvPlayback(isPlaying, currentTime);
    } catch (error) {
      this.tvHelper.textContent = getErrorMessage(error, 'Unable to update shared TV playback right now.');
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




