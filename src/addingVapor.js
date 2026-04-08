import { Box3, BufferAttribute, BufferGeometry, NormalBlending, Points, RepeatWrapping, ShaderMaterial, TextureLoader, Vector3 } from 'three';

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
const count = 10; // More particles gives the steam a softer plume shape

const positions = new Float32Array(count * 3);
const offsets = new Float32Array(count);
const scales = new Float32Array(count);
const drifts = new Float32Array(count * 2);
const speeds = new Float32Array(count);

for (let i = 0; i < count; i++) {
  const radialAngle = Math.random() * Math.PI * 2;
  const radialDistance = Math.random() * 0.02;
  positions.set([
    Math.cos(radialAngle) * radialDistance,
    -0.03 - Math.random() * 0.03,
    Math.sin(radialAngle) * radialDistance,
  ], i * 3);
  offsets[i] = Math.random() * totalFrames;
  scales[i] = 0.5 + Math.random() * 1.35;
  drifts[i * 2] = (Math.random() - 0.5) * 0.05;
  drifts[i * 2 + 1] = (Math.random() - 0.5) * 0.05;
  speeds[i] = 0.45 + Math.random() * 0.45;
}

vaporGeometry.setAttribute('position', new BufferAttribute(positions, 3));
vaporGeometry.setAttribute('offset', new BufferAttribute(offsets, 1));
vaporGeometry.setAttribute('scale', new BufferAttribute(scales, 1));
vaporGeometry.setAttribute('drift', new BufferAttribute(drifts, 2));
vaporGeometry.setAttribute('speed', new BufferAttribute(speeds, 1));

// --- Shader material ---
const vaporMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: NormalBlending,
  uniforms: {
    map: { value: vaporTexture },
    time: { value: 0 },
    tilesHoriz: { value: tilesHoriz },
    tilesVert: { value: tilesVert },
    totalFrames: { value: totalFrames },
  },
  vertexShader: `
    attribute float offset;
    attribute float scale;
    attribute vec2 drift;
    attribute float speed;
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
      vPhase = fract(time * speed + offset); // Each particle advances at a slightly different pace
      float col = mod(frame, tilesHoriz);
      float row = floor(frame / tilesHoriz);

      // Compute scale and offset for sprite sheet UVs
      vFrameScale = vec2(1.0 / tilesHoriz, 1.0 / tilesVert);
      vFrameOffset = vec2(col * vFrameScale.x, (tilesVert - row - 1.0) * vFrameScale.y);

      float lift = pow(vPhase, 1.15) * 0.22;
      float sway = sin(vPhase * 3.14159 + offset * 6.28318) * 0.012;
      vec3 moved = position + vec3(
        drift.x * vPhase + sway,
        lift,
        drift.y * vPhase
      );
      vec4 mvPosition = modelViewMatrix * vec4(moved, 1.0);
      gl_PointSize = (82.0 * scale) / max(-mvPosition.z, 0.1);
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
      
      float edgeFade = smoothstep(0.0, 0.2, texColor.a);
      float lifeFade = smoothstep(0.0, 0.14, vPhase) * (1.0 - smoothstep(0.58, 1.0, vPhase));
      float alpha = edgeFade * lifeFade * 0.32;
      texColor.rgb = vec3(0.9, 0.92, 0.95);
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
