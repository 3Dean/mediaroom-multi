export type BrandBackgroundConfig = {
  path: string;
  rotationDegrees: number;
};

export type BrandMoodConfig = {
  label: string;
  background: BrandBackgroundConfig;
};

export type BrandStation = {
  label: string;
  stream: string;
  info?: string;
  mood: string;
};

export type BrandSceneModelTransform = {
  position?: { x: number; y: number; z: number };
  rotationDegrees?: { x?: number; y?: number; z?: number };
  scale?: { x: number; y: number; z: number };
};

export type BrandProfile = {
  id: string;
  displayName: string;
  lobby: {
    heroBrandLine: string;
    heroHeadlineHtml: string;
    heroSupportHtml: string;
    heroSignedInSupportHtml: string;
  };
  audio: {
    playButtonLabel: string;
    defaultStationMood: string;
    stations: BrandStation[];
  };
  visuals: {
    moods: Record<string, BrandMoodConfig>;
  };
  scene: {
    brandedModelUrls: string[];
    modelTransforms?: Record<string, BrandSceneModelTransform>;
  };
};

export const somaFmBrandProfile: BrandProfile = {
  id: 'somafm',
  displayName: 'SomaFM',
  lobby: {
    heroBrandLine: 'SomaFM MediaRoom',
    heroHeadlineHtml: 'Step into<br>the session',
    heroSupportHtml: 'Choose a room or create one<br>in the sidebar.',
    heroSignedInSupportHtml: 'Choose a room or create one<br>in the sidebar.',
  },
  audio: {
    playButtonLabel: 'Play Music',
    defaultStationMood: 'chill',
    stations: [
      { label: 'Groove Salad (Chill)', stream: 'https://ice4.somafm.com/groovesalad-128-mp3', info: 'https://api.somafm.com/channels/groovesalad.json', mood: 'chill' },
      { label: 'Secret Agent (Jazz)', stream: 'https://ice6.somafm.com/secretagent-128-mp3', info: 'https://api.somafm.com/channels/secretagent.json', mood: 'jazz' },
      { label: 'Metal Detector (Metal)', stream: 'https://ice1.somafm.com/metal-128-mp3', info: 'https://api.somafm.com/channels/metal.json', mood: 'metal' },
      { label: 'Drone Zone', stream: 'https://ice1.somafm.com/dronezone-128-mp3', info: 'https://api.somafm.com/channels/dronezone.json', mood: 'drone' },
      { label: 'DEF CON Radio', stream: 'https://ice4.somafm.com/defcon-128-mp3', info: 'https://api.somafm.com/channels/defcon.json', mood: 'defcon' },
      { label: 'Beat Blender', stream: 'https://ice2.somafm.com/beatblender-128-mp3', info: 'https://api.somafm.com/channels/beatblender.json', mood: 'beat' },
      { label: 'Doomed (Dark)', stream: 'https://ice6.somafm.com/doomed-128-mp3', info: 'https://api.somafm.com/channels/doomed.json', mood: 'dark' },
      { label: 'Dub Step Beyond', stream: 'https://ice2.somafm.com/dubstep-128-mp3', info: 'https://api.somafm.com/channels/dubstep.json', mood: 'dubstep' },
      { label: 'Indie Pop Rocks', stream: 'https://ice1.somafm.com/indiepop-128-mp3', info: 'https://api.somafm.com/channels/indiepop.json', mood: 'indie' },
      { label: 'Mission Control', stream: 'https://ice6.somafm.com/missioncontrol-128-mp3', info: 'https://api.somafm.com/channels/missioncontrol.json', mood: 'space' },
    ],
  },
  visuals: {
    moods: {
      beat: { label: 'Beat', background: { path: '/images/equirectangular-beat.jpg', rotationDegrees: 8 } },
      chill: { label: 'Chill', background: { path: '/images/equirectangular-chill.jpg', rotationDegrees: 19 } },
      dark: { label: 'Dark', background: { path: '/images/equirectangular-dark.jpg', rotationDegrees: 0 } },
      defcon: { label: 'Defcon', background: { path: '/images/equirectangular-defcon.jpg', rotationDegrees: 200 } },
      drone: { label: 'Drone', background: { path: '/images/equirectangular-drone.jpg', rotationDegrees: 0 } },
      dubstep: { label: 'Dubstep', background: { path: '/images/equirectangular-dubstep.jpg', rotationDegrees: -60 } },
      indie: { label: 'Indie', background: { path: '/images/equirectangular-indie.jpg', rotationDegrees: -124 } },
      jazz: { label: 'Jazz', background: { path: '/images/equirectangular-jazz.jpg', rotationDegrees: 3 } },
      metal: { label: 'Metal', background: { path: '/images/equirectangular-metal.jpg', rotationDegrees: 20 } },
      space: { label: 'Space', background: { path: '/images/equirectangular-space.jpg', rotationDegrees: -110 } },
    },
  },
  scene: {
    brandedModelUrls: ['/models/somafmlogo.glb'],
    modelTransforms: {},
  },
};

export const activeBrandProfile = somaFmBrandProfile;

export function getBrandStationOptions(profile: BrandProfile = activeBrandProfile) {
  return profile.audio.stations.map((station) => ({
    label: station.label,
    mood: station.mood,
  }));
}

export function getBrandBackgroundOptions(profile: BrandProfile = activeBrandProfile) {
  return [
    { value: '', label: 'Follow Station Mood' },
    ...Object.entries(profile.visuals.moods).map(([value, config]) => ({
      value,
      label: config.label,
    })),
  ];
}

export function getBrandBackgroundConfig(mood: string, profile: BrandProfile = activeBrandProfile) {
  return profile.visuals.moods[mood]?.background ?? profile.visuals.moods[profile.audio.defaultStationMood].background;
}
