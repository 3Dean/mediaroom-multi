import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import type { PlayerPresence } from '../types/player';

const BODY_COLOR = 0xff7f50;
const SELF_COLOR = 0x66ccff;
const AVATAR_TARGET_HEIGHT = 1.75;
const AVATAR_STYLE_TRANSFORMS: Record<string, { modelPath: string; scale: { x: number; y: number; z: number }; offsetY?: number }> = {
  observer: { modelPath: '/models/avatar_observer.glb', scale: { x: 0.7, y: 0.7, z: 0.7 }, offsetY: 0.3 },
  pulse: { modelPath: '/models/avatar_pulse.glb', scale: { x: 0.8, y: 0.8, z: 0.8 }, offsetY: 0.9 },
  signal: { modelPath: '/models/avatar_signal.glb', scale: { x: 0.7, y: 0.7, z: 0.7 }, offsetY: 0.3 },
};
const loader = new GLTFLoader();
const avatarTemplateCache = new Map<string, Promise<THREE.Group | null>>();

export class RemotePlayerManager {
  private readonly avatars = new Map<string, THREE.Group>();
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  sync(participants: PlayerPresence[], selfSessionId: string | null): void {
    const activeSessionIds = new Set<string>();

    participants.forEach((participant) => {
      activeSessionIds.add(participant.sessionId);
      if (participant.sessionId === selfSessionId) {
        return;
      }

      const avatar = this.ensureAvatar(participant, selfSessionId);
      avatar.position.set(
        participant.transform.position.x,
        participant.transform.position.y - 1.1,
        participant.transform.position.z,
      );
      avatar.rotation.y = participant.transform.rotation.yaw;
    });

    Array.from(this.avatars.keys()).forEach((sessionId) => {
      if (activeSessionIds.has(sessionId)) {
        return;
      }

      const avatar = this.avatars.get(sessionId);
      if (avatar) {
        this.scene.remove(avatar);
      }
      this.avatars.delete(sessionId);
    });
  }

  dispose(): void {
    this.avatars.forEach((avatar) => this.scene.remove(avatar));
    this.avatars.clear();
  }

  private ensureAvatar(participant: PlayerPresence, selfSessionId: string | null): THREE.Group {
    const existing = this.avatars.get(participant.sessionId);
    if (existing) {
      this.configureAvatar(existing, participant, selfSessionId);
      return existing;
    }

    const group = new THREE.Group();
    group.name = `remote-player-${participant.sessionId}`;

    const labelTexture = createNameLabelTexture(participant.displayName);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
      }),
    );
    label.position.set(0, 2.1, 0);
    label.scale.set(1.8, 0.45, 1);
    label.name = 'name-label';
    group.add(label);

    this.configureAvatar(group, participant, selfSessionId);
    this.scene.add(group);
    this.avatars.set(participant.sessionId, group);
    return group;
  }

  private configureAvatar(group: THREE.Group, participant: PlayerPresence, selfSessionId: string | null): void {
    const desiredStyle = participant.avatarStyle ?? null;
    if (group.userData.avatarStyle === desiredStyle) {
      return;
    }

    const existingVisual = group.getObjectByName('avatar-visual');
    if (existingVisual) {
      group.remove(existingVisual);
    }

    group.userData.avatarStyle = desiredStyle;
    const fallback = createFallbackAvatar(participant.sessionId === selfSessionId ? SELF_COLOR : BODY_COLOR);
    group.add(fallback);

    const transform = desiredStyle ? AVATAR_STYLE_TRANSFORMS[desiredStyle] : null;
    if (transform) {
      loadAvatarTemplate(transform.modelPath).then((template) => {
        if (!template || group.userData.avatarStyle !== desiredStyle) {
          return;
        }

        const currentVisual = group.getObjectByName('avatar-visual');
        if (currentVisual) {
          group.remove(currentVisual);
        }

        const clone = template.clone(true);
        clone.name = 'avatar-visual';
        clone.scale.set(
          clone.scale.x * transform.scale.x,
          clone.scale.y * transform.scale.y,
          clone.scale.z * transform.scale.z,
        );
        clone.position.y += transform.offsetY ?? 0;
        group.add(clone);
      }).catch(() => {
        // Keep fallback capsule if avatar model fails to load.
      });
    }
  }
}

function createFallbackAvatar(color: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'avatar-visual';

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
    }),
  );
  body.position.y = 0.95;
  group.add(body);
  return group;
}

function loadAvatarTemplate(path: string): Promise<THREE.Group | null> {
  const cached = avatarTemplateCache.get(path);
  if (cached) {
    return cached;
  }

  const pending = new Promise<THREE.Group | null>((resolve) => {
    loader.load(path, (gltf: { scene: THREE.Group }) => {
      const avatarRoot = gltf.scene.clone(true);
      normalizeAvatarRoot(avatarRoot);
      resolve(avatarRoot);
    }, undefined, () => resolve(null));
  });

  avatarTemplateCache.set(path, pending);
  return pending;
}

function normalizeAvatarRoot(root: THREE.Group): void {
  const bounds = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);

  if (size.y > 0) {
    const scale = AVATAR_TARGET_HEIGHT / size.y;
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
  }

  const scaledBounds = new THREE.Box3().setFromObject(root);
  const scaledCenter = new THREE.Vector3();
  scaledBounds.getCenter(scaledCenter);
  const minY = scaledBounds.min.y;
  root.position.set(-scaledCenter.x, -minY, -scaledCenter.z);
}

function createNameLabelTexture(displayName: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;

  const context = canvas.getContext('2d');
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(0, 0, 0, 0.68)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  context.fillStyle = '#ffffff';
  context.font = '24px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(displayName, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
