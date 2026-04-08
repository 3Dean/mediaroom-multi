import { Color, Euler, Mesh, Object3D, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector2, Vector3 } from 'three';

type SceneMode = 'lobby' | 'room';

type ObjectSnapshot = {
  objectId: string;
  ownerSessionId: string | null;
  position: { x: number; y: number; z: number };
  rotation: { yaw: number; pitch: number } | null;
};

type DropAnchor = {
  anchorId: string;
  objectType: string;
  position: Vector3;
  yaw: number;
};

type ObjectReleaseAnimation = {
  objectId: string;
  objectRoot: Object3D;
  startTime: number;
  durationMs: number;
  startPosition: Vector3;
  endPosition: Vector3;
  startQuaternion: Quaternion;
  endQuaternion: Quaternion;
};

type SceneInteractionFeatureOptions = {
  scene: Scene;
  camera: PerspectiveCamera;
  controls: { object: Object3D; moveRight: (distance: number) => void; moveForward: (distance: number) => void };
  loader: { load: (url: string, onLoad: (gltf: { scene: Object3D }) => void) => void };
  rendererElement: HTMLCanvasElement;
  collidableMeshList: Mesh[];
  getSceneMode: () => SceneMode | null;
  clearMotionState: () => void;
  isTypingIntoUi: (target?: EventTarget | null) => boolean;
  heldObjectOffset: Vector3;
  pickupDistance: number;
  releaseAnimationDurationMs: number;
  standingHeight: number;
  sittingEyeHeight: number;
  proximityDistance: number;
  avatarSeparationRadius: number;
  avatarSeparationStrength: number;
  seatedAvatarSeparationScale: number;
};

export type SceneInteractionFeature = {
  updatePointer: (clientX: number, clientY: number) => void;
  registerStaticModel: (url: string, modelScene: Object3D) => void;
  refreshSeatPositions: () => void;
  handleSceneModeChange: (nextMode: SceneMode) => void;
  handlePointerDown: (event: MouseEvent) => void;
  update: (delta: number, now: number) => void;
  applyRemoteAvatarSeparation: () => void;
  isSitting: () => boolean;
  hasNearbySeat: () => boolean;
  requestSeatClaim: () => void;
  requestSeatRelease: () => void;
  getSeatState: () => { nearbySeatId: string | null; currentSeatId: string | null; isSitting: boolean };
  occupySeat: (seatId: string) => boolean;
  releaseSeat: () => void;
  getObjectState: () => { hoveredObjectId: string | null; heldObjectId: string | null };
  occupyObject: (objectId: string) => boolean;
  applyObjectSnapshot: (snapshot: ObjectSnapshot) => void;
};

const objectTypeByUrl: Record<string, string> = {
  '/models/boss.glb': 'boss',
  '/models/chair.glb': 'chair',
  '/models/couch_left.glb': 'couch_left',
  '/models/couch_right.glb': 'couch_right',
  '/models/coffee.glb': 'coffee',
  '/models/leakstereo.glb': 'stereo',
  '/models/vinylrecord.glb': 'album',
};

const pickableUrls = new Set(['/models/boss.glb', '/models/leakstereo.glb', '/models/vinylrecord.glb', '/models/coffee.glb']);
const seatableUrls = new Set(['/models/couch_left.glb', '/models/couch_right.glb', '/models/chair.glb']);
const objectDropTypeAliases: Record<string, string> = {
  coffee: 'mug',
};

