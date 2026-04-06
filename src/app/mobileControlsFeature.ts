type SceneMode = 'lobby' | 'room';

type RotationCarrier = {
  rotation: {
    x: number;
    y: number;
  };
};

type MobileControlsOptions = {
  camera: RotationCarrier;
  controls: {
    object: RotationCarrier;
  };
  getSceneMode: () => SceneMode | null;
  isSidebarUiTarget: (target: EventTarget | null) => boolean;
};

type MoveVector = {
  x: number;
  y: number;
};

const mobileLookSensitivity = 0.0032;
const mobileJoystickRadius = 42;

export type MobileControlsFeature = {
  getMoveVector: () => MoveVector;
  reset: () => void;
  setVisible: (visible: boolean) => void;
};

export function setupMobileControlsFeature({
  camera,
  controls,
  getSceneMode,
  isSidebarUiTarget,
}: MobileControlsOptions): MobileControlsFeature {
  let touchLookPreviousX = 0;
  let touchLookPreviousY = 0;
  let lookingTouchId: number | null = null;
  let touchMoveStartX = 0;
  let touchMoveStartY = 0;
  let movingTouchId: number | null = null;

  const moveTouchVector: MoveVector = { x: 0, y: 0 };
  const mobileControlLayer = document.createElement('div');
  mobileControlLayer.id = 'mobile-controls-layer';

  const mobileMoveZone = document.createElement('div');
  mobileMoveZone.id = 'mobile-move-zone';
  mobileMoveZone.innerHTML = '<div class="mobile-control-label">Move</div><div class="mobile-joystick-base"><div class="mobile-joystick-knob"></div></div>';

  const mobileJoystickKnob = mobileMoveZone.querySelector('.mobile-joystick-knob') as HTMLDivElement | null;

  const mobileLookZone = document.createElement('div');
  mobileLookZone.id = 'mobile-look-zone';
  mobileLookZone.innerHTML = '<div class="mobile-control-label">Look</div><div class="mobile-look-pad"></div>';

  mobileControlLayer.append(mobileMoveZone, mobileLookZone);
  document.body.appendChild(mobileControlLayer);

  function isPointInsideElement(element: HTMLElement | null, clientX: number, clientY: number) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function updateMobileJoystickVisual(deltaX: number, deltaY: number) {
    if (!mobileJoystickKnob) {
      return;
    }

    const distance = Math.hypot(deltaX, deltaY);
    const clampedDistance = Math.min(distance, mobileJoystickRadius);
    const angle = Math.atan2(deltaY, deltaX);
    const x = Math.cos(angle) * clampedDistance;
    const y = Math.sin(angle) * clampedDistance;
    mobileJoystickKnob.style.transform = `translate(${x}px, ${y}px)`;
    moveTouchVector.x = x / mobileJoystickRadius;
    moveTouchVector.y = -y / mobileJoystickRadius;
  }

  function resetMobileMoveTouch() {
    moveTouchVector.x = 0;
    moveTouchVector.y = 0;
    if (mobileJoystickKnob) {
      mobileJoystickKnob.style.transform = 'translate(0px, 0px)';
    }
  }

  function reset() {
    lookingTouchId = null;
    movingTouchId = null;
    resetMobileMoveTouch();
  }

  console.log('Touch device detected. Initializing mobile touch controls.');
  reset();

  window.addEventListener('touchstart', (event: TouchEvent) => {
    if (getSceneMode() !== 'room') {
      return;
    }

    for (let i = 0; i < event.changedTouches.length; i += 1) {
      const touch = event.changedTouches[i];
      if (isSidebarUiTarget(touch.target)) {
        continue;
      }

      if (movingTouchId === null && isPointInsideElement(mobileMoveZone, touch.clientX, touch.clientY)) {
        movingTouchId = touch.identifier;
        const rect = mobileMoveZone.getBoundingClientRect();
        touchMoveStartX = rect.left + rect.width / 2;
        touchMoveStartY = rect.top + rect.height / 2;
        updateMobileJoystickVisual(touch.clientX - touchMoveStartX, touch.clientY - touchMoveStartY);
        event.preventDefault();
      } else if (lookingTouchId === null && isPointInsideElement(mobileLookZone, touch.clientX, touch.clientY)) {
        lookingTouchId = touch.identifier;
        touchLookPreviousX = touch.clientX;
        touchLookPreviousY = touch.clientY;
        event.preventDefault();
      }
    }
  }, { passive: false });

  window.addEventListener('touchmove', (event: TouchEvent) => {
    if (getSceneMode() !== 'room') {
      return;
    }

    for (let i = 0; i < event.changedTouches.length; i += 1) {
      const touch = event.changedTouches[i];
      if (touch.identifier === movingTouchId) {
        const deltaX = touch.clientX - touchMoveStartX;
        const deltaY = touch.clientY - touchMoveStartY;
        updateMobileJoystickVisual(deltaX, deltaY);
        event.preventDefault();
      } else if (touch.identifier === lookingTouchId) {
        const deltaX = touch.clientX - touchLookPreviousX;
        const deltaY = touch.clientY - touchLookPreviousY;
        controls.object.rotation.y -= deltaX * mobileLookSensitivity;
        camera.rotation.x -= deltaY * mobileLookSensitivity;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
        touchLookPreviousX = touch.clientX;
        touchLookPreviousY = touch.clientY;
        event.preventDefault();
      }
    }
  }, { passive: false });

  const releaseTouch = (touch: Touch) => {
    if (touch.identifier === movingTouchId) {
      movingTouchId = null;
      resetMobileMoveTouch();
    } else if (touch.identifier === lookingTouchId) {
      lookingTouchId = null;
    }
  };

  window.addEventListener('touchend', (event: TouchEvent) => {
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      releaseTouch(event.changedTouches[i]);
    }
  });

  window.addEventListener('touchcancel', (event: TouchEvent) => {
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      releaseTouch(event.changedTouches[i]);
    }
  });

  return {
    getMoveVector: () => moveTouchVector,
    reset,
    setVisible: (visible: boolean) => {
      mobileControlLayer.style.display = visible ? '' : 'none';
      if (!visible) {
        reset();
      }
    },
  };
}
