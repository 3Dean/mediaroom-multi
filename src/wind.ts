import { Mesh, type Object3D } from 'three';

export const flowerParts: Mesh[] = [];

export const windSettings = {
  strength: 0.1, // Further adjusted for more subtle movement
  speed: 0.2,    // Slower speed for a gentler breeze
  chaos: 0.01,   // Slightly more chaos for less predictability
  maxAngle: 0.05, // Smaller max angle for subtlety
};

export function animateFlowers(time: number) {
  if (!flowerParts.length) return;

  flowerParts.forEach((flowerPart) => {
    if (!flowerPart.userData.originalRotation || !flowerPart.userData.originalPosition) {
      // Initialize if not present, though ideally done at load time
      if (!flowerPart.userData.originalRotation) flowerPart.userData.originalRotation = flowerPart.rotation.clone();
      if (!flowerPart.userData.originalPosition) flowerPart.userData.originalPosition = flowerPart.position.clone();
      if (flowerPart.userData.windOffset === undefined) flowerPart.userData.windOffset = Math.random() * Math.PI * 2;
      if (flowerPart.userData.windFactor === undefined) flowerPart.userData.windFactor = 0.8 + Math.random() * 0.4;
    }

    const windTime = time * windSettings.speed * 0.001; // time is expected in ms
    const windOffset = flowerPart.userData.windOffset;
    const windFactor = flowerPart.userData.windFactor;

    const windAmount =
      Math.sin(windTime + windOffset) *
      windSettings.strength *
      windFactor;

    const chaosX =
      Math.sin(windTime * 1.3 + windOffset * 2) *
      windSettings.chaos *
      windFactor;
    const chaosZ =
      Math.cos(windTime * 0.7 + windOffset * 3) *
      windSettings.chaos *
      windFactor;

    const xAngle = Math.max(
      -windSettings.maxAngle,
      Math.min(windSettings.maxAngle, windAmount + chaosX)
    );
    const zAngle = Math.max(
      -windSettings.maxAngle,
      Math.min(windSettings.maxAngle, windAmount * 0.5 + chaosZ)
    );

    flowerPart.rotation.x =
      flowerPart.userData.originalRotation.x + xAngle;
    flowerPart.rotation.z =
      flowerPart.userData.originalRotation.z + zAngle;
    // Keep original Y rotation unless specifically animated for wind
    flowerPart.rotation.y = flowerPart.userData.originalRotation.y;

  });
}

// Helper function to initialize wind effect on a model's parts
export function initializeWindEffectOnModel(modelNode: Object3D, modelName?: string) {
    modelNode.traverse(function (node) {
        if (node instanceof Mesh) { 
            node.userData.originalPosition = node.position.clone();
            node.userData.originalRotation = node.rotation.clone();
            node.userData.windOffset = Math.random() * Math.PI * 2;
            node.userData.windFactor = 0.8 + Math.random() * 0.4; 
            flowerParts.push(node);
        }
    });
    if (modelName) {
        console.log(
            `Initialized wind effect for meshes from model: ${modelName}. Total animating parts: ${flowerParts.length}`
        );
    } else {
        console.log(
            `Initialized wind effect for meshes. Total animating parts: ${flowerParts.length}`
        );
    }
}
