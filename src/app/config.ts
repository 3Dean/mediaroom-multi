export const APP_CONFIG = {
  defaultRoomSlug: 'lobby',
  movementBroadcastHz: 12,
  remoteInterpolationMs: 120,
  chatHistoryLimit: 50,
  defaultRealtimePort: 8787,
  reconnectBaseDelayMs: 1000,
  reconnectMaxDelayMs: 8000,
} as const;

export const STORAGE_KEYS = {
  lastRoomSlug: 'musicspace:last-room-slug',
  displayName: 'musicspace:display-name',
} as const;
