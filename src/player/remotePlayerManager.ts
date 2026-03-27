import * as THREE from 'three';
import type { PlayerPresence } from '../types/player';

const BODY_COLOR = 0xff7f50;
const SELF_COLOR = 0x66ccff;

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
      return existing;
    }

    const group = new THREE.Group();
    group.name = `remote-player-${participant.sessionId}`;

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({
        color: participant.sessionId === selfSessionId ? SELF_COLOR : BODY_COLOR,
        roughness: 0.6,
      }),
    );
    body.position.y = 0.95;
    group.add(body);

    const labelTexture = createNameLabelTexture(participant.displayName);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: labelTexture,
        transparent: true,
      }),
    );
    label.position.set(0, 2.1, 0);
    label.scale.set(1.8, 0.45, 1);
    group.add(label);

    this.scene.add(group);
    this.avatars.set(participant.sessionId, group);
    return group;
  }
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
