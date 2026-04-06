import { AdditiveBlending, Box3, BufferAttribute, BufferGeometry, Points, RepeatWrapping, ShaderMaterial, TextureLoader, Vector3 } from 'three';

// --- Sprite sheet texture ---
const textureLoader = new TextureLoader();
const vaporTexture = textureLoader.load('/images/vaporsprite4x4.png'); // Ensure this path is correct from project root
vaporTexture.wrapS = vaporTexture.wrapT = RepeatWrapping;

// --- Set the number of frames ---
const tilesHoriz = 2; // Number of columns in sprite sheet (quadrants)
const tilesVert = 2;  // Number of rows
const totalFrames = 4; // Only 4 quadrant frames

// --- Particle geometry ---
const vaporGeometry = new BufferGeometry();
const count = 4; // Number of vapor particles

const positions = new Float32Array(count * 3);
const offsets = new Float32Array(count);

for (let i = 0; i < count; i++) {
  // Single particle at model center, random frame start
  positions.set([0, -0.1, 0], i * 3); // Position will be relative to the Points object
  offsets[i] = Math.random() * totalFrames;
}

vaporGeometry.setAttribute('position', new BufferAttribute(positions, 3));
vaporGeometry.setAttribute('offset', new BufferAttribute(offsets, 1));

// --- Shader material ---
const vaporMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  uniforms: {
    map: { value: vaporTexture },
    time: { value: 0 },
    tilesHoriz: { value: tilesHoriz },
    tilesVert: { value: tilesVert },
    totalFrames: { value: totalFrames },
  },
  vertexShader: `
    attribute float offset;
    varying vec2 vFrameOffset;
    varying vec2 vFrameScale;
    varying float vPhase;
    uniform float time;
    uniform float tilesHoriz;
    uniform float tilesVert;
    uniform float totalFrames;

    void main() {
      // Calculate current integer frame index (no scrolling)
      float frame = floor(offset);
      vPhase = fract(time + offset); // vPhase will go from 0 to 1 repeatedly
      float col = mod(frame, tilesHoriz);
      float row = floor(frame / tilesHoriz);

      // Compute scale and offset for sprite sheet UVs
      vFrameScale = vec2(1.0 / tilesHoriz, 1.0 / tilesVert);
      vFrameOffset = vec2(col * vFrameScale.x, (tilesVert - row - 1.0) * vFrameScale.y);

      // apply slight upward motion based on fade phase
      vec3 moved = position + vec3(0.0, vPhase * 0.16, 0.0); // Particle moves up slightly as it animates
      vec4 mvPosition = modelViewMatrix * vec4(moved, 1.0);
      gl_PointSize = 256.0 / -mvPosition.z; // Adjust size based on distance
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    varying vec2 vFrameOffset;
    varying vec2 vFrameScale;
    varying float vPhase;

    void main() {
      // Compute UV within the sprite tile
      vec2 uv = gl_PointCoord * vFrameScale + vFrameOffset;
      vec4 texColor = texture2D(map, uv);
      
      // apply fade in/out alpha based on vPhase
      // Fades in for the first half of the phase, fades out for the second half
      float alpha = vPhase < 0.5 ? (vPhase * 2.0) : ((1.0 - vPhase) * 2.0);
      texColor.a *= alpha;

      if (texColor.a < 0.01) discard; // Discard transparent pixels
      gl_FragColor = texColor;
    }
  `,
});

export function addVaporToCoffee(targetObject) {
  // Compute bounding box to position vapor
  const box = new Box3().setFromObject(targetObject);
  const center = box.getCenter(new Vector3());
  const maxY = box.max.y;

  // Create vapor emitter points
  const vaporParticles = new Points(vaporGeometry, vaporMaterial);
  vaporParticles.position.set(center.x, maxY + 0.1, center.z); // Adjust as needed

  // Add vapor to the target object's parent
  targetObject.add(vaporParticles); // attach vapor to the coffee mug itself

  console.log('✅ Vapor effect added to target object.');
  return vaporMaterial;
}
