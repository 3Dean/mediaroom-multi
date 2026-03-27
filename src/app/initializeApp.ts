// Function to toggle light helpers visibility
/* function toggleLightHelpers() {
  if (lightHelpers.length === 0) {
    console.log("No light helpers to toggle");
    return;
  }
  
  // Toggle visibility of all helpers
  let currentState = null;
  
  // Get current state from first helper
  if (lightHelpers[0]) {
    currentState = lightHelpers[0].visible;
  }
  
  // Toggle to opposite state
  const newState = (currentState === null) ? true : !currentState;
  
  lightHelpers.forEach(helper => {
    helper.visible = newState;
  });
  
  console.log(`Light helpers ${newState ? 'shown' : 'hidden'}`);
} */
// Extend the Window interface to include customLights
declare global {
  interface Window {
    customLights?: THREE.PointLight[];
    __musicspaceGetSeatState?: () => { nearbySeatId: string | null; currentSeatId: string | null; isSitting: boolean };
    __musicspaceOccupySeat?: (seatId: string) => boolean;
    __musicspaceReleaseSeat?: () => void;
    __musicspaceRequestSeatClaim?: (seatId: string) => void;
    __musicspaceRequestSeatRelease?: (seatId: string) => void;
    __musicspaceGetObjectState?: () => { hoveredObjectId: string | null; heldObjectId: string | null };
    __musicspaceRequestObjectClaim?: (objectId: string) => void;
    __musicspaceRequestObjectRelease?: (objectId: string, transform: { objectId: string; ownerSessionId: string | null; position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number } | null }) => void;
    __musicspaceApplyObjectSnapshot?: (snapshot: { objectId: string; ownerSessionId: string | null; position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number } | null }) => void;
  }
}
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
let controls: any;
import { addVaporToCoffee } from '../addingVapor.js'; // Import the vapor function
import { animateFlowers, initializeWindEffectOnModel } from '../wind'; // Import wind animation
//import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
//import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
//import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
//import { Vector3, Euler, Object3D } from 'three';
import * as THREE from 'three';

// --- TOUCH CONTROL VARIABLES ---
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
document.body.classList.add(isTouchDevice ? 'touch' : 'mouse');
// touchLookStartX and touchLookStartY are unused as touchLookPreviousX/Y capture initial values.
let touchLookPreviousX = 0;
let touchLookPreviousY = 0;
let lookingTouchId: number | null = null;
const lookSensitivity = 0.002; // Adjust as needed

let touchMoveStartX = 0;
let touchMoveStartY = 0;
let movingTouchId: number | null = null;
const touchMoveThreshold = 20; // Min pixels to drag before movement starts
// const touchMoveSensitivity = 0.05; // This variable was declared but not used.

// --- END TOUCH CONTROL VARIABLES ---

// For desktop click-and-drag view
let isDraggingView = false;
let previousMouseX = 0;
let previousMouseY = 0;

export function initializeApp() {
  console.log(`isTouchDevice: ${isTouchDevice}`); // Diagnostic log

let pointLights: THREE.PointLight[] = [];
let hues: number[] = [];
let lightHelpers: THREE.Object3D[] = []; // Store light helpers
let tvScreenObject: THREE.Object3D | null = null; // Reference to TV screen for seating view

 // Expose function to reposition TV screen at runtime
;(window as any).updateTvScreenPosition = (x: number, y: number, z: number) => {
  if (!tvScreenObject) {
    console.warn('TV screen object not yet loaded.');
    return;
  }
  tvScreenObject!.position.set(x, y, z);
  console.log(`TV screen moved to: ${x}, ${y}, ${z}`);
};

// Scene + Camera + Renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x888888);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 0); // Keep camera at local FPS origin

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
//(renderer as any).outputEncoding = (THREE as any).sRGBEncoding;

//document.body.appendChild(renderer.domElement);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace; // if not already set

const appDiv = document.getElementById('app');
if (appDiv) {
  appDiv.appendChild(renderer.domElement);
} else {
  document.body.appendChild(renderer.domElement);
  console.warn('#app not found, appending to body instead');
}
//document.getElementById('app')?.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = 'none';


// Listen for pointer move to update hover detection coordinates
renderer.domElement.addEventListener('pointermove', (event: PointerEvent) => {
    mouseForHover.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseForHover.y = - (event.clientY / window.innerHeight) * 2 + 1;
}, false);

(window as any).scene = scene;
(window as any).camera = camera;
(window as any).renderer = renderer;
// Make updateModelPosition available globally
(window as any).updateModelPosition = (modelUrl: string, x: number, y: number, z: number) => {
  updateModelPosition(modelUrl, new THREE.Vector3(x, y, z));
};
// Function to get current seatable object positions
(window as any).getSeatingPositions = () => {
  const positions: {[key: string]: THREE.Vector3} = {};
  scene.traverse((object: THREE.Object3D) => { // Added type
    if (object.userData && object.userData.type) {
      const type = object.userData.type;
      if (type === 'couch_left' || type === 'couch_right' || type === 'chair') {
        const position = new THREE.Vector3();
        object.getWorldPosition(position);
        positions[type] = position;
      }
    }
  });
  console.log('Current seating positions:', positions);
  return positions;
};

// Keep the old function for backward compatibility
(window as any).getCouchPositions = (window as any).getSeatingPositions;

// Function to reset seatable object positions to default values
(window as any).resetSeatingPositions = () => {
  updateModelPosition('/models/couch_left.glb', new THREE.Vector3(-3.7, 0, .8));
  updateModelPosition('/models/couch_right.glb', new THREE.Vector3(2.5, 0, .8));
  updateModelPosition('/models/chair.glb', new THREE.Vector3(0, 0, 0));
  updateModelPosition('/models/boss.glb', new THREE.Vector3(-0.8, 0, 1.89));
  console.log('Seating positions reset to default values');
};

// Keep the old function for backward compatibility
(window as any).resetCouchPositions = (window as any).resetSeatingPositions;
(window as any).__musicspaceApplyLocalPlayerTransform = (transform: { position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number } }) => {
  controls.object.position.set(transform.position.x, transform.position.y, transform.position.z);
  controls.object.rotation.set(0, transform.rotation.yaw, 0);
  camera.rotation.x = transform.rotation.pitch;
  moveState.forward = false;
  moveState.backward = false;
  moveState.left = false;
  moveState.right = false;
  velocity.x = 0;
  velocity.z = 0;
};

// Help function to explain available functions
(window as any).seatingHelp = () => {
  console.log(`
Available seating position functions:

Use "P" on the keyboard to toggle the couch position tester window.

1. updateModelPosition(modelUrl, x, y, z)
   - Updates the position of a model
   - Example: updateModelPosition('/models/couch_left.glb', -3, 0, 3)
   - Example: updateModelPosition('/models/chair.glb', 0, 0, 3)

2. getSeatingPositions()
   - Returns the current positions of all seatable objects (couches and chair)
   - Example: getSeatingPositions()

3. resetSeatingPositions()
   - Resets all seatable object positions to their default values
   - Example: resetSeatingPositions()

4. seatingHelp()
   - Displays this help message
   - Example: seatingHelp()

Note: The older functions getCouchPositions() and resetCouchPositions() 
are still available for backward compatibility.
`);
};

// Keep the old function for backward compatibility
(window as any).couchHelp = (window as any).seatingHelp;

// Log a message to let users know about the help function
console.log('Type "seatingHelp()" in the console to see available seating position functions');

// Function to open the couch position tester
(window as any).openCouchTester = () => {
  window.open('couch-position-tester.html', 'couchTester', 'width=850,height=700');
};

// Add keyboard shortcut to open couch position tester (press 'P')
window.addEventListener('keydown', (e) => {
  if (isTypingIntoUi(e.target)) {
    return;
  }

  if (e.code === 'KeyP') {
    (window as any).openCouchTester();
    console.log('Couch position tester opened in a new window');
  }
});

// Lights
const hemi = new THREE.HemisphereLight(0xfff3e6, 0x444444, 1.2);
hemi.position.set(0, 20, 0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xfde6ff, 0.2);
dir.position.set(5, 10, 7.5);
scene.add(dir);

// Clear any existing light helpers
  lightHelpers.forEach(helper => {
    if (helper.parent) {
      helper.parent.remove(helper);
    }
  }); 
  lightHelpers = [];

