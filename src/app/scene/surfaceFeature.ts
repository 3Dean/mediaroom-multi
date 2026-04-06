import { Mesh, MeshStandardMaterial, SRGBColorSpace, TextureLoader } from 'three';
import type { LoadingManager, Scene, Texture } from 'three';
import type { RoomSurfaceSnapshot } from '../../types/room';

type SurfaceFeatureDeps = {
  frameSurfaceIds: readonly string[];
  manager: LoadingManager;
  resolveStorageUrl: (path: string) => Promise<string>;
  scene: Scene;
};

export function createSurfaceFeature({ frameSurfaceIds, manager, resolveStorageUrl, scene }: SurfaceFeatureDeps) {
  const frameTextureLoader = new TextureLoader(manager);
  const moodSurfaceSources = new Map<string, string>();
  const roomSurfaceSources = new Map<string, RoomSurfaceSnapshot>();
  const appliedSurfaceSources = new Map<string, string>();
  const surfaceRequestTokens = new Map<string, number>();

  function findFrameMesh(surfaceId: string): Mesh | null {
    let meshToUpdate: Mesh | null = null;
    scene.traverse((obj) => {
      if ((obj as Mesh).isMesh && obj.name === surfaceId) {
        meshToUpdate = obj as Mesh;
      }
    });
    return meshToUpdate;
  }

  function buildSurfaceMaterial(texture: Texture) {
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;

    const updatedMaterial = new MeshStandardMaterial({
      map: texture,
      metalness: 0.0,
      roughness: 1.0,
      toneMapped: true,
    });
    updatedMaterial.needsUpdate = true;
    return updatedMaterial;
  }

  function applySurfaceTextureFromUrl(surfaceId: string, textureUrl: string) {
    const meshToUpdate = findFrameMesh(surfaceId);
    if (!meshToUpdate) {
      console.warn(`Mesh not found: ${surfaceId}`);
      return;
    }

    const currentSource = appliedSurfaceSources.get(surfaceId);
    if (currentSource === textureUrl) {
      return;
    }

    const requestToken = (surfaceRequestTokens.get(surfaceId) ?? 0) + 1;
    surfaceRequestTokens.set(surfaceId, requestToken);
    frameTextureLoader.load(textureUrl, (newTexture) => {
      if (surfaceRequestTokens.get(surfaceId) !== requestToken) {
        newTexture.dispose();
        return;
      }

      const previousMaterial = meshToUpdate.material;
      meshToUpdate.material = buildSurfaceMaterial(newTexture);
      appliedSurfaceSources.set(surfaceId, textureUrl);
      if (Array.isArray(previousMaterial)) {
        previousMaterial.forEach((material) => material.dispose?.());
      } else {
        previousMaterial?.dispose?.();
      }
    });
  }

  async function applySurfaceTexture(surfaceId: string, imagePath: string) {
    try {
      const resolvedUrl = await resolveStorageUrl(imagePath);
      applySurfaceTextureFromUrl(surfaceId, resolvedUrl);
    } catch (error) {
      console.error(`Failed to resolve room surface ${surfaceId}`, error);
      const fallbackSource = moodSurfaceSources.get(surfaceId);
      if (fallbackSource) {
        applySurfaceTextureFromUrl(surfaceId, fallbackSource);
      }
    }
  }

  function applyActiveSurfaceSource(surfaceId: string) {
    const roomSurface = roomSurfaceSources.get(surfaceId);
    if (roomSurface) {
      void applySurfaceTexture(surfaceId, roomSurface.imagePath);
      return;
    }

    const moodSource = moodSurfaceSources.get(surfaceId);
    if (moodSource) {
      applySurfaceTextureFromUrl(surfaceId, moodSource);
    }
  }

  function setMood(mood: string) {
    frameSurfaceIds.forEach((frameName) => {
      moodSurfaceSources.set(frameName, `/images/moods/${mood}/${frameName}.png`);
      applyActiveSurfaceSource(frameName);
    });
  }

  function syncRoomSurfaces(surfaces: RoomSurfaceSnapshot[]) {
    roomSurfaceSources.clear();
    surfaces.forEach((surface) => {
      roomSurfaceSources.set(surface.surfaceId, surface);
    });

    frameSurfaceIds.forEach((surfaceId) => {
      applyActiveSurfaceSource(surfaceId);
    });
  }

  return {
    applyActiveSurfaceSource,
    setMood,
    syncRoomSurfaces,
  };
}
