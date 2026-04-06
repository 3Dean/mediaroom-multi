import { BufferGeometry, ClampToEdgeWrapping, LinearFilter, Material, MathUtils, Mesh, MeshBasicMaterial, Object3D, SRGBColorSpace, Scene, ShaderMaterial, Vector2, VideoTexture } from 'three';

type ReactiveLevels = {
  bass: number;
  mid: number;
  high: number;
  energy: number;
};

type TvVisualizerPreset = {
  symmetrySlices: number;
  fieldScale: number;
  secondaryScale: number;
  detailScale: number;
  motionSpeed: number;
  bassWarpScale: number;
  shimmerScale: number;
  paletteDrift: number;
  bloomStrength: number;
  scanlineStrength: number;
  warmBias: number;
  magentaBias: number;
  coolBias: number;
};

type TvAudioInput = {
  averageFrequency: number;
  data: Uint8Array;
  hasActivePlayback: boolean;
  mood: string;
};

type TvFeatureDeps = {
  getViewportSize: () => { width: number; height: number };
  loader: any;
  resolveStorageUrl: (path: string) => Promise<string>;
  scene: Scene;
};

const defaultTvVisualizerPreset: TvVisualizerPreset = {
  symmetrySlices: 4,
  fieldScale: 2.4,
  secondaryScale: 3.4,
  detailScale: 1,
  motionSpeed: 1,
  bassWarpScale: 1,
  shimmerScale: 1,
  paletteDrift: 1,
  bloomStrength: 1,
  scanlineStrength: 1,
  warmBias: 1,
  magentaBias: 1,
  coolBias: 1,
};

const tvVisualizerPresets: Record<string, TvVisualizerPreset> = {
  beat: { symmetrySlices: 6, fieldScale: 2.9, secondaryScale: 4.2, detailScale: 1.35, motionSpeed: 1.05, bassWarpScale: 1.2, shimmerScale: 1.05, paletteDrift: 1.05, bloomStrength: 1.08, scanlineStrength: 1.05, warmBias: 1.1, magentaBias: 1.05, coolBias: 0.95 },
  chill: { symmetrySlices: 4, fieldScale: 1.9, secondaryScale: 2.6, detailScale: 0.82, motionSpeed: 0.78, bassWarpScale: 0.78, shimmerScale: 0.72, paletteDrift: 0.86, bloomStrength: 0.92, scanlineStrength: 0.78, warmBias: 1.28, magentaBias: 0.9, coolBias: 0.72 },
  dark: { symmetrySlices: 5, fieldScale: 2.5, secondaryScale: 3.8, detailScale: 1.05, motionSpeed: 0.9, bassWarpScale: 0.92, shimmerScale: 0.88, paletteDrift: 0.9, bloomStrength: 0.96, scanlineStrength: 1.1, warmBias: 0.22, magentaBias: 1.22, coolBias: 2.92 },
  defcon: { symmetrySlices: 8, fieldScale: 3.1, secondaryScale: 4.6, detailScale: 1.42, motionSpeed: 1.18, bassWarpScale: 1.08, shimmerScale: 1.18, paletteDrift: 1.18, bloomStrength: 1.02, scanlineStrength: 1.18, warmBias: 0.95, magentaBias: 1.02, coolBias: 1.18 },
  drone: { symmetrySlices: 3, fieldScale: 1.55, secondaryScale: 2.15, detailScale: 0.68, motionSpeed: 0.58, bassWarpScale: 0.55, shimmerScale: 0.48, paletteDrift: 0.68, bloomStrength: 0.88, scanlineStrength: 0.68, warmBias: 0.62, magentaBias: 1.05, coolBias: 1.24 },
  dubstep: { symmetrySlices: 7, fieldScale: 3.2, secondaryScale: 4.8, detailScale: 1.55, motionSpeed: 1.22, bassWarpScale: 1.42, shimmerScale: 1.28, paletteDrift: 1.16, bloomStrength: 1.24, scanlineStrength: 1.08, warmBias: 1.14, magentaBias: 1.18, coolBias: 1.02 },
  indie: { symmetrySlices: 5, fieldScale: 2.2, secondaryScale: 3.1, detailScale: 0.92, motionSpeed: 0.86, bassWarpScale: 0.82, shimmerScale: 0.84, paletteDrift: 0.94, bloomStrength: 0.94, scanlineStrength: 0.84, warmBias: 1.12, magentaBias: 0.92, coolBias: 0.88 },
  jazz: { symmetrySlices: 4, fieldScale: 2.05, secondaryScale: 2.85, detailScale: 0.88, motionSpeed: 0.82, bassWarpScale: 0.7, shimmerScale: 0.62, paletteDrift: 0.9, bloomStrength: 0.9, scanlineStrength: 0.92, warmBias: 1.26, magentaBias: 1.08, coolBias: 0.72 },
  metal: { symmetrySlices: 6, fieldScale: 3.0, secondaryScale: 4.1, detailScale: 1.38, motionSpeed: 1.08, bassWarpScale: 1.18, shimmerScale: 0.92, paletteDrift: 1.02, bloomStrength: 1.16, scanlineStrength: 1.2, warmBias: 1.34, magentaBias: 1.12, coolBias: 0.68 },
  space: { symmetrySlices: 8, fieldScale: 2.0, secondaryScale: 3.5, detailScale: 1.12, motionSpeed: 0.72, bassWarpScale: 0.64, shimmerScale: 1.12, paletteDrift: 1.06, bloomStrength: 1.02, scanlineStrength: 0.74, warmBias: 0.6, magentaBias: 0.98, coolBias: 1.36 },
};