// Add directional light helper
/*   const directionalHelper = new THREE.DirectionalLightHelper(dir, 5);
  scene.add(directionalHelper);
  lightHelpers.push(directionalHelper); */

  

  // Point lights (original array for color cycling)
  const positions = [
    new THREE.Vector3(-1, 4, 0),     // Light 1
    new THREE.Vector3(1, 4, 2),     // Light 2
    //new THREE.Vector3(-6.7, 5, 3.17),    // Light 3
  //new THREE.Vector3(-11, 5, 3.13)     // Light 4
  ];
  
  positions.forEach((pos /*, i // Removed unused index 'i' */) => {
    const light = new THREE.PointLight(0xff00ff, 100, 40, 3);
    light.position.copy(pos);
    scene.add(light);
    pointLights.push(light);
    hues.push(Math.random()); // optional: gives each light a different starting color
    
    // Add point light helper
    /* const pointLightHelper = new THREE.PointLightHelper(light, 1);
    scene.add(pointLightHelper);
    lightHelpers.push(pointLightHelper); */
  });
  

// Music
const listener = new THREE.AudioListener();
camera.add(listener);


// Get the audio controls container from the DOM
const audioControlsContainer = document.getElementById('audioControls');
if (!audioControlsContainer) {
  console.error('Audio controls container not found in the DOM');
  throw new Error('Audio controls container not found in the DOM');
}

// Create play/pause button
const playButton = document.createElement('button');
playButton.textContent = 'Play Music';
playButton.style.padding = '8px 12px';
playButton.style.backgroundColor = '#9e552f';
playButton.style.color = 'white';
playButton.style.border = 'none';
playButton.style.borderRadius = '4px';
playButton.style.cursor = 'pointer';
playButton.style.fontWeight = 'bold';
playButton.style.fontSize = '11px';
audioControlsContainer.appendChild(playButton);

// Create SomaFM station buttons
const somaStations = [
  { name: 'Groove Salad (Chill)', stream: 'https://ice4.somafm.com/groovesalad-128-mp3', info: 'https://api.somafm.com/channels/groovesalad.json', mood: 'chill' },
  { name: 'Secret Agent (Jazz)', stream: 'https://ice6.somafm.com/secretagent-128-mp3', info: 'https://api.somafm.com/channels/secretagent.json', mood: 'jazz' },
  { name: 'Metal Detector (Metal)', stream: 'https://ice1.somafm.com/metal-128-mp3', info: 'https://api.somafm.com/channels/metal.json', mood: 'metal' },
  { name: 'Drone Zone', stream: 'https://ice1.somafm.com/dronezone-128-mp3', info: 'https://api.somafm.com/channels/dronezone.json', mood: 'drone' },
  { name: 'DEF CON Radio', stream: 'https://ice4.somafm.com/defcon-128-mp3', info: 'https://api.somafm.com/channels/defcon.json', mood: 'defcon' },
  { name: 'Beat Blender', stream: 'https://ice2.somafm.com/beatblender-128-mp3', info: 'https://api.somafm.com/channels/beatblender.json', mood: 'beat' },
  { name: 'Doomed (Dark)', stream: 'https://ice6.somafm.com/doomed-128-mp3', info: 'https://api.somafm.com/channels/doomed.json', mood: 'dark' },
  { name: 'Dub Step Beyond', stream: 'https://ice2.somafm.com/dubstep-128-mp3', info: 'https://api.somafm.com/channels/dubstep.json', mood: 'dubstep' },
  { name: 'Indie Pop Rocks', stream: 'https://ice1.somafm.com/indiepop-128-mp3', info: 'https://api.somafm.com/channels/indiepop.json', mood: 'indie' },
  { name: 'Mission Control', stream: 'https://ice6.somafm.com/missioncontrol-128-mp3', info: 'https://api.somafm.com/channels/missioncontrol.json', mood: 'space' }
];

// Dropdown to select station
const stationSelect = document.createElement('select');
stationSelect.style.padding = '6px';
stationSelect.style.borderRadius = '4px';
stationSelect.style.cursor = 'pointer';
stationSelect.style.fontSize = '12px';
stationSelect.style.backgroundColor = '#333';
stationSelect.style.color = '#fff';

somaStations.forEach((station, index) => {
  const option = document.createElement('option');
  option.value = index.toString();
  option.textContent = station.name;
  stationSelect.appendChild(option);
});
audioControlsContainer.appendChild(stationSelect);

// Create volume slider
const volumeSlider = document.createElement('input');
volumeSlider.type = 'range';
volumeSlider.min = '0';
volumeSlider.max = '1';
volumeSlider.step = '0.1';
volumeSlider.value = '0.5';
volumeSlider.style.width = '100px';
// volumeSlider.style.accentColor = '#007bff'; // Removed to rely on CSS for thumb
volumeSlider.style.cursor = 'pointer';
volumeSlider.style.pointerEvents = 'auto';
volumeSlider.id = 'volumeSlider'; // Add ID for CSS targeting
// Explicitly apply styles for track and appearance from index.html
volumeSlider.style.webkitAppearance = 'none';
volumeSlider.style.appearance = 'none';
volumeSlider.style.height = '8px';
volumeSlider.style.borderRadius = '4px';
volumeSlider.style.background = '#444'; // Track color
volumeSlider.style.outline = 'none';

// Create volume label
const volumeLabel = document.createElement('span');
volumeLabel.textContent = 'Volume: 50%';
volumeLabel.style.color = 'white';
volumeLabel.style.fontSize = '14px';
volumeLabel.style.marginRight = '5px';

// Add volume label and slider to container
//audioControlsContainer.appendChild(volumeLabel);
audioControlsContainer.appendChild(volumeSlider);

// Create HTML audio element for streaming
const audioElement = document.createElement('audio');
audioElement.style.display = 'none'; // Hide the audio element
document.body.appendChild(audioElement);

// URL of the stream
const streamUrl = 'https://ice4.somafm.com/groovesalad-128-mp3';
audioElement.src = streamUrl;
audioElement.crossOrigin = 'anonymous';
audioElement.preload = 'none'; // Don't preload until user clicks play

// Connect the HTML audio element to Three.js audio system
const sound = new THREE.Audio(listener);
sound.setMediaElementSource(audioElement);

// Track playing state
let isPlaying = false;

// Add loading indicator CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Play/pause button event listener
playButton.addEventListener('click', function() {
    if (listener.context.state === 'suspended') {
        listener.context.resume();
    }
    
    if (!isPlaying) {
        // Show loading state
        playButton.textContent = 'Loading...';
        playButton.disabled = true;
        playButton.style.backgroundColor = '#6c757d';
        
        // Add loading indicator
        const loadingIndicator = document.createElement('span');
        loadingIndicator.textContent = ' ⟳';
        loadingIndicator.style.display = 'inline-block';
        loadingIndicator.style.animation = 'spin 1s linear infinite';
        playButton.appendChild(loadingIndicator);
        
        // Start loading the audio
        audioElement.load();
        
        // Play when ready
        audioElement.play().then(() => {
            isPlaying = true;
            playButton.textContent = 'Pause';
            playButton.disabled = false;
            playButton.style.backgroundColor = '#dc3545'; // Red for pause
        }).catch(error => {
            console.error('Error playing audio:', error);
            playButton.textContent = 'Play Music';
            playButton.disabled = false;
            playButton.style.backgroundColor = '#824323';
        });
    } else {
        audioElement.pause();
        isPlaying = false;
        playButton.textContent = 'Play Music';
        playButton.style.backgroundColor = '#9e552f'; // Blue for play
    }
});

let selectedStationIndex = 0;
audioElement.src = somaStations[selectedStationIndex].stream;

stationSelect.addEventListener('change', () => {
  selectedStationIndex = parseInt(stationSelect.value);
  const selected = somaStations[selectedStationIndex];

  audioElement.src = selected.stream;
  audioElement.load();
  if (isPlaying) {
    audioElement.play();
    playButton.textContent = 'Pause';
    playButton.style.backgroundColor = '#dc3545';
  }
    // 🔁 Change mood textures based on selected station
  switchMoodTextures(selected.mood);
  //updateNowPlaying(); // Refresh song info
});

// Volume slider event listener - using 'input' for continuous update
volumeSlider.addEventListener('input', function() {
    if (listener.context.state === 'suspended') {
        listener.context.resume().then(() => {
            console.log('AudioContext resumed on volume input.');
        }).catch(e => console.error('Error resuming AudioContext on volume input:', e));
    }

    // On mobile, if audio is paused but playback is intended, try to play again.
    if (isTouchDevice && audioElement.paused && isPlaying) {
        audioElement.play().then(() => {
            console.log('Audio re-played on volume input (mobile).');
        }).catch(e => console.error('Error re-playing audio on volume input (mobile):', e));
    }

    const volume = parseFloat(volumeSlider.value);
    audioElement.volume = volume;
    volumeLabel.textContent = `Volume: ${Math.round(volume * 100)}%`;
    console.log('Volume set by input event to:', audioElement.volume);
});

