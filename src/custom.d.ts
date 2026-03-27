declare module 'three/examples/jsm/loaders/GLTFLoader';
declare module 'three/examples/jsm/controls/PointerLockControls';

declare module './addingVapor.js' {
  // Removed: import * as THREE from 'three';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
  export function addVaporToCoffee(scene: import('three').Scene, gltfLoader: GLTFLoader): import('three').ShaderMaterial;
}

declare module './wind' {
  // Removed: import * as THREE from 'three';
  export const flowerParts: import('three').Mesh[];
  export const windSettings: {
    strength: number;
    speed: number;
    chaos: number;
    maxAngle: number;
  };
  export function animateFlowers(time: number): void;
  export function initializeWindEffectOnModel(modelNode: import('three').Object3D, modelName?: string): void;
}