const TV_TEST_VIDEO_URL = '/video/tvscreen.mp4';

function averageFrequencyRange(data: Uint8Array, startRatio: number, endRatio: number) {
  const startIndex = Math.max(0, Math.floor(data.length * startRatio));
  const endIndex = Math.max(startIndex + 1, Math.floor(data.length * endRatio));
  let total = 0;
  let count = 0;
  for (let index = startIndex; index < endIndex && index < data.length; index += 1) {
    total += data[index];
    count += 1;
  }
  return count > 0 ? total / count / 255 : 0;
}

export function createTvFeature({ getViewportSize, loader, resolveStorageUrl, scene }: TvFeatureDeps) {
  let tvScreenObject: Object3D | null = null;
  let tvVisualizerMaterial: ShaderMaterial | null = null;
  let tvVideoElement: HTMLVideoElement | null = null;
  let tvVideoTexture: VideoTexture | null = null;
  let tvVideoMaterial: MeshBasicMaterial | null = null;
  const tvMeshMaterials = new Map<Mesh, Material | Material[]>();
  let tvCurrentSourceUrl: string | null = null;
  let tvBassLevel = 0;
  let tvMidLevel = 0;
  let tvHighLevel = 0;
  let tvEnergyLevel = 0;
  let reactiveSignalTime = 0;
  let analyserSilentFor = 0;
  let usingSyntheticReactiveSignal = false;

  function createTvVisualizerMaterial() {
    return new ShaderMaterial({
      transparent: false,
      depthWrite: true,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uEnergy: { value: 0 },
        uResolution: { value: new Vector2(1, 1) },
        uSlices: { value: defaultTvVisualizerPreset.symmetrySlices },
        uFieldScale: { value: defaultTvVisualizerPreset.fieldScale },
        uSecondaryScale: { value: defaultTvVisualizerPreset.secondaryScale },
        uDetailScale: { value: defaultTvVisualizerPreset.detailScale },
        uMotionSpeed: { value: defaultTvVisualizerPreset.motionSpeed },
        uBassWarpScale: { value: defaultTvVisualizerPreset.bassWarpScale },
        uShimmerScale: { value: defaultTvVisualizerPreset.shimmerScale },
        uPaletteDrift: { value: defaultTvVisualizerPreset.paletteDrift },
        uBloomStrength: { value: defaultTvVisualizerPreset.bloomStrength },
        uScanlineStrength: { value: defaultTvVisualizerPreset.scanlineStrength },
        uWarmBias: { value: defaultTvVisualizerPreset.warmBias },
        uMagentaBias: { value: defaultTvVisualizerPreset.magentaBias },
        uCoolBias: { value: defaultTvVisualizerPreset.coolBias },
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'varying vec2 vUv;',
        'uniform float uTime;',
        'uniform float uBass;',
        'uniform float uMid;',
        'uniform float uHigh;',
        'uniform float uEnergy;',
        'uniform vec2 uResolution;',
        'uniform float uSlices;',
        'uniform float uFieldScale;',
        'uniform float uSecondaryScale;',
        'uniform float uDetailScale;',
        'uniform float uMotionSpeed;',
        'uniform float uBassWarpScale;',
        'uniform float uShimmerScale;',
        'uniform float uPaletteDrift;',
        'uniform float uBloomStrength;',
        'uniform float uScanlineStrength;',
        'uniform float uWarmBias;',
        'uniform float uMagentaBias;',
        'uniform float uCoolBias;',
        'mat2 rotate2d(float angle) {',
        '  float s = sin(angle);',
        '  float c = cos(angle);',
        '  return mat2(c, -s, s, c);',
        '}',
        'vec3 palette(float t, float bass, float mid, float high, float energy) {',
        '  vec3 base = vec3(0.02, 0.025, 0.035);',
        '  vec3 body = vec3(0.08, 0.11, 0.12);',
        '  vec3 magenta = vec3(0.76, 0.3, 0.66) * uMagentaBias;',
        '  vec3 cyan = vec3(0.14, 0.86, 0.84) * uCoolBias;',
        '  vec3 amber = vec3(0.98, 0.6, 0.24) * uWarmBias;',
        '  float drift = t * 0.35 * uPaletteDrift;',
        '  float bassBias = clamp(0.2 + bass * 0.95 + energy * 0.18 + 0.12 * sin(drift * 0.8 + 0.7), 0.0, 1.6);',
        '  float midBias = clamp(0.24 + mid * 0.95 + 0.18 * sin(drift * 1.1 + 2.1), 0.0, 1.6);',
        '  float highBias = clamp(0.22 + high * 1.05 + 0.2 * cos(drift * 1.4 - 0.8), 0.0, 1.6);',
        '  vec3 weights = vec3(amber.r + bassBias, magenta.g + midBias, cyan.b + highBias);',
        '  float cycleA = 0.5 + 0.5 * sin(t * 0.72 + bass * 1.3 + energy * 0.4);',
        '  float cycleB = 0.5 + 0.5 * cos(t * 0.58 + mid * 1.6 + 1.2);',
        '  float cycleC = 0.5 + 0.5 * sin(t * 0.96 + high * 2.1 + 2.4);',
        '  vec3 colorA = mix(cyan, magenta, cycleA);',
        '  vec3 colorB = mix(magenta, amber, cycleB);',
        '  vec3 colorC = mix(amber, cyan, cycleC);',
        '  vec3 harmonic = mix(colorA, colorB, 0.5 + 0.5 * sin(t * 0.42 + energy * 0.9));',
        '  harmonic = mix(harmonic, colorC, 0.35 + 0.25 * cos(t * 0.31 + high * 1.2));',
        '  harmonic *= weights;',
        '  return base + body * cos(6.28318 * (harmonic * (0.22 + t * 0.08) + vec3(cycleA, cycleB, cycleC)));',
        '}',
        'float plasmaField(vec2 p, float time) {',
        '  float v = 0.0;',
        '  v += sin((p.x + time * 0.16) * 3.2);',
        '  v += sin((p.y - time * 0.12) * 4.4);',
        '  v += sin((p.x + p.y + time * 0.1) * 5.2);',
        '  v += sin(length(p + vec2(sin(time * 0.055), cos(time * 0.07))) * 7.8 - time * 0.28);',
        '  return v * 0.25;',
        '}',
        'void main() {',
        '  vec2 uv = vUv * 2.0 - 1.0;',
        '  uv.x *= uResolution.x / max(uResolution.y, 1.0);',
        '  uv.x = abs(uv.x);',
        '  float bassWarp = uBass * 0.34 * uBassWarpScale;',
        '  float shimmer = uHigh * 0.055 * uShimmerScale;',
        '  float pulse = 1.24 + uBass * 0.92 + uEnergy * 0.32;',
        '  float time = uTime * (0.16 + uMid * 0.08) * (0.72 + uMotionSpeed * 0.48);',
        '  uv *= rotate2d(0.12 + uMid * 0.18);',
        '  uv += vec2(sin(uv.y * 5.0 + time * 0.34) * bassWarp, cos(uv.x * 4.2 - time * 0.28) * bassWarp * 0.9);',
        '  uv *= 1.0 + uBass * 0.12;',
        '  vec2 kaleidoUv = uv;',
        '  float angle = atan(kaleidoUv.y, kaleidoUv.x);',
        '  float radius = length(kaleidoUv);',
        '  float slices = uSlices;',
        '  angle = abs(mod(angle, 6.28318 / slices) - 3.14159 / slices);',
        '  kaleidoUv = vec2(cos(angle), sin(angle)) * radius;',
        '  float plasma = plasmaField(kaleidoUv * ((uFieldScale + uMid * 1.4) * uDetailScale), time);',
        '  float secondary = plasmaField((kaleidoUv + vec2(0.8, -0.3)) * ((uSecondaryScale + uHigh * 2.1) * uDetailScale), -time * 0.18);',
        '  float glowMask = smoothstep(-0.26, 0.72, plasma + secondary + radius * -0.16 + 0.82 + uBass * 0.38);',
        '  float edgeGlow = smoothstep(1.28, 0.04, radius);',
        '  float shimmerField = sin((uv.x + uv.y) * 42.0 + time * 1.8) * shimmer;',
        '  float field = plasma * 1.2 + secondary * 0.96 + shimmerField;',
        '  vec3 color = palette(field + time * 0.12, uBass, uMid, uHigh, uEnergy);',
        '  color *= (glowMask * 3.15 + edgeGlow * 0.7) * pulse;',
        '  float scanline = 1.0 - (0.015 * uScanlineStrength) + 0.025 * uScanlineStrength * sin(vUv.y * uResolution.y * 0.6);',
        '  float crtVignette = smoothstep(1.42, -0.08, radius);',
        '  float beatBloom = smoothstep(0.18, 0.98, glowMask + uBass * 1.18) * (0.44 + uBass * 1.55);',
        '  color += vec3(0.28, 0.2, 0.14) * beatBloom * (0.55 + uBass * 0.7) * uBloomStrength;',
        '  color *= scanline * crtVignette;',
        '  color += vec3(0.14, 0.145, 0.155) + vec3(0.16, 0.055, 0.03) * uBass + vec3(0.04, 0.015, 0.065) * uMid + vec3(0.015, 0.065, 0.08) * uHigh;',
        '  color = pow(max(color, 0.0), vec3(0.82));',
        '  gl_FragColor = vec4(color, 1.0);',
        '}',
      ].join('\n'),
    });
  }

  function applyVisualizerPreset(mood: string) {
    if (!tvVisualizerMaterial) {
      return;
    }

    const preset = tvVisualizerPresets[mood] ?? defaultTvVisualizerPreset;
    tvVisualizerMaterial.uniforms.uSlices.value = preset.symmetrySlices;
    tvVisualizerMaterial.uniforms.uFieldScale.value = preset.fieldScale;
    tvVisualizerMaterial.uniforms.uSecondaryScale.value = preset.secondaryScale;
    tvVisualizerMaterial.uniforms.uDetailScale.value = preset.detailScale;
    tvVisualizerMaterial.uniforms.uMotionSpeed.value = preset.motionSpeed;
    tvVisualizerMaterial.uniforms.uBassWarpScale.value = preset.bassWarpScale;
    tvVisualizerMaterial.uniforms.uShimmerScale.value = preset.shimmerScale;
    tvVisualizerMaterial.uniforms.uPaletteDrift.value = preset.paletteDrift;
    tvVisualizerMaterial.uniforms.uBloomStrength.value = preset.bloomStrength;
    tvVisualizerMaterial.uniforms.uScanlineStrength.value = preset.scanlineStrength;
    tvVisualizerMaterial.uniforms.uWarmBias.value = preset.warmBias;
    tvVisualizerMaterial.uniforms.uMagentaBias.value = preset.magentaBias;
    tvVisualizerMaterial.uniforms.uCoolBias.value = preset.coolBias;
  }

  function getSyntheticReactiveLevels(delta: number, mood: string): ReactiveLevels {
    reactiveSignalTime += delta;

    const moodTempoScale: Record<string, number> = {
      beat: 1.08,
      chill: 0.72,
      dark: 0.82,
      defcon: 1.05,
      drone: 0.56,
      dubstep: 1.18,
      indie: 0.84,
      jazz: 0.78,
      metal: 1.1,
      space: 0.68,
    };

    const tempo = moodTempoScale[mood] ?? 0.88;
    const t = reactiveSignalTime * tempo;
    const pulse = Math.pow(Math.max(0, Math.sin(t * 2.15) * 0.5 + 0.5), 4.0);
    const slowNoise = 0.5 + 0.5 * Math.sin(t * 0.47 + Math.sin(t * 0.13) * 1.9);
    const midWave = 0.5 + 0.5 * Math.sin(t * 1.31 + Math.cos(t * 0.37) * 1.2);
    const shimmer = 0.5 + 0.5 * Math.sin(t * 4.9 + Math.sin(t * 1.7) * 0.9);
    const accent = Math.pow(Math.max(0, Math.sin(t * 3.35 + 1.1) * 0.5 + 0.5), 6.0);

    const bass = MathUtils.clamp(0.16 + pulse * 0.72 + slowNoise * 0.22, 0, 1);
    const mid = MathUtils.clamp(0.18 + midWave * 0.54 + slowNoise * 0.16 + accent * 0.18, 0, 1);
    const high = MathUtils.clamp(0.14 + shimmer * 0.48 + accent * 0.24, 0, 1);
    const energy = MathUtils.clamp(bass * 0.46 + mid * 0.32 + high * 0.22, 0, 1);

    return { bass, mid, high, energy };
  }

  function createTvVideoResources() {
    if (tvVideoElement && tvVideoTexture && tvVideoMaterial) {
      return { element: tvVideoElement, texture: tvVideoTexture, material: tvVideoMaterial };
    }

    const element = document.createElement('video');
    element.crossOrigin = 'anonymous';
    element.loop = true;
    element.muted = true;
    element.playsInline = true;
    element.preload = 'auto';
    element.src = TV_TEST_VIDEO_URL;
    element.style.display = 'none';
    document.body.appendChild(element);

    const texture = new VideoTexture(element);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.repeat.y = -1;
    texture.offset.y = 1;

    const material = new MeshBasicMaterial({ map: texture, toneMapped: false });

    tvVideoElement = element;
    tvVideoTexture = texture;
    tvVideoMaterial = material;

    return { element, texture, material };
  }

  function applyTvMaterial(material: Material) {
    if (!tvScreenObject) {
      return;
    }

    tvScreenObject.traverse((child: Object3D) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        if (!tvMeshMaterials.has(mesh)) {
          tvMeshMaterials.set(mesh, mesh.material);
        }
        mesh.material = material;
      }
    });
  }

  function applyTvVisualizerMaterial() {
    if (!tvVisualizerMaterial) {
      return;
    }

    applyTvMaterial(tvVisualizerMaterial);
  }

  async function setVideoSource(url: string) {
    const { element, material } = createTvVideoResources();
    if (tvCurrentSourceUrl === url && tvVideoElement) {
      applyTvMaterial(material);
      return;
    }

    let resolvedUrl = url;
    if (!url.startsWith('/') && !/^https?:\/\//i.test(url)) {
      try {
        resolvedUrl = await resolveStorageUrl(url);
      } catch (error) {
        console.error('Failed to resolve shared TV source', error);
        clearVideoSource();
        return;
      }
    }

    tvCurrentSourceUrl = url;
    element.pause();
    element.src = resolvedUrl;
    element.load();
    applyTvMaterial(material);
    console.log('TV video texture source loaded.', url);
  }

  function clearVideoSource() {
    tvCurrentSourceUrl = null;
    if (tvVideoElement) {
      tvVideoElement.pause();
      tvVideoElement.removeAttribute('src');
      tvVideoElement.load();
    }
    applyTvVisualizerMaterial();
  }

  function setPlayback(isPlaying: boolean, currentTime: number) {
    if (!tvVideoElement || !tvCurrentSourceUrl) {
      return;
    }

    if (Number.isFinite(currentTime) && currentTime >= 0 && Math.abs(tvVideoElement.currentTime - currentTime) > 0.25) {
      tvVideoElement.currentTime = currentTime;
    }

    if (isPlaying) {
      void tvVideoElement.play().catch((error) => {
        console.warn('Unable to resume TV playback.', error);
      });
    } else {
      tvVideoElement.pause();
    }
  }

  function getPlaybackState() {
    return {
      currentTime: tvVideoElement?.currentTime ?? 0,
      isPlaying: Boolean(tvVideoElement && !tvVideoElement.paused),
      sourceUrl: tvCurrentSourceUrl,
    };
  }

  function loadScreen(initialMood: string) {
    loader.load('/models/tvscreen.glb', (gltf: any) => {
      const screen = gltf.scene as Object3D;
      tvScreenObject = screen;
      screen.position.set(0, 0, 0);
      console.log(`Initial TV screen position: ${screen.position.x}, ${screen.position.y}, ${screen.position.z}`);

      tvVisualizerMaterial = createTvVisualizerMaterial();
      applyVisualizerPreset(initialMood);
      gltf.scene.traverse((child: Object3D) => {
        if ((child as Mesh).isMesh) {
          const mesh = child as Mesh;
          tvMeshMaterials.set(mesh, mesh.material);
          if ((mesh.geometry as BufferGeometry).attributes.uv) {
            const uvAttribute = (mesh.geometry as BufferGeometry).attributes.uv;
            tvVisualizerMaterial!.uniforms.uResolution.value.set(
              Math.max(uvAttribute.count, 1),
              Math.max(uvAttribute.count * 0.5625, 1),
            );
          }
          mesh.material = tvVisualizerMaterial!;
        }
      });
      scene.add(gltf.scene);
      applyTvVisualizerMaterial();
    });
  }

  function updateAudioLevels(delta: number, input: TvAudioInput) {
    const analyserLevels = {
      bass: averageFrequencyRange(input.data, 0.0, 0.14),
      mid: averageFrequencyRange(input.data, 0.14, 0.48),
      high: averageFrequencyRange(input.data, 0.48, 1.0),
      energy: input.averageFrequency,
    };
    const analyserStrength = Math.max(analyserLevels.bass, analyserLevels.mid, analyserLevels.high, analyserLevels.energy);

    if (input.hasActivePlayback && analyserStrength < 0.02) {
      analyserSilentFor += delta;
    } else {
      analyserSilentFor = 0;
    }

    usingSyntheticReactiveSignal = input.hasActivePlayback && analyserSilentFor > 1.2;
    const activeLevels = usingSyntheticReactiveSignal
      ? getSyntheticReactiveLevels(delta, input.mood)
      : analyserLevels;

    tvBassLevel = MathUtils.lerp(tvBassLevel, activeLevels.bass, 0.14);
    tvMidLevel = MathUtils.lerp(tvMidLevel, activeLevels.mid, 0.12);
    tvHighLevel = MathUtils.lerp(tvHighLevel, activeLevels.high, 0.18);
    tvEnergyLevel = MathUtils.lerp(tvEnergyLevel, activeLevels.energy, 0.1);

    if (!tvVisualizerMaterial) {
      return;
    }

    tvVisualizerMaterial.uniforms.uBass.value = tvBassLevel;
    tvVisualizerMaterial.uniforms.uMid.value = tvMidLevel;
    tvVisualizerMaterial.uniforms.uHigh.value = tvHighLevel;
    tvVisualizerMaterial.uniforms.uEnergy.value = tvEnergyLevel;
  }

  function updateFrame(delta: number) {
    if (!tvVisualizerMaterial) {
      return;
    }

    const viewport = getViewportSize();
    tvVisualizerMaterial.uniforms.uTime.value += delta;
    tvVisualizerMaterial.uniforms.uResolution.value.set(viewport.width, viewport.height);
  }

  function getReactiveLevels(): ReactiveLevels {
    return {
      bass: tvBassLevel,
      mid: tvMidLevel,
      high: tvHighLevel,
      energy: tvEnergyLevel,
    };
  }

  function updateScreenPosition(x: number, y: number, z: number) {
    if (!tvScreenObject) {
      console.warn('TV screen object not yet loaded.');
      return;
    }
    tvScreenObject.position.set(x, y, z);
    console.log(`TV screen moved to: ${x}, ${y}, ${z}`);
  }

  return {
    applyVisualizerPreset,
    clearVideoSource,
    getPlaybackState,
    getReactiveLevels,
    loadScreen,
    setPlayback,
    setVideoSource,
    updateAudioLevels,
    updateFrame,
    updateScreenPosition,
  };
}