// For touch devices, also try to resume context and play on touchstart of the slider
if (isTouchDevice) {
    volumeSlider.addEventListener('touchstart', function() {
        console.log('Volume slider touchstart (mobile)');
        if (listener.context.state === 'suspended') {
            listener.context.resume().then(() => {
                console.log('AudioContext resumed on volume touchstart (mobile).');
            }).catch(e => console.error('Error resuming context on volume touchstart (mobile):', e));
        }
        // If playback is intended but audio is paused, try to play.
        if (audioElement.paused && isPlaying) {
            audioElement.play().then(() => {
                console.log('Audio played on volume touchstart (mobile).');
            }).catch(e => console.error('Error playing audio on volume touchstart (mobile):', e));
        }
    }, { passive: true }); // Use passive listener as we are not calling preventDefault
}

// Prevent mousedown on slider from propagating to PointerLockControls
volumeSlider.addEventListener('mousedown', function(event) {
    event.stopPropagation();
});

// Handle audio loading events
audioElement.addEventListener('waiting', () => {
    playButton.textContent = 'Loading...';
    playButton.disabled = true;
    playButton.style.backgroundColor = '#6c757d';
    
    // Add loading indicator if not already present
    if (!playButton.querySelector('span')) {
        const loadingIndicator = document.createElement('span');
        loadingIndicator.textContent = ' ⟳';
        loadingIndicator.style.display = 'inline-block';
        loadingIndicator.style.animation = 'spin 1s linear infinite';
        playButton.appendChild(loadingIndicator);
    }
});

audioElement.addEventListener('playing', () => {
    playButton.textContent = 'Pause';
    playButton.disabled = false;
    playButton.style.backgroundColor = '#dc3545';
});

audioElement.addEventListener('error', (e) => {
    console.error('Audio error:', e);
    playButton.textContent = 'Error';
    playButton.disabled = false;
    playButton.style.backgroundColor = '#dc3545';
});



// Plan to play audioElement on user interaction to comply with browser autoplay policies


// Controls
controls = new PointerLockControls(camera, renderer.domElement);
// PointerLockControls calls .connect() in its constructor.

// Set rotation order for more intuitive FPS controls
camera.rotation.order = 'YXZ';
controls.object.rotation.order = 'YXZ';

scene.add(controls.object);
controls.object.position.set(0, 4, 4); // Lobby startup position before joining a room

// Ensure renderer canvas regains focus when pointer lock is active
document.addEventListener('pointerlockchange', () => {
    // This listener is for UI changes (cursor, focus) based on lock state.
    // PointerLockControls has its own internal listener for setting its .isLocked state.
    if (document.pointerLockElement === renderer.domElement) {
        renderer.domElement.focus();
        renderer.domElement.style.cursor = "none";
        
        // Ensure audio controls remain visible and interactive when pointer lock is active
        if (audioControlsContainer) {
            audioControlsContainer.style.display = 'flex';
            audioControlsContainer.style.zIndex = '9999';
            audioControlsContainer.style.pointerEvents = 'auto';
        }
    } else {
        renderer.domElement.style.cursor = "auto";
        // Reset movement state when pointer is unlocked
        resetMovementState();
    }
});
// ESC key shows cursor
window.addEventListener('keydown', (e) => {
    if (isTypingIntoUi(e.target)) {
        return;
    }

    if (e.code === 'Escape') renderer.domElement.style.cursor = 'auto';
});


 // Click on canvas to resume audio context (and start drag for desktop)
renderer.domElement.addEventListener('click', () => {
    // For non-touch devices, pointer lock is removed. Click-and-drag will handle view.
    // For touch devices, this click listener might not be relevant if touch events are primary.
    // Attempt to play video texture on first user interaction (mobile)
    video.play().catch(err => console.error('Error playing video texture:', err));
});

 if (isTouchDevice) {
    controls.disconnect(); // Disconnect PointerLockControls' own event listeners for mouse/pointerlock
    console.log("Touch device detected. Disconnected PointerLockControls listeners and initializing touch controls.");
    
    // Add custom touch listeners
    renderer.domElement.addEventListener('touchstart', (event: TouchEvent) => {
        // event.preventDefault(); 
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.clientX < window.innerWidth / 2 && movingTouchId === null) { // Left half for movement
                movingTouchId = touch.identifier;
                touchMoveStartX = touch.clientX;
                touchMoveStartY = touch.clientY;
            } else if (touch.clientX >= window.innerWidth / 2 && lookingTouchId === null) { // Right half for looking
                lookingTouchId = touch.identifier;
                // touchLookStartX = touch.clientX; // Redundant, touchLookPreviousX is used
                // touchLookStartY = touch.clientY; // Redundant, touchLookPreviousY is used
                touchLookPreviousX = touch.clientX;
                touchLookPreviousY = touch.clientY;
            }
        }
    });

    renderer.domElement.addEventListener('touchmove', (event: TouchEvent) => {
        // event.preventDefault();
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.identifier === movingTouchId) {
                const deltaX = touch.clientX - touchMoveStartX;
                const deltaY = touch.clientY - touchMoveStartY;

                // Forward/Backward (based on vertical drag)
                if (Math.abs(deltaY) > touchMoveThreshold) {
                    if (deltaY < -touchMoveThreshold) moveState.forward = true; else moveState.forward = false;
                    if (deltaY > touchMoveThreshold) moveState.backward = true; else moveState.backward = false;
                } else {
                    moveState.forward = false;
                    moveState.backward = false;
                }

                // Left/Right strafe (based on horizontal drag)
                if (Math.abs(deltaX) > touchMoveThreshold) {
                    if (deltaX < -touchMoveThreshold) moveState.left = true; else moveState.left = false;
                    if (deltaX > touchMoveThreshold) moveState.right = true; else moveState.right = false;
                } else {
                    moveState.left = false;
                    moveState.right = false;
                }
            } else if (touch.identifier === lookingTouchId) {
                const deltaX = touch.clientX - touchLookPreviousX;
                const deltaY = touch.clientY - touchLookPreviousY;

                // Yaw (left/right) - Rotate the controls.object (which camera is parented to)
                controls.object.rotation.y -= deltaX * lookSensitivity;

                // Pitch (up/down) - Rotate the camera itself
                camera.rotation.x -= deltaY * lookSensitivity;
                camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x)); // Clamp pitch

                touchLookPreviousX = touch.clientX;
                touchLookPreviousY = touch.clientY;
            }
        }
    });

    renderer.domElement.addEventListener('touchend', (event: TouchEvent) => {
        // event.preventDefault();
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.identifier === movingTouchId) {
                movingTouchId = null;
                moveState.forward = false;
                moveState.backward = false;
                moveState.left = false;
                moveState.right = false;
            } else if (touch.identifier === lookingTouchId) {
                lookingTouchId = null;
            }
        }
    });

    // Hide mouse-specific hints if any
    const couchTesterHintElement = document.querySelector('div[style*="Press P to open couch position tester"]');
    if (couchTesterHintElement) (couchTesterHintElement as HTMLElement).style.display = 'none';
} else {
    // Desktop click-and-drag view controls
    controls.disconnect(); // Disconnect PointerLockControls' default mouse listeners
    console.log("Desktop: Initializing click-and-drag view controls.");

    renderer.domElement.addEventListener('mousedown', (event: MouseEvent) => {
        if (event.button === 0) { // Only on left click
            isDraggingView = true;
            previousMouseX = event.clientX;
            previousMouseY = event.clientY;
            renderer.domElement.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (event: MouseEvent) => {
        if (isDraggingView) {
            const deltaX = event.clientX - previousMouseX;
            const deltaY = event.clientY - previousMouseY;

            // Yaw (left/right) - Rotate the controls.object (which camera is parented to)
            controls.object.rotation.y -= deltaX * lookSensitivity;

            // Pitch (up/down) - Rotate the camera itself
            camera.rotation.x -= deltaY * lookSensitivity;
            camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x)); // Clamp pitch

            previousMouseX = event.clientX;
            previousMouseY = event.clientY;
        }
    });

    window.addEventListener('mouseup', (event: MouseEvent) => {
        if (event.button === 0) { // Only on left click release
            isDraggingView = false;
            renderer.domElement.style.cursor = 'grab'; // Or 'auto' if you prefer
        }
    });
    // Initial cursor style
    renderer.domElement.style.cursor = 'grab';
}

// Navmesh collision collector
const collidableMeshList: THREE.Mesh[] = [];

// Sitting position model and interaction
const sittingPositionObjects: THREE.Object3D[] = [];
const couchObjects: THREE.Object3D[] = [];
let nearCouch: THREE.Object3D | null = null;
let nearSittingPosition: THREE.Object3D | null = null;
let currentSeatId: string | null = null;
let isSitting = false;
// let sittingPosition = new THREE.Vector3(); // Replaced by direct calculation
// let sittingRotation = new THREE.Euler(); // Replaced by direct calculation
let standingPosition = new THREE.Vector3(); // Stores the full (x,y,z) position before sitting
// standingYaw and standingPitch are no longer needed as we retain current seated orientation when standing.
let standingHeight = 1.6; // Default standing height - this is effectively eye height
const sittingEyeHeight = 1.0; // Eye height when sitting
const proximityDistance = 2.01; // Increased from 2 to make detection easier

