import { STORAGE_KEYS } from '../app/config';
import type { PreferencesPatch, UserPreferences } from './preferencesModel';

const DEFAULT_PREFERENCES: UserPreferences = {
  profile: {
    displayName: '',
    avatarPresetId: null,
  },
  room: {
    defaultRoomSlug: '',
  },
  audio: {
    preferredStationMood: null,
    defaultVolume: 0.5,
  },
  visuals: {
    backgroundOverrideMood: null,
  },
};

function clampVolume(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : DEFAULT_PREFERENCES.audio.defaultVolume));
}

function mergePreferences(base: UserPreferences, patch: PreferencesPatch): UserPreferences {
  return {
    profile: {
      ...base.profile,
      ...patch.profile,
    },
    room: {
      ...base.room,
      ...patch.room,
    },
    audio: {
      ...base.audio,
      ...patch.audio,
      defaultVolume: clampVolume(patch.audio?.defaultVolume ?? base.audio.defaultVolume),
    },
    visuals: {
      ...base.visuals,
      ...patch.visuals,
    },
  };
}

export function getDefaultPreferences(): UserPreferences {
  return structuredClone(DEFAULT_PREFERENCES);
}

export function loadPreferences(): UserPreferences {
  const raw = localStorage.getItem(STORAGE_KEYS.preferences);
  if (!raw) {
    return getDefaultPreferences();
  }

  try {
    const parsed = JSON.parse(raw) as PreferencesPatch;
    return mergePreferences(getDefaultPreferences(), parsed);
  } catch {
    return getDefaultPreferences();
  }
}

export function savePreferences(preferences: UserPreferences): void {
  localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(preferences));
}

export function updatePreferences(patch: PreferencesPatch): UserPreferences {
  const next = mergePreferences(loadPreferences(), patch);
  savePreferences(next);
  return next;
}

export function resetPreferences(): UserPreferences {
  const defaults = getDefaultPreferences();
  savePreferences(defaults);
  return defaults;
}