export function createSceneInteractionFeature({
  scene,
  camera,
  controls,
  loader,
  rendererElement,
  collidableMeshList,
  getSceneMode,
  clearMotionState,
  isTypingIntoUi,
  heldObjectOffset,
  pickupDistance,
  releaseAnimationDurationMs,
  standingHeight,
  sittingEyeHeight,
  proximityDistance,
  avatarSeparationRadius,
  avatarSeparationStrength,
  seatedAvatarSeparationScale,
}: SceneInteractionFeatureOptions): SceneInteractionFeature {
  const interactiveObjects: Mesh[] = [];
  const pickableObjectMap = new Map<string, Object3D>();
  const dropAnchorMap = new Map<string, DropAnchor[]>();
  const activeObjectAnimations = new Map<string, ObjectReleaseAnimation>();
  const couchObjects: Object3D[] = [];
  const sittingPositionObjects: Object3D[] = [];
  const mouseForHover = new Vector2();
  const raycaster = new Raycaster();
  let nearCouch: Object3D | null = null;
  let nearSittingPosition: Object3D | null = null;
  let currentSeatId: string | null = null;
  let isSitting = false;
  let standingPosition = new Vector3();
  let heldObject: Object3D | null = null;
  let heldObjectId: string | null = null;
  let hoveredObject: Mesh | null = null;
  const spinSpeed = 1.0;

  const interactionPrompt = document.createElement('button');
  interactionPrompt.id = 'interactionButton';
  interactionPrompt.className = 'musicspace-scene-button musicspace-scene-button--center musicspace-button musicspace-button--primary';
  interactionPrompt.style.display = 'none';
  document.body.appendChild(interactionPrompt);

  const closeButton = document.createElement('button');
  closeButton.id = 'closeButton';
  closeButton.textContent = 'Stand';
  closeButton.className = 'musicspace-scene-button musicspace-scene-button--corner musicspace-button musicspace-button--secondary';
  closeButton.style.display = 'none';
  document.body.appendChild(closeButton);

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
  debugDisplay.style.pointerEvents = 'none';
  debugDisplay.style.maxWidth = '300px';
  debugDisplay.style.overflow = 'hidden';
  debugDisplay.style.whiteSpace = 'pre-wrap';
  debugDisplay.style.zIndex = '1000';
  debugDisplay.style.display = 'none';
  document.body.appendChild(debugDisplay);

  function clearMeshHighlight(mesh: Mesh | null) {
    if (!mesh) {
      return;
    }

    const material = mesh.material as Mesh['material'] & { emissive?: Color; emissiveIntensity?: number };
    if (material.emissive) {
      material.emissive.setHex(0x000000);
    }
    if (typeof material.emissiveIntensity === 'number') {
      material.emissiveIntensity = 0;
    }
  }

  function clearObjectRootHighlight(objectRoot: Object3D) {
    objectRoot.traverse((child) => {
      if ((child as Mesh).isMesh) {
        clearMeshHighlight(child as Mesh);
      }
    });
  }

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
    const anchors = dropAnchorMap.get(objectType) ?? dropAnchorMap.get('any') ?? [];
    if (anchors.length === 0) {
      return null;
    }

    const cameraDirection = new Vector3();
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
    loader.load('/models/drop_anchors.glb', (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((child) => {
        const match = child.name.match(/^drop_([a-z0-9]+)_(\d+)$/i);
        if (!match) {
          return;
        }

        const worldPosition = new Vector3();
        const worldQuaternion = new Quaternion();
        child.getWorldPosition(worldPosition);
        child.getWorldQuaternion(worldQuaternion);
        const euler = new Euler().setFromQuaternion(worldQuaternion, 'YXZ');

        registerDropAnchor({
          anchorId: child.name,
          objectType: match[1].toLowerCase(),
          position: worldPosition.clone(),
          yaw: euler.y,
        });
      });
    });
  }

  function createSittingPositions() {
    sittingPositionObjects.forEach((object) => {
      scene.remove(object);
    });
    sittingPositionObjects.length = 0;

    couchObjects.forEach((seatable) => {
      const objectPosition = new Vector3();
      seatable.getWorldPosition(objectPosition);
      const objectType = seatable.userData.type;

      loader.load('/models/sittingposition.glb', (gltf) => {
        const sittingModel = gltf.scene.clone();

        if (objectType === 'chair') {
          sittingModel.position.set(objectPosition.x + 0.1, objectPosition.y + 0.5, objectPosition.z - 0.4);
          sittingModel.rotation.set(0, 0, 0);
        } else if (objectType === 'couch_left') {
          sittingModel.position.set(objectPosition.x - 0.1, objectPosition.y + 0.5, objectPosition.z + 0.5);
          const centerPoint = new Vector3(0, sittingModel.position.y, 0);
          const direction = new Vector3().subVectors(centerPoint, sittingModel.position).normalize();
          const angle = Math.atan2(direction.x, direction.z) + Math.PI;
          sittingModel.rotation.set(0, angle, 0);
        } else {
          sittingModel.position.set(objectPosition.x + 0.1, objectPosition.y + 0.5, objectPosition.z + 0.5);
          const centerPoint = new Vector3(0, sittingModel.position.y, 0);
          const direction = new Vector3().subVectors(centerPoint, sittingModel.position).normalize();
          const angle = Math.atan2(direction.x, direction.z) + Math.PI;
          sittingModel.rotation.set(0, angle, 0);
        }

        sittingModel.userData = {
          type: 'sitting_position',
          forCouch: objectType,
          seatId: `seat-${objectType}`,
        };

        sittingModel.traverse((child) => {
          if ((child as Mesh).isMesh) {
            (child as Mesh).visible = false;
          }
        });

        scene.add(sittingModel);
        sittingPositionObjects.push(sittingModel);
      });
    });
  }

  function getClickedPickableObjectId(): string | null {
    raycaster.setFromCamera(mouseForHover, camera);
    const hits = raycaster.intersectObjects(interactiveObjects, true);
    const hit = hits[0];
    if (!hit || hit.distance > pickupDistance) {
      return null;
    }

    const intersectedMesh = hit.object as Mesh;
    if (!intersectedMesh.userData.pickableGLBRoot) {
      return null;
    }

    return (intersectedMesh.userData.objectId as string | undefined) ?? null;
  }

  function getObjectDropTransform(objectId: string): ObjectSnapshot {
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

    const dropRaycaster = new Raycaster();
    const cameraDirection = new Vector3();
    camera.getWorldDirection(cameraDirection);
    dropRaycaster.set(camera.position, cameraDirection);

    const intersectsNavmesh = dropRaycaster.intersectObjects(collidableMeshList, false);
    let dropPosition: Vector3;

    if (intersectsNavmesh.length > 0 && intersectsNavmesh[0].distance < pickupDistance * 1.5) {
      dropPosition = intersectsNavmesh[0].point.clone();
      dropPosition.y += 0.1;
    } else {
      const forwardVector = new Vector3(0, 0, -1);
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

  function performStandAction() {
    isSitting = false;
    currentSeatId = null;
    controls.object.position.copy(standingPosition);
    interactionPrompt.style.display = 'none';
    closeButton.style.display = 'none';
    clearMotionState();
  }

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

    const seatBaseWorldPosition = new Vector3();
    nearSittingPosition.getWorldPosition(seatBaseWorldPosition);

    controls.object.position.set(
      seatBaseWorldPosition.x,
      seatBaseWorldPosition.y + sittingEyeHeight,
      seatBaseWorldPosition.z
    );
    const sitRot = nearSittingPosition.rotation;
    controls.object.rotation.set(0, sitRot.y, 0);
    camera.rotation.x = 0;
    clearMotionState();
    interactionPrompt.style.display = 'none';
    closeButton.style.display = 'block';
    return true;
  }

  function startObjectReleaseAnimation(snapshot: ObjectSnapshot) {
    const objectRoot = pickableObjectMap.get(snapshot.objectId);
    if (!objectRoot) {
      return;
    }

    const startPosition = new Vector3();
    const startQuaternion = new Quaternion();
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

    const endQuaternion = new Quaternion().setFromEuler(new Euler(0, snapshot.rotation?.yaw ?? 0, 0, 'YXZ'));
    activeObjectAnimations.set(snapshot.objectId, {
      objectId: snapshot.objectId,
      objectRoot,
      startTime: performance.now(),
      durationMs: releaseAnimationDurationMs,
      startPosition,
      endPosition: new Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z),
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

  function updateHoverState() {
    const sceneMode = getSceneMode();
    if (sceneMode === 'room') {
      raycaster.setFromCamera(mouseForHover, camera);
      const hoverHits = raycaster.intersectObjects(interactiveObjects, true);

      if (hoverHits.length > 0 && hoverHits[0].distance <= pickupDistance) {
        const intersectedMesh = hoverHits[0].object as Mesh;
        if (intersectedMesh.userData.pickableGLBRoot) {
          const pickablePart = intersectedMesh;
          const hoveredId = pickablePart.userData.objectId as string | undefined;
          if (hoveredId === heldObjectId) {
            if (hoveredObject) {
              clearMeshHighlight(hoveredObject);
              hoveredObject = null;
            }
          } else if (pickablePart !== hoveredObject) {
            if (hoveredObject) {
              clearMeshHighlight(hoveredObject);
            }
            hoveredObject = pickablePart;
            const material = hoveredObject.material as Mesh['material'] & { emissive?: Color; emissiveIntensity?: number };
            if (material.emissive) {
              material.emissive.set(0x00ff00);
            }
            if (typeof material.emissiveIntensity === 'number') {
              material.emissiveIntensity = 0.5;
            }
          }
        } else if (hoveredObject) {
          clearMeshHighlight(hoveredObject);
          hoveredObject = null;
        }
      } else if (hoveredObject) {
        clearMeshHighlight(hoveredObject);
        hoveredObject = null;
      }
      return;
    }

    if (hoveredObject) {
      clearMeshHighlight(hoveredObject);
      hoveredObject = null;
    }
  }

  function updateSeatPrompt() {
    const sceneMode = getSceneMode();
    if (sceneMode === 'room' && !isSitting) {
      let isNearAnySittingPosition = false;
      const playerPosition = controls.object.position.clone();
      const cameraDir = new Vector3();
      camera.getWorldDirection(cameraDir);

      for (const sitPos of sittingPositionObjects) {
        const sitPosition = new Vector3();
        sitPos.getWorldPosition(sitPosition);
        const toSit = sitPosition.clone().sub(playerPosition).normalize();
        const distance = playerPosition.distanceTo(sitPosition);
        const isFacing = cameraDir.dot(toSit) > 0.5;

        if (distance < proximityDistance && isFacing) {
          isNearAnySittingPosition = true;
          nearSittingPosition = sitPos;
          const couchType = sitPos.userData.forCouch;
          nearCouch = couchObjects.find((object) => object.userData.type === couchType) ?? null;
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
      return;
    }

    nearSittingPosition = null;
    nearCouch = null;
    interactionPrompt.style.display = 'none';
  }

  function updateDebugDisplay() {
    const playerPos = controls.object.position.clone();
    let nearestObjectInfo = 'None';
    let nearestSitPosInfo = 'None';

    if (nearCouch) {
      const objPos = new Vector3();
      nearCouch.getWorldPosition(objPos);
      const distance = playerPos.distanceTo(objPos);
      nearestObjectInfo = `${String(nearCouch.userData.type)}\nPosition: ${objPos.x.toFixed(2)}, ${objPos.y.toFixed(2)}, ${objPos.z.toFixed(2)}\nDistance: ${distance.toFixed(2)}`;
    }

    if (nearSittingPosition) {
      const sitPos = new Vector3();
      nearSittingPosition.getWorldPosition(sitPos);
      const distance = playerPos.distanceTo(sitPos);
      nearestSitPosInfo = `For: ${String(nearSittingPosition.userData.forCouch)}\nPosition: ${sitPos.x.toFixed(2)}, ${sitPos.y.toFixed(2)}, ${sitPos.z.toFixed(2)}\nDistance: ${distance.toFixed(2)}`;
    }

    debugDisplay.textContent = `Player Position: ${playerPos.x.toFixed(2)}, ${playerPos.y.toFixed(2)}, ${playerPos.z.toFixed(2)}\nSitting: ${isSitting ? 'Yes' : 'No'}\nNearest Seatable Object: ${nearestObjectInfo}\nNearest Sitting Position: ${nearestSitPosInfo}`;
  }

  function dropHeldObjectLocally() {
    if (!heldObject) {
      heldObjectId = null;
      return;
    }

    const worldPosition = new Vector3();
    const worldQuaternion = new Quaternion();
    heldObject.getWorldPosition(worldPosition);
    heldObject.getWorldQuaternion(worldQuaternion);
    heldObject.parent?.remove(heldObject);
    scene.add(heldObject);
    heldObject.position.copy(worldPosition);
    heldObject.quaternion.copy(worldQuaternion);
    heldObject = null;
    heldObjectId = null;
  }

  function pickupObjectById(objectId: string) {
    const objectRoot = pickableObjectMap.get(objectId);
    if (!objectRoot || heldObject) {
      return false;
    }

    activeObjectAnimations.delete(objectId);
    clearObjectRootHighlight(objectRoot);
    if (hoveredObject?.userData.objectId === objectId) {
      clearMeshHighlight(hoveredObject);
      hoveredObject = null;
    }

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

  function applyObjectSnapshot(snapshot: ObjectSnapshot) {
    const objectRoot = pickableObjectMap.get(snapshot.objectId);
    if (!objectRoot) {
      return;
    }

    const hasAcceptedSnapshot = objectRoot.userData.hasAcceptedSnapshot === true;
    const initialPosition = objectRoot.userData.initialPosition as Vector3 | undefined;
    const isOriginPlaceholder =
      snapshot.ownerSessionId === null &&
      snapshot.position.x === 0 &&
      snapshot.position.y === 0 &&
      snapshot.position.z === 0 &&
      (!snapshot.rotation || snapshot.rotation.yaw === 0);
    const hasAuthoredScenePosition = Boolean(initialPosition && initialPosition.lengthSq() > 0.0001);

    if (!hasAcceptedSnapshot && isOriginPlaceholder && hasAuthoredScenePosition) {
      return;
    }

    const activeAnimation = activeObjectAnimations.get(snapshot.objectId);
    if (snapshot.ownerSessionId) {
      if (activeAnimation) {
        activeObjectAnimations.delete(snapshot.objectId);
      }
      objectRoot.userData.hasAcceptedSnapshot = true;
      if (heldObjectId === snapshot.objectId) {
        return;
      }
      objectRoot.visible = false;
      return;
    }

    if (activeAnimation) {
      activeAnimation.endPosition.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
      activeAnimation.endQuaternion.setFromEuler(new Euler(0, snapshot.rotation?.yaw ?? 0, 0, 'YXZ'));
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
    objectRoot.userData.hasAcceptedSnapshot = true;
  }

  function applyRemoteAvatarSeparation() {
    if (!window.__musicspaceGetRemoteParticipants) {
      return;
    }

    const localPosition = controls.object.position;
    const remoteParticipants = window.__musicspaceGetRemoteParticipants();
    let offsetX = 0;
    let offsetZ = 0;

    remoteParticipants.forEach((participant) => {
      const dx = localPosition.x - participant.position.x;
      const dz = localPosition.z - participant.position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq <= 0.0001) {
        return;
      }

      const separationScale = participant.isSitting ? seatedAvatarSeparationScale : 1;
      const minDistance = avatarSeparationRadius * separationScale;
      if (minDistance <= 0) {
        return;
      }

      const distance = Math.sqrt(distanceSq);
      if (distance >= minDistance) {
        return;
      }

      const overlap = minDistance - distance;
      const push = (overlap / distance) * avatarSeparationStrength;
      offsetX += dx * push;
      offsetZ += dz * push;
    });

    if (offsetX !== 0 || offsetZ !== 0) {
      controls.object.position.x += offsetX;
      controls.object.position.z += offsetZ;
    }
  }

  function handleCloseButtonPress(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (isSitting) {
      if (currentSeatId && window.__musicspaceRequestSeatRelease) {
        window.__musicspaceRequestSeatRelease(currentSeatId);
      } else {
        performStandAction();
      }
    }
  }

  function handleInteractionButtonPress(event: Event) {
    if (getSceneMode() === 'room' && nearSittingPosition && !isSitting) {
      if (nearSittingPosition.userData.seatId && window.__musicspaceRequestSeatClaim) {
        window.__musicspaceRequestSeatClaim(nearSittingPosition.userData.seatId as string);
      } else {
        triggerSitAction();
      }
    }
    event.stopPropagation();
    event.preventDefault();
  }

  closeButton.addEventListener('click', handleCloseButtonPress);
  closeButton.addEventListener('touchend', handleCloseButtonPress, { passive: false });
  interactionPrompt.addEventListener('click', handleInteractionButtonPress);
  interactionPrompt.addEventListener('touchend', handleInteractionButtonPress, { passive: false });
  window.addEventListener('keydown', (event) => {
    if (isTypingIntoUi(event.target)) {
      return;
    }

    if (event.code === 'KeyI') {
      debugDisplay.style.display = debugDisplay.style.display === 'none' ? 'block' : 'none';
    }
  });

  loadDropAnchors();

  return {
    updatePointer: (clientX, clientY) => {
      mouseForHover.x = (clientX / window.innerWidth) * 2 - 1;
      mouseForHover.y = -(clientY / window.innerHeight) * 2 + 1;
    },
    registerStaticModel: (url, modelScene) => {
      const objectType = objectTypeByUrl[url];
      if (objectType) {
        modelScene.userData.type = objectType;
      }

      if (seatableUrls.has(url)) {
        couchObjects.push(modelScene);
        createSittingPositions();
      }

      if (pickableUrls.has(url)) {
        const objectId = url.split('/').pop()?.replace('.glb', '') ?? url;
        modelScene.userData.isPickableRoot = true;
        modelScene.userData.url = url;
        modelScene.userData.objectId = objectId;
        modelScene.userData.initialPosition = modelScene.position.clone();
        modelScene.userData.initialRotation = modelScene.rotation.clone();
        modelScene.userData.hasAcceptedSnapshot = false;
        pickableObjectMap.set(objectId, modelScene);

        modelScene.traverse((child) => {
          if ((child as Mesh).isMesh) {
            child.userData.pickableGLBRoot = modelScene;
            child.userData.objectId = objectId;
            interactiveObjects.push(child as Mesh);
          }
        });
      }
    },
    refreshSeatPositions: () => {
      createSittingPositions();
    },
    handleSceneModeChange: (nextMode) => {
      if (nextMode === 'lobby') {
        if (isSitting) {
          performStandAction();
        } else {
          currentSeatId = null;
          nearSittingPosition = null;
          nearCouch = null;
          interactionPrompt.style.display = 'none';
          closeButton.style.display = 'none';
        }
        if (hoveredObject) {
          clearMeshHighlight(hoveredObject);
          hoveredObject = null;
        }
        dropHeldObjectLocally();
        rendererElement.style.cursor = 'auto';
        return;
      }

      rendererElement.style.cursor = 'grab';
    },
    handlePointerDown: (event) => {
      if (getSceneMode() !== 'room') {
        return;
      }

      let actionTaken = false;
      if (heldObject && heldObjectId) {
        const clickedObjectId = getClickedPickableObjectId();
        if (clickedObjectId !== heldObjectId) {
          const releasingObjectId = heldObjectId;
          const dropTransform = getObjectDropTransform(releasingObjectId);
          startObjectReleaseAnimation(dropTransform);
          if (window.__musicspaceRequestObjectRelease) {
            window.__musicspaceRequestObjectRelease(releasingObjectId, dropTransform);
          }
          actionTaken = true;
        }
      } else if (event.target === rendererElement && !(event.target as HTMLElement).closest('#audioControls')) {
        if (hoveredObject?.userData.pickableGLBRoot) {
          const objectId = hoveredObject.userData.objectId as string | undefined;
          if (objectId && window.__musicspaceRequestObjectClaim) {
            const requestSent = window.__musicspaceRequestObjectClaim(objectId);
            actionTaken = requestSent ? true : pickupObjectById(objectId);
          } else if (objectId) {
            actionTaken = pickupObjectById(objectId);
          }
        }
      }

      if (actionTaken) {
        event.preventDefault();
      }
    },
    update: (delta, now) => {
      if (heldObject) {
        heldObject.rotation.y += delta * spinSpeed;
      }
      updateObjectReleaseAnimations(now);
      updateHoverState();
      updateSeatPrompt();
      updateDebugDisplay();
    },
    applyRemoteAvatarSeparation,
    isSitting: () => isSitting,
    hasNearbySeat: () => !!nearSittingPosition,
    requestSeatClaim: () => {
      if (getSceneMode() !== 'room' || !nearSittingPosition || isSitting) {
        return;
      }
      const seatId = nearSittingPosition.userData.seatId as string | undefined;
      if (seatId && window.__musicspaceRequestSeatClaim) {
        window.__musicspaceRequestSeatClaim(seatId);
        return;
      }
      triggerSitAction();
    },
    requestSeatRelease: () => {
      if (getSceneMode() !== 'room' || !isSitting) {
        return;
      }
      if (currentSeatId && window.__musicspaceRequestSeatRelease) {
        window.__musicspaceRequestSeatRelease(currentSeatId);
        return;
      }
      performStandAction();
    },
    getSeatState: () => ({
      nearbySeatId: getSceneMode() === 'room' ? (nearSittingPosition?.userData.seatId as string | undefined) ?? null : null,
      currentSeatId: getSceneMode() === 'room' ? currentSeatId : null,
      isSitting: getSceneMode() === 'room' ? isSitting : false,
    }),
    occupySeat: (seatId) => getSceneMode() === 'room' ? triggerSitAction(seatId) : false,
    releaseSeat: () => {
      performStandAction();
    },
    getObjectState: () => ({
      hoveredObjectId: getSceneMode() === 'room' ? (hoveredObject?.userData.objectId as string | undefined) ?? null : null,
      heldObjectId: getSceneMode() === 'room' ? heldObjectId : null,
    }),
    occupyObject: (objectId) => getSceneMode() === 'room' ? pickupObjectById(objectId) : false,
    applyObjectSnapshot,
  };
}