// Debug information
console.log("Couch interaction system initialized");

// Create loading screen overlay

const manager = new THREE.LoadingManager();
manager.onStart = function (url, itemsLoaded, itemsTotal) {
  console.log(`Started loading: ${url}`);
  console.log(`Progress: ${itemsLoaded} of ${itemsTotal}`);
};
manager.onProgress = function (url, itemsLoaded, itemsTotal) {
   console.log(`📦 Loading ${url} (${itemsLoaded}/${itemsTotal})`);
  const progress = (itemsLoaded / itemsTotal) * 100;

  const bar = document.getElementById('progress-bar');
  if (bar) {
    bar.style.width = `${progress}%`;
  }
};
manager.onLoad = function () {
   const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen && loadingScreen.parentNode) {
    loadingScreen.parentNode.removeChild(loadingScreen); // 👈 physically removes it from DOM
  }
  console.log('✅ All assets loaded and loading screen removed.');
};
manager.onError = function (url) {
 console.error(`❌ Error loading: ${url}`);
  const bar = document.getElementById('progress-bar');
  if (bar) {
    bar.style.background = 'red';
  }
};

// Preload emission textures
const emitLoader = new THREE.TextureLoader(manager);
const EMIT_COUNT = 24;
const emitTextures: THREE.Texture[] = [];
for (let i = 0; i < EMIT_COUNT; i++) {
  const idx = i.toString().padStart(5, '0');
  const tex = emitLoader.load(`/images/mixingboardemit/mixingboard_emit_${idx}.jpg`);
  tex.flipY = false;
  // Ensure UV coordinates are used directly
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  emitTextures.push(tex);
}




// GLTF Loader
const loader = new GLTFLoader(manager);
loadDropAnchors();

// Vapor effect material
let vaporEffectMaterial: THREE.ShaderMaterial | null = null;

// Store mixing-board meshes for animation
const mixingBoardMeshes: THREE.Mesh[] = [];

// Animation timing
let emitFrame = 0;
let emitAccumulator = 0;
const EMIT_FPS = 3;
const EMIT_INTERVAL = 1 / EMIT_FPS;
const emitClock = new THREE.Clock();

// Custom rotations for specific models (in radians)
const modelRotations: {[key: string]: THREE.Euler} = {
  '/models/leakstereo.glb': new THREE.Euler(0, -3.3, 0), // 90 degrees around Y axis
  //'/models/chair.glb': new THREE.Euler(0, Math.PI, 0),          // 180 degrees around Y axis
  // Add more model rotations as needed
};

// Load navmesh (invisible, collision only)
loader.load('/models/navmesh.glb', (gltf: any) => {
  const nav = gltf.scene;
  nav.visible = false;
  scene.add(nav);
  nav.traverse((child: THREE.Object3D) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.visible = false;
      collidableMeshList.push(mesh);
      
    }
  });
});

loader.load('/models/mixingboard.glb', (gltf: any) => {
  const board = gltf.scene;
  board.traverse((child: THREE.Object3D) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const stdMat = (mesh.material as THREE.MeshStandardMaterial).clone();
      stdMat.emissive = new THREE.Color(0xffffff);
      stdMat.emissiveIntensity = 1;
      stdMat.emissiveMap = emitTextures[0];
      mesh.material = stdMat;
      mixingBoardMeshes.push(mesh);
      
    }
  });
  scene.add(board);
});

// 1) Load, add, clone & offset the plant stand
loader.load('/models/plantstand2_L.glb', (gltf: any) => {
  const originalStand = gltf.scene;
  scene.add(originalStand);

  const standClone = originalStand.clone(true);
  standClone.position.x += 6.1;      // move clone 2.8 units (≈6 m) on X
  scene.add(standClone);
});

// 2) Load, add, clone & offset the plant leaves
loader.load('/models/plantleaves2_L.glb', (gltf: any) => {
  const originalLeaves = gltf.scene;
  scene.add(originalLeaves);

    // **Init wind on the *original* leaves**
  initializeWindEffectOnModel(originalLeaves, 'plantleaves2_L');

  const leavesClone = originalLeaves.clone(true);
  leavesClone.position.x += 6.1;      // same offset on X
  scene.add(leavesClone);

  // if you still want the wind effect on the clone:
  initializeWindEffectOnModel(leavesClone, 'plantleaves2_L');
});

// Load other models into scene
const staticModelUrls = [
  '/models/boss.glb',
  '/models/chair.glb',
  '/models/couch_left.glb', // Will be tracked for sitting
  '/models/couch_right.glb', // Will be tracked for sitting
  '/models/desk.glb',
  '/models/frames.glb',
  '/models/image01.glb',
  '/models/image02.glb',
  '/models/image03.glb',
  '/models/image04.glb',
  '/models/leakstereo.glb',
  '/models/soundboard.glb',
  '/models/speakers.glb',
  '/models/vinylrecord.glb',
  '/models/sphereenv.glb',
  '/models/structure_floor.glb',
  '/models/structure_wall001.glb',
  '/models/structure_wall002.glb',
  '/models/structure_wall003.glb',
  '/models/rug.glb',
  '/models/coffee.glb' // Add coffee model
];

const pickableUrls = ['/models/boss.glb', '/models/leakstereo.glb', '/models/vinylrecord.glb', '/models/coffee.glb'];
const interactiveObjects: THREE.Mesh[] = []; // Will store child meshes of pickable objects
const animationMixers: {[key: string]: THREE.AnimationMixer} = {};
const modelAnimations: {[key: string]: THREE.AnimationClip[]} = {};
const pickableObjectMap = new Map<string, THREE.Object3D>();
let heldObject: THREE.Object3D | null = null; // Can now be a Group/Scene (GLB root)
let heldObjectId: string | null = null;
const spinSpeed = 1.0; // radians per second
const heldObjectOffset = new THREE.Vector3(0.32, -0.28, -0.9);
const raycaster = new THREE.Raycaster();
const pickupDistance = 3;
let hoveredObject: THREE.Mesh | null = null;
const mouseForHover = new THREE.Vector2(); // For hover detection based on mouse/touch position
const objectDropTypeAliases: Record<string, string> = {
  coffee: 'mug',
};
type DropAnchor = {
  anchorId: string;
  objectType: string;
  position: THREE.Vector3;
  yaw: number;
};
type ObjectReleaseAnimation = {
  objectId: string;
  objectRoot: THREE.Object3D;
  startTime: number;
  durationMs: number;
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  endQuaternion: THREE.Quaternion;
};
const dropAnchorMap = new Map<string, DropAnchor[]>();
const activeObjectAnimations = new Map<string, ObjectReleaseAnimation>();
const releaseAnimationDurationMs = 220;

// Define positions for couch models
const modelPositions: { [key: string]: THREE.Vector3 } = {
  '/models/couch_left.glb': new THREE.Vector3(-3.7, 0, .8),  // Adjust these values as needed
  '/models/couch_right.glb': new THREE.Vector3(2.5, 0, .8)   // Adjust these values as needed
};

function getDropObjectType(objectId: string) {
  return objectDropTypeAliases[objectId] ?? objectId;
}

function registerDropAnchor(anchor: DropAnchor) {
  const anchors = dropAnchorMap.get(anchor.objectType) ?? [];
  anchors.push(anchor);
  anchors.sort((left, right) => left.anchorId.localeCompare(right.anchorId));
  dropAnchorMap.set(anchor.objectType, anchors);
}

function findBestDropAnchor(objectId: string): DropAnchor | null {
  const objectType = getDropObjectType(objectId);
  const anchors: DropAnchor[] = dropAnchorMap.get(objectType) ?? dropAnchorMap.get('any') ?? [];
  if (anchors.length === 0) {
    return null;
  }

  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  const origin = camera.position.clone();
  let bestAnchor: DropAnchor | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  anchors.forEach((anchor) => {
    const toAnchor = anchor.position.clone().sub(origin);
    const distance = toAnchor.length();
    if (distance > pickupDistance * 2) {
      return;
    }

    const directionToAnchor = toAnchor.clone().normalize();
    const facingScore = cameraDirection.dot(directionToAnchor);
    if (facingScore < 0.1) {
      return;
    }

    const score = distance - facingScore * 1.25;
    if (score < bestScore) {
      bestScore = score;
      bestAnchor = anchor;
    }
  });

  return bestAnchor;
}

