export type AvatarPresetId = 'observer' | 'pulse' | 'signal' | null;

export type UserPreferences = {
  profile: {
    displayName: string;
    avatarPresetId: AvatarPresetId;
  };
  room: {
    defaultRoomSlug: string;
  };
  audio: {
    preferredStationMood: string | null;
    defaultVolume: number;
  };
  visuals: {
    backgroundOverrideMood: string | null;
  };
};

export type PreferencesPatch = Partial<{
  profile: Partial<UserPreferences['profile']>;
  room: Partial<UserPreferences['room']>;
  audio: Partial<UserPreferences['audio']>;
  visuals: Partial<UserPreferences['visuals']>;
}>;
