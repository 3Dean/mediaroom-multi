import { Clock, Color, Mesh, MeshStandardMaterial, Object3D, Scene, ShaderMaterial, Texture } from 'three';
import { addVaporToCoffee } from '../../addingVapor.js';
import { animateFlowers, initializeWindEffectOnModel } from '../../wind';

type ReactiveLevels = {
  bass: number;
  mid: number;
  high: number;
  energy: number;
};

type AmbientSceneFeatureOptions = {
  scene: Scene;
  loader: {
    load: (url: string, onLoad: (gltf: { scene: Object3D }) => void) => void;
  };
  emitTextures: Texture[];
};

export type AmbientSceneFeature = {
  loadAmbientModels: () => void;
  registerStaticModel: (url: string, modelScene: Object3D) => void;
  update: (reactiveLevels: ReactiveLevels) => void;
};

export function createAmbientSceneFeature({
  scene,
  loader,
  emitTextures,
}: AmbientSceneFeatureOptions): AmbientSceneFeature {
  let vaporEffectMaterial: ShaderMaterial | null = null;
  const mixingBoardMeshes: Mesh[] = [];
  let emitFrame = 0;
  let emitAccumulator = 0;
  const emitClock = new Clock();
  const emitBaseFps = 3;

  const loadMixingBoard = () => {
    loader.load('/models/mixingboard.glb', (gltf) => {
      const board = gltf.scene;
      board.traverse((child) => {
        if (!(child as Mesh).isMesh) {
          return;
        }

        const mesh = child as Mesh;
        const stdMat = (mesh.material as MeshStandardMaterial).clone();
        stdMat.emissive = new Color(0xffffff);
        stdMat.emissiveIntensity = 1;
        stdMat.emissiveMap = emitTextures[0] ?? null;
        mesh.material = stdMat;
        mixingBoardMeshes.push(mesh);
      });
      scene.add(board);
    });
  };

  const loadPlantStandPair = () => {
    loader.load('/models/plantstand2_L.glb', (gltf) => {
      const originalStand = gltf.scene;
      scene.add(originalStand);

      const standClone = originalStand.clone(true);
      standClone.position.x += 6.1;
      scene.add(standClone);
    });

    loader.load('/models/plantleaves2_L.glb', (gltf) => {
      const originalLeaves = gltf.scene;
      scene.add(originalLeaves);
      initializeWindEffectOnModel(originalLeaves, 'plantleaves2_L');

      const leavesClone = originalLeaves.clone(true);
      leavesClone.position.x += 6.1;
      scene.add(leavesClone);
      initializeWindEffectOnModel(leavesClone, 'plantleaves2_L');
    });
  };

  return {
    loadAmbientModels: () => {
      loadMixingBoard();
      loadPlantStandPair();
    },
    registerStaticModel: (url, modelScene) => {
      if (url === '/models/coffee.glb') {
        vaporEffectMaterial = addVaporToCoffee(modelScene) as ShaderMaterial;
      }
    },
    update: (reactiveLevels) => {
      if (mixingBoardMeshes.length > 0 && emitTextures.length > 0) {
        emitAccumulator += emitClock.getDelta();
        const emitFps = emitBaseFps * (0.72 + reactiveLevels.energy * 2.2 + reactiveLevels.bass * 0.95 + reactiveLevels.high * 0.4);
        const emitInterval = 1 / Math.max(emitFps, 0.6);
        while (emitAccumulator >= emitInterval) {
          emitFrame = (emitFrame + 1) % emitTextures.length;
          mixingBoardMeshes.forEach((mesh) => {
            const mat = mesh.material as MeshStandardMaterial;
            mat.emissiveMap = emitTextures[emitFrame];
            mat.needsUpdate = true;
          });
          emitAccumulator -= emitInterval;
        }
      }

      if (vaporEffectMaterial) {
        vaporEffectMaterial.uniforms.time.value += 0.003;
      }

      animateFlowers(performance.now());
    },
  };
}