function loadDropAnchors() {
  loader.load('/models/drop_anchors.glb', (gltf: any) => {
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((child: THREE.Object3D) => {
      const match = child.name.match(/^drop_([a-z0-9]+)_(\d+)$/i);
      if (!match) {
        return;
      }

      const worldPosition = new THREE.Vector3();
      const worldQuaternion = new THREE.Quaternion();
      child.getWorldPosition(worldPosition);
      child.getWorldQuaternion(worldQuaternion);
      const euler = new THREE.Euler().setFromQuaternion(worldQuaternion, 'YXZ');

      registerDropAnchor({
        anchorId: child.name,
        objectType: match[1].toLowerCase(),
        position: worldPosition.clone(),
        yaw: euler.y,
      });
    });
  });
}

function startObjectReleaseAnimation(snapshot: { objectId: string; ownerSessionId: string | null; position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number } | null }) {
  const objectRoot = pickableObjectMap.get(snapshot.objectId);
  if (!objectRoot) {
    return;
  }

  const startPosition = new THREE.Vector3();
  const startQuaternion = new THREE.Quaternion();
  objectRoot.updateMatrixWorld(true);
  objectRoot.getWorldPosition(startPosition);
  objectRoot.getWorldQuaternion(startQuaternion);

  if (objectRoot.parent !== scene) {
    objectRoot.parent?.remove(objectRoot);
    scene.add(objectRoot);
  }

  objectRoot.visible = true;
  objectRoot.position.copy(startPosition);
  objectRoot.quaternion.copy(startQuaternion);

  const endQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, snapshot.rotation?.yaw ?? 0, 0, 'YXZ'));
  activeObjectAnimations.set(snapshot.objectId, {
    objectId: snapshot.objectId,
    objectRoot,
    startTime: performance.now(),
    durationMs: releaseAnimationDurationMs,
    startPosition,
    endPosition: new THREE.Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z),
    startQuaternion,
    endQuaternion,
  });

  if (heldObjectId === snapshot.objectId) {
    heldObject = null;
    heldObjectId = null;
  }
}

function updateObjectReleaseAnimations(now: number) {
  activeObjectAnimations.forEach((animation, objectId) => {
    const progress = Math.min((now - animation.startTime) / animation.durationMs, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    animation.objectRoot.position.lerpVectors(animation.startPosition, animation.endPosition, eased);
    animation.objectRoot.quaternion.copy(animation.startQuaternion).slerp(animation.endQuaternion, eased);

    if (progress >= 1) {
      animation.objectRoot.position.copy(animation.endPosition);
      animation.objectRoot.quaternion.copy(animation.endQuaternion);
      activeObjectAnimations.delete(objectId);
    }
  });
}

// Function to create sitting position models at couch and chair locations
function createSittingPositions() {
  // Clear existing sitting position objects
  sittingPositionObjects.forEach(obj => {
    scene.remove(obj);
  });
  sittingPositionObjects.length = 0;
  
  // Create new sitting position objects based on seatable object positions
  couchObjects.forEach(seatable => {
    const objectPosition = new THREE.Vector3();
    seatable.getWorldPosition(objectPosition);
    const objectType = seatable.userData.type;
    
    // Load and clone the sitting position model
    loader.load('/models/sittingposition.glb', (gltf: any) => {
      const sittingModel = gltf.scene.clone();
      
      // Position the sitting model relative to the object type
      if (objectType === 'chair') {
        // Position for chair - centered on the chair with appropriate height
        sittingModel.position.set(objectPosition.x + 0.1, objectPosition.y + 0.5, objectPosition.z -.4);
        
        // For chair, we want to face forward (assuming chair faces -Z direction)
        // You may need to adjust this angle based on the chair's orientation
        sittingModel.rotation.set(0, 0, 0);
      } else if (objectType === 'couch_left') {
        // Position for left couch
        sittingModel.position.set(objectPosition.x - 0.1, objectPosition.y + 0.5, objectPosition.z + 0.5);
        
        // Calculate rotation to face the center of the room
        const centerPoint = new THREE.Vector3(0, sittingModel.position.y, 0);
        const direction = new THREE.Vector3().subVectors(centerPoint, sittingModel.position).normalize();
        const angle = Math.atan2(direction.x, direction.z) + Math.PI;
        sittingModel.rotation.set(0, angle, 0);
      } else { // couch_right
        // Position for right couch
        sittingModel.position.set(objectPosition.x + 0.1, objectPosition.y + 0.5, objectPosition.z + 0.5);
        
        // Calculate rotation to face the center of the room
        const centerPoint = new THREE.Vector3(0, sittingModel.position.y, 0);
        const direction = new THREE.Vector3().subVectors(centerPoint, sittingModel.position).normalize();
        const angle = Math.atan2(direction.x, direction.z) + Math.PI;
        sittingModel.rotation.set(0, angle, 0);
      }
      
      // Store reference to which object this sitting position belongs to
      sittingModel.userData = { 
        type: 'sitting_position',
        forCouch: objectType,
        seatId: `seat-${objectType}`
      };
      
      // Make the model invisible but keep it in the scene for interaction
      sittingModel.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          // Set to false to make invisible, true for debugging
          (child as THREE.Mesh).visible = false;
        }
      });
      
      scene.add(sittingModel);
      sittingPositionObjects.push(sittingModel);
      
      console.log(`Created sitting position for ${objectType} at:`, sittingModel.position);
    });
  });
}

// Function to update model position
function updateModelPosition(modelUrl: string, position: THREE.Vector3) {
  // Update the position in the modelPositions object
  modelPositions[modelUrl] = position;
  
  // Find the model in the scene and update its position
  scene.traverse((object: THREE.Object3D) => { // Added type
    if (object.userData && object.userData.type) {
      const type = object.userData.type;
      if ((type === 'couch_left' && modelUrl === '/models/couch_left.glb') || 
          (type === 'couch_right' && modelUrl === '/models/couch_right.glb') ||
          (type === 'boss' && modelUrl === '/models/boss.glb') ||
          (type === 'album' && modelUrl === '/models/vinylrecord.glb') ||
          (type === 'coffee' && modelUrl === '/models/coffee.glb') ||
          (type === 'chair' && modelUrl === '/models/chair.glb')) {
        object.position.copy(position);
        
        // Update helper sphere position
        const objectPosition = new THREE.Vector3();
        object.getWorldPosition(objectPosition);
        
        // Find the helper sphere for this object
        scene.traverse((child: THREE.Object3D) => { // Added type
          if (child.userData && child.userData.helperFor === type) {
            child.position.copy(objectPosition);
            child.position.y += 2; // Position above the object for visibility
          }
        });
        
        console.log(`Updated ${type} position to:`, objectPosition);
        
        // Update sitting positions when seatable objects move
        createSittingPositions();
      }
    }
  });
}

// List model names
(window as any).listSceneObjects = function() {
  console.log('--- Scene Graph ---');
  scene.traverse((obj) => {
    console.log(`[${obj.type}] ${obj.name}`);
  });
};


// Add model position to modelPositions
modelPositions['/models/chair.glb'] = new THREE.Vector3(0, 0, 0); // Default chair position
modelPositions['/models/boss.glb'] = new THREE.Vector3(-0.847, 0, -2.02); // Default audio equipment position
modelPositions['/models/leakstereo.glb'] = new THREE.Vector3(1.4933, -0.011, 4.558); // Default Stereo position
modelPositions['/models/vinylrecord.glb'] = new THREE.Vector3(1.523, 0.23, -2.28); // Default record position
modelPositions['/models/coffee.glb'] = new THREE.Vector3(-0.051, 1.069, -1.1182); // Default coffee mug position

// Example usage:
// updateModelPosition('/models/couch_left.glb', new THREE.Vector3(-5, 0, 3));

modelRotations['/models/vinylrecord.glb'] = new THREE.Euler(Math.PI / 2, 0, 0); // example: rotate 90° around Y
modelRotations['/models/coffee.glb'] = new THREE.Euler(0, 30, 0); // example: rotate 90° around Y

staticModelUrls.forEach(url => {
  loader.load(url, (gltf: any) => {
    const modelScene = gltf.scene;
    if (url === '/models/coffee.glb') {
  vaporEffectMaterial = addVaporToCoffee(modelScene);
}

    // ✅ Extract filename and assign it as the name
    const parts = url.split('/');
    const filename = parts[parts.length - 1]; // "image01.glb"
    const modelName = filename.replace('.glb', ''); // "image01"

    modelScene.name = modelName;

    scene.add(modelScene);

    // Initialize wind effect for plant leaves
    if (url === '/models/plantleaves2_L.glb') {
      initializeWindEffectOnModel(modelScene, 'plantleaves_l');
    }
    if (url === '/models/plantleaves_r.glb') {
      initializeWindEffectOnModel(modelScene, 'plantleaves_r');
    }
    
    // Set position for specific models if defined
    if (modelPositions[url]) {
      modelScene.position.copy(modelPositions[url]);
    }

    // Apply custom rotation if defined
    if (url in modelRotations) {
      gltf.scene.rotation.copy(modelRotations[url]);
    }
    // Store animations if this is an interactive model
    if (pickableUrls.includes(url)) {
      gltf.scene.userData.modelUrl = url;
      interactiveObjects.push(gltf.scene);
    }
      
      // Store animations if any
      if (gltf.animations && gltf.animations.length > 0) {
        modelAnimations[url] = gltf.animations;
        const mixer = new THREE.AnimationMixer(gltf.scene);
        animationMixers[url] = mixer;
      }
    
// Track couch and chair objects for sitting interaction
    if (url === '/models/couch_left.glb' || url === '/models/couch_right.glb' || url === '/models/chair.glb') {
      couchObjects.push(modelScene);
      
      // Set the type based on the model
      if (url === '/models/chair.glb') {
        modelScene.userData.type = 'chair';
      } else {
        modelScene.userData.type = url.includes('left') ? 'couch_left' : 'couch_right';
      }
      
      // Log position for debugging
      const objectPosition = new THREE.Vector3();
      modelScene.getWorldPosition(objectPosition);
      console.log(`Loaded ${modelScene.userData.type} at position:`, objectPosition);
      
      // Add a helper sphere to visualize the position
      const sphereGeometry = new THREE.SphereGeometry(.2, 16, 16);
      const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: url === '/models/chair.glb' ? 0x00ff00 : 0xff0000 // Green for chair, red for couches
      });
      const sphereHelper = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphereHelper.position.copy(objectPosition);
      sphereHelper.position.y += 2; // Position above the object for visibility
      // Store reference to which object this helper belongs to
      sphereHelper.userData = { helperFor: modelScene.userData.type };
      //scene.add(sphereHelper);
      
      // Create sitting positions after all seatable objects are loaded
      createSittingPositions();
    }
    
    if (pickableUrls.includes(url)) {
      modelScene.userData.isPickableRoot = true;
      modelScene.userData.url = url;
      modelScene.userData.objectId = modelName;
      pickableObjectMap.set(modelName, modelScene);

      modelScene.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          child.userData.pickableGLBRoot = modelScene;
          child.userData.objectId = modelName;
          interactiveObjects.push(child as THREE.Mesh);
        }
      });
    }
  });
});



// Function to switch mood textures
function switchMoodTextures(mood: string) {
  const loader = new THREE.TextureLoader(manager);

  const frameNames = ['image01', 'image02', 'image03', 'image04'];

  frameNames.forEach((frameName) => {
    const texturePath = `/images/moods/${mood}/${frameName}.png`;

    let meshToUpdate: THREE.Mesh | null = null;

    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.name === frameName) {
        meshToUpdate = obj as THREE.Mesh;
      }
    });

    if (!meshToUpdate) {
      console.warn(`Mesh not found: ${frameName}`);
      return;
    }

    loader.load(texturePath, (newTexture) => {
      //renderer.toneMapping = THREE.ACESFilmicToneMapping;
      //renderer.toneMappingExposure = 1.2;
      //(renderer as any).outputEncoding = (THREE as any).sRGBEncoding;

      newTexture.flipY = false;
      //(newTexture as any).encoding = (THREE as any).sRGBEncoding;
      newTexture.colorSpace = THREE.SRGBColorSpace;

      // Create a new standard material (instead of keeping AO/etc from the GLB)
      const updatedMaterial = new THREE.MeshStandardMaterial({
        map: newTexture,
        metalness: 0.0,
        roughness: 1.0,
        toneMapped: true
      });

      updatedMaterial.needsUpdate = true;
      meshToUpdate!.material = updatedMaterial;

      console.log(`✅ Replaced full material for ${frameName}`);
    });
  });
}

(window as any).switchMoodTextures = switchMoodTextures;


// Initialize vapor effect
//vaporEffectMaterial = addVaporToCoffee(scene, loader);


// Create a button element for sitting interaction
const interactionPrompt = document.createElement('button'); // Changed to button
interactionPrompt.id = 'interactionButton'; // Added ID for styling/selection
interactionPrompt.style.position = 'absolute';
interactionPrompt.style.top = '50%';
interactionPrompt.style.left = '50%';
interactionPrompt.style.transform = 'translate(-50%, -50%)';
interactionPrompt.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Slightly darker background
interactionPrompt.style.color = 'white';
interactionPrompt.style.padding = '12px 20px'; // Larger padding
interactionPrompt.style.border = '1px solid #fff'; // White border
interactionPrompt.style.borderRadius = '8px'; // More rounded corners
interactionPrompt.style.fontFamily = 'Arial, sans-serif';
interactionPrompt.style.fontSize = '16px';
interactionPrompt.style.cursor = 'pointer'; // Add pointer cursor
interactionPrompt.style.display = 'none';
interactionPrompt.style.zIndex = '1001'; // Ensure it's above other elements like debug
// interactionPrompt.style.pointerEvents = 'none'; // Removed, button needs pointer events
document.body.appendChild(interactionPrompt);


const closeButton = document.createElement('button');
closeButton.id = 'closeButton';
closeButton.textContent = 'Stand';
closeButton.style.position = 'absolute';
closeButton.style.top = '10px';
closeButton.style.right = '10px';
closeButton.style.padding = '8px 12px';
closeButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
closeButton.style.color = 'white';
closeButton.style.border = '1px solid #fff';
closeButton.style.borderRadius = '5px';
closeButton.style.cursor = 'pointer';
closeButton.style.display = 'none';
closeButton.style.zIndex = '1001';
document.body.appendChild(closeButton);

function performStandAction() {
  isSitting = false;
  currentSeatId = null;
  controls.object.position.copy(standingPosition);
  interactionPrompt.style.display = 'none';
  closeButton.style.display = 'none';
  moveState.forward = moveState.backward = moveState.left = moveState.right = false;
  velocity.x = 0;
  velocity.z = 0;
}

function requestSeatClaim() {
  if (!nearSittingPosition || isSitting) {
    return;
  }

  const seatId = nearSittingPosition.userData.seatId as string | undefined;
  if (seatId && window.__musicspaceRequestSeatClaim) {
    window.__musicspaceRequestSeatClaim(seatId);
    return;
  }

  triggerSitAction();
}

function requestSeatRelease() {
  if (!isSitting) {
    return;
  }

  if (currentSeatId && window.__musicspaceRequestSeatRelease) {
    window.__musicspaceRequestSeatRelease(currentSeatId);
    return;
  }

  performStandAction();
}

// Close button click handler to stand up
closeButton.addEventListener('click', (event: MouseEvent) => {
  event.stopPropagation();
  if (isSitting) {
    requestSeatRelease();
    console.log('Standing via close button', controls.object.position);
  }
});

 // Add event listener to the interaction button
 interactionPrompt.addEventListener('click', (event) => {
   if (nearSittingPosition && !isSitting) {
     requestSeatClaim();
   }
   event.stopPropagation();
 });

// Function to handle the sitting action
function triggerSitAction(targetSeatId?: string) {
  if (targetSeatId) {
    const matchingSeat = sittingPositionObjects.find((seat) => seat.userData.seatId === targetSeatId);
    if (!matchingSeat) {
      return false;
    }
    nearSittingPosition = matchingSeat;
  }

  if (!nearSittingPosition) {
    return false;
  }

  isSitting = true;
  currentSeatId = (nearSittingPosition.userData.seatId as string | undefined) ?? null;
  standingPosition.copy(controls.object.position);

  const seatBaseWorldPosition = new THREE.Vector3();
  nearSittingPosition.getWorldPosition(seatBaseWorldPosition);

  controls.object.position.set(
    seatBaseWorldPosition.x,
    seatBaseWorldPosition.y + sittingEyeHeight,
    seatBaseWorldPosition.z
  );
  const sitRot = nearSittingPosition.rotation;
  controls.object.rotation.set(0, sitRot.y, 0);
  camera.rotation.x = 0;

  console.log(`Sitting via button. Player at:`, controls.object.position, `Facing Yaw:`, controls.object.rotation.y);

  moveState.forward = false;
  moveState.backward = false;
  moveState.left = false;
  moveState.right = false;

  interactionPrompt.style.display = 'none';
  closeButton.style.display = 'block';
  return true;
}

window.__musicspaceGetSeatState = () => ({
  nearbySeatId: (nearSittingPosition?.userData.seatId as string | undefined) ?? null,
  currentSeatId,
  isSitting,
});
window.__musicspaceOccupySeat = (seatId: string) => triggerSitAction(seatId);
window.__musicspaceReleaseSeat = () => {
  performStandAction();
};

// Create debug display for position information
const debugDisplay = document.createElement('div');
debugDisplay.style.position = 'absolute';
debugDisplay.style.top = '74px';
debugDisplay.style.left = '350px';
debugDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
debugDisplay.style.color = 'white';
debugDisplay.style.padding = '10px';
debugDisplay.style.borderRadius = '5px';
debugDisplay.style.fontFamily = 'monospace';
debugDisplay.style.fontSize = '12px';
debugDisplay.style.pointerEvents = 'none'; // Prevent interaction with the debug display
debugDisplay.style.maxWidth = '300px';
debugDisplay.style.overflow = 'hidden';
debugDisplay.style.whiteSpace = 'pre-wrap';
debugDisplay.style.zIndex = '1000';
debugDisplay.style.display = 'none'; // Hide the debug display by default
document.body.appendChild(debugDisplay);

// Add debug display toggle functionality (press 'I' to toggle)
window.addEventListener('keydown', (e) => {
  if (isTypingIntoUi(e.target)) {
    return;
  }

  if (e.code === 'KeyI') {
    debugDisplay.style.display = debugDisplay.style.display === 'none' ? 'block' : 'none';
    console.log(`Debug display ${debugDisplay.style.display === 'none' ? 'hidden' : 'shown'}`);
  }
});

// Create a hint for the couch position tester
const couchTesterHint = document.createElement('div');
couchTesterHint.style.position = 'absolute';
couchTesterHint.style.bottom = '10px';
couchTesterHint.style.right = '10px';
couchTesterHint.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
couchTesterHint.style.color = 'white';
couchTesterHint.style.padding = '10px';
couchTesterHint.style.borderRadius = '5px';
couchTesterHint.style.fontFamily = 'Arial, sans-serif';
couchTesterHint.style.fontSize = '14px';
couchTesterHint.style.pointerEvents = 'none'; // Prevent interaction with the hint
couchTesterHint.style.zIndex = '1000';
couchTesterHint.textContent = 'Press P to open couch position tester';
document.body.appendChild(couchTesterHint);

// Hide the hint after 10 seconds
setTimeout(() => {
  couchTesterHint.style.opacity = '0';
  couchTesterHint.style.transition = 'opacity 1s ease-out';
  
  // Remove from DOM after fade out
  setTimeout(() => {
    couchTesterHint.remove();
  }, 1000);
}, 10000);

// Function to update debug display
function updateDebugDisplay() {
  if (!debugDisplay) return;
  
  const playerPos = controls.object.position.clone();
  let nearestObjectInfo = 'None';
  let nearestSitPosInfo = 'None';
  
  if (nearCouch) {
    const objPos = new THREE.Vector3();
    nearCouch.getWorldPosition(objPos);
    const distance = playerPos.distanceTo(objPos);
    nearestObjectInfo = `${nearCouch.userData.type}\nPosition: ${objPos.x.toFixed(2)}, ${objPos.y.toFixed(2)}, ${objPos.z.toFixed(2)}\nDistance: ${distance.toFixed(2)}`;
  }
  
  if (nearSittingPosition) {
    const sitPos = new THREE.Vector3();
    nearSittingPosition.getWorldPosition(sitPos);
    const distance = playerPos.distanceTo(sitPos);
    nearestSitPosInfo = `For: ${nearSittingPosition.userData.forCouch}\nPosition: ${sitPos.x.toFixed(2)}, ${sitPos.y.toFixed(2)}, ${sitPos.z.toFixed(2)}\nDistance: ${distance.toFixed(2)}`;
  }
  
  debugDisplay.textContent = 
`Player Position: ${playerPos.x.toFixed(2)}, ${playerPos.y.toFixed(2)}, ${playerPos.z.toFixed(2)}
Sitting: ${isSitting ? 'Yes' : 'No'}
Nearest Seatable Object: ${nearestObjectInfo}
Nearest Sitting Position: ${nearestSitPosInfo}`;
}

// TV screen with looping video texture
const video = document.createElement('video');
video.src = '/videos/tvscreen.mp4';
video.crossOrigin = 'anonymous';
video.loop = true;
video.muted = true;
video.setAttribute('playsinline', 'true');
video.setAttribute('webkit-playsinline', 'true');
(video as any).playsInline = true;
video.play();
const videoTexture = new THREE.VideoTexture(video);
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
videoTexture.format = THREE.RGBAFormat;

loader.load('/models/tvscreen.glb', (gltf: any) => {
  tvScreenObject = gltf.scene;
  // Set initial TV screen position
  tvScreenObject!.position.set(0, 0, 0);
  if (tvScreenObject) {
    console.log(`Initial TV screen position: ${tvScreenObject.position.x}, ${tvScreenObject.position.y}, ${tvScreenObject.position.z}`);
  } else {
    console.warn('TV screen object is null.');
  }
  gltf.scene.traverse((child: THREE.Object3D) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.material = new THREE.MeshBasicMaterial({ map: videoTexture });
    }
  });
  scene.add(gltf.scene);
});

function getObjectDropTransform(objectId: string) {
  const preferredAnchor = findBestDropAnchor(objectId);
  if (preferredAnchor) {
    return {
      objectId,
      ownerSessionId: null,
      position: {
        x: preferredAnchor.position.x,
        y: preferredAnchor.position.y,
        z: preferredAnchor.position.z,
      },
      rotation: {
        yaw: preferredAnchor.yaw,
        pitch: 0,
      },
    };
  }

  const dropRaycaster = new THREE.Raycaster();
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  dropRaycaster.set(camera.position, cameraDirection);

  const intersectsNavmesh = dropRaycaster.intersectObjects(collidableMeshList, false);
  let dropPosition: THREE.Vector3;

  if (intersectsNavmesh.length > 0 && intersectsNavmesh[0].distance < pickupDistance * 1.5) {
    dropPosition = intersectsNavmesh[0].point.clone();
    dropPosition.y += 0.1;
  } else {
    const forwardVector = new THREE.Vector3(0, 0, -1);
    forwardVector.applyQuaternion(camera.quaternion);
    dropPosition = camera.position.clone().add(forwardVector.multiplyScalar(pickupDistance * 0.75));
    dropPosition.y = camera.position.y - standingHeight + 0.01;
  }

  return {
    objectId,
    ownerSessionId: null,
    position: {
      x: dropPosition.x,
      y: dropPosition.y,
      z: dropPosition.z,
    },
    rotation: {
      yaw: camera.rotation.y,
      pitch: 0,
    },
  };
}

function applyObjectSnapshot(snapshot: { objectId: string; ownerSessionId: string | null; position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number } | null }) {
  const objectRoot = pickableObjectMap.get(snapshot.objectId);
  if (!objectRoot) {
    return;
  }

  const activeAnimation = activeObjectAnimations.get(snapshot.objectId);
  if (snapshot.ownerSessionId) {
    if (activeAnimation) {
      activeObjectAnimations.delete(snapshot.objectId);
    }
    if (heldObjectId === snapshot.objectId) {
      return;
    }
    objectRoot.visible = false;
    return;
  }

  if (activeAnimation) {
    activeAnimation.endPosition.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
    activeAnimation.endQuaternion.setFromEuler(new THREE.Euler(0, snapshot.rotation?.yaw ?? 0, 0, 'YXZ'));
    return;
  }

  if (heldObjectId === snapshot.objectId && heldObject) {
    heldObject.parent?.remove(heldObject);
    scene.add(heldObject);
    heldObject = null;
    heldObjectId = null;
  }

  objectRoot.visible = true;
  if (objectRoot.parent !== scene) {
    objectRoot.parent?.remove(objectRoot);
    scene.add(objectRoot);
  }
  objectRoot.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
  if (snapshot.rotation) {
    objectRoot.rotation.set(0, snapshot.rotation.yaw, 0);
  }
}

function pickupObjectById(objectId: string) {
  const objectRoot = pickableObjectMap.get(objectId);
  if (!objectRoot || heldObject) {
    return false;
  }

  activeObjectAnimations.delete(objectId);
  heldObject = objectRoot;
  heldObjectId = objectId;
  objectRoot.visible = true;
  if (heldObject.parent) {
    heldObject.parent.remove(heldObject);
  }
  camera.add(heldObject);
  heldObject.position.copy(heldObjectOffset);
  heldObject.rotation.set(0, 0, 0);
  return true;
}

// PICKUP interaction
window.addEventListener('mousedown', (event) => {
  let actionTaken = false;

  if (heldObject && heldObjectId) {
    const dropTransform = getObjectDropTransform(heldObjectId);
    startObjectReleaseAnimation(dropTransform);
    if (window.__musicspaceRequestObjectRelease) {
      window.__musicspaceRequestObjectRelease(heldObjectId, dropTransform);
    }
    actionTaken = true;
  } else {
    if (event.target === renderer.domElement && !(event.target as HTMLElement).closest('#audioControls')) {
      if (hoveredObject && hoveredObject.userData.pickableGLBRoot) {
        const objectId = hoveredObject.userData.objectId as string | undefined;
        if (objectId && window.__musicspaceRequestObjectClaim) {
          window.__musicspaceRequestObjectClaim(objectId);
          actionTaken = true;
        } else if (objectId) {
          actionTaken = pickupObjectById(objectId);
        }
      }
    }
  }

  if (actionTaken) {
    event.preventDefault();
  }
});

window.__musicspaceGetObjectState = () => ({
  hoveredObjectId: (hoveredObject?.userData.objectId as string | undefined) ?? null,
  heldObjectId,
});
window.__musicspaceOccupyObject = pickupObjectById;
window.__musicspaceApplyObjectSnapshot = applyObjectSnapshot;

// WASD movement + collision
const moveState = { forward: false, backward: false, left: false, right: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const clock = new THREE.Clock();

function resetMovementState() {
  moveState.forward = false;
  moveState.backward = false;
  moveState.left = false;
  moveState.right = false;
  velocity.x = 0;
  velocity.z = 0;
}

function isTypingIntoUi(target?: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : document.activeElement;
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable;
}

document.addEventListener('focusin', (event) => {
  if (isTypingIntoUi(event.target)) {
    resetMovementState();
  }
});

 // WASD movement + collision (global listener for key events)
 window.addEventListener('keydown', (e) => {
   if (isTypingIntoUi(e.target)) {
     return;
   }

   // Handle sitting/standing with E and W keys
   if (e.code === 'KeyE' && nearSittingPosition && !isSitting) {
     requestSeatClaim();
     return;
   }
   
if (e.code === 'KeyW' && isSitting) {
     requestSeatRelease();
     console.log(`Standing. Player at:`, controls.object.position, `Facing Yaw:`, controls.object.rotation.y, `Pitch:`, camera.rotation.x);
     return;
   }
   
   // Only allow movement if not sitting
   if (!isSitting) {
     if (e.code === 'KeyW') moveState.forward = true;
     if (e.code === 'KeyS') moveState.backward = true;
     if (e.code === 'KeyA') moveState.left = true;
     if (e.code === 'KeyD') moveState.right = true;
   }
 });
 
 window.addEventListener('keyup', (e) => {
   if (isTypingIntoUi(e.target)) {
     return;
   }

   if (!isSitting) {
     if (e.code === 'KeyW') moveState.forward = false;
     if (e.code === 'KeyS') moveState.backward = false;
     if (e.code === 'KeyA') moveState.left = false;
     if (e.code === 'KeyD') moveState.right = false;
   }
 });

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Main loop
function animate() {
  requestAnimationFrame(animate);
// ——— get a single delta for this frame ———

const delta = clock.getDelta();

// ——— spin the held object ———

if (heldObject) {
 heldObject.rotation.y += delta * spinSpeed;
}
updateObjectReleaseAnimations(performance.now());
  // Update original color cycling point lights
  pointLights.forEach((light, i) => {
    hues[i] += 0.002; // control speed here
    if (hues[i] > 1) hues[i] = 0;
    light.color.setHSL(hues[i], 1, 0.5);
  });
  
  // Update custom cycling lights
  if (window.customLights && window.customLights.length > 0) {
    window.customLights.forEach((light: THREE.PointLight) => { // Added type
      if (light.userData) {
        light.userData.hue += light.userData.cycleSpeed || 0.001;
        if (light.userData.hue > 1) light.userData.hue = 0;
        light.color.setHSL(
          light.userData.hue,
          light.userData.saturation || 1.0,
          light.userData.lightness || 0.5
        );
      }
    });
  }
  
  // Update blinking lights
  /* if (window.blinkingLights && window.blinkingLights.length > 0) {
    window.blinkingLights.forEach(light => {
      if (light.userData) {
        const { blinkSpeed, minIntensity, maxIntensity } = light.userData;
        // Create a sine wave pattern for smooth blinking
        const intensityFactor = (Math.sin(time * 0.001 * blinkSpeed * Math.PI) + 1) * 0.5; // 0 to 1
        const newIntensity = minIntensity + intensityFactor * (maxIntensity - minIntensity);
        light.intensity = newIntensity;
      }
    });
  } */

  // Hover highlight detection - uses mouseForHover updated by pointermove
  raycaster.setFromCamera(mouseForHover, camera);
  const hoverHits = raycaster.intersectObjects<THREE.Mesh>(interactiveObjects, true);

  if (hoverHits.length > 0 && hoverHits[0].distance <= pickupDistance) {
    const intersectedMesh = hoverHits[0].object as THREE.Mesh;
    // Ensure we are highlighting a mesh that is part of a pickable GLB root
    if (intersectedMesh.userData.pickableGLBRoot) {
      const pickablePart = intersectedMesh; // The mesh itself is what gets the emissive color
      if (pickablePart !== hoveredObject) {
        if (hoveredObject) {
          const prevMat = hoveredObject.material as THREE.MeshStandardMaterial;
          prevMat.emissive.setHex(0x000000); // Reset previous hovered
        }
        hoveredObject = pickablePart;
        const mat = hoveredObject.material as THREE.MeshStandardMaterial;
        mat.emissive = new THREE.Color(0x00ff00); // Highlight current
        mat.emissiveIntensity = 0.5;
      }
    } else if (hoveredObject) { // If hovering over something not pickable, or too far
      const prevMat = hoveredObject.material as THREE.MeshStandardMaterial;
      prevMat.emissive.setHex(0x000000);
      hoveredObject = null;
    }
  } else if (hoveredObject) { // No hits or hit is too far
    const prevMat = hoveredObject.material as THREE.MeshStandardMaterial;
    prevMat.emissive.setHex(0x000000);
    hoveredObject = null;
  }

  // Animate emissive map
  if (mixingBoardMeshes.length > 0) {
    emitAccumulator += emitClock.getDelta();
    if (emitAccumulator >= EMIT_INTERVAL) {
      emitFrame = (emitFrame + 1) % emitTextures.length;
      mixingBoardMeshes.forEach(mesh => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveMap = emitTextures[emitFrame];
        mat.needsUpdate = true;
      });
      emitAccumulator -= EMIT_INTERVAL;
    }
  }

  // Movement & collision
  if (collidableMeshList.length > 0 && !isSitting) {
    //const delta = clock.getDelta();
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;

    direction.x = Number(moveState.right) - Number(moveState.left);
    direction.z = Number(moveState.forward) - Number(moveState.backward);
    direction.normalize();

    const speed = 40.0;
    velocity.x += direction.x * speed * delta;
    velocity.z += direction.z * speed * delta;

    const oldPos = controls.object.position.clone();
    controls.moveRight(velocity.x * delta);
    controls.moveForward(velocity.z * delta);

    const rayOrigin = controls.object.position.clone();
    rayOrigin.y += 10;
    const downRay = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, -1, 0));
    const hits = downRay.intersectObjects(collidableMeshList);
    if (hits.length > 0) {
      controls.object.position.y = hits[0].point.y + standingHeight;
    } else {
      controls.object.position.copy(oldPos);
    }
    
    // Check for proximity AND facing to sitting positions
    let isNearAnySittingPosition = false;
    if (sittingPositionObjects.length > 0) {
      const playerPosition = controls.object.position.clone();
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      
      for (const sitPos of sittingPositionObjects) {
        const sitPosition = new THREE.Vector3();
        sitPos.getWorldPosition(sitPosition);
        
        const toSit = sitPosition.clone().sub(playerPosition).normalize();
        const distance = playerPosition.distanceTo(sitPosition);
        const isFacing = cameraDir.dot(toSit) > 0.5; // threshold for facing
        
        if (distance < proximityDistance && isFacing) {
          isNearAnySittingPosition = true;
          nearSittingPosition = sitPos;
          
          // Find the associated couch for reference
          const couchType = sitPos.userData.forCouch;
          scene.traverse((object: THREE.Object3D) => {
            if (object.userData && object.userData.type === couchType) {
              nearCouch = object;
            }
          });
          
          // Show interaction button
          interactionPrompt.textContent = 'Sit';
          interactionPrompt.style.display = 'block';
          break;
        }
      }
      
      if (!isNearAnySittingPosition) {
        nearSittingPosition = null;
        nearCouch = null;
        interactionPrompt.style.display = 'none';
      }
    }
  }

  // Update debug display
  updateDebugDisplay();

  // Update vapor animation
  if (vaporEffectMaterial) {
    vaporEffectMaterial.uniforms.time.value += 0.003; // Adjust speed as needed
  }

  // Animate flowers/plants
  animateFlowers(performance.now());
  
  renderer.render(scene, camera);
}

animate();
//updateNowPlaying();
//setInterval(updateNowPlaying, 30000);
} // End of initializeApp function








