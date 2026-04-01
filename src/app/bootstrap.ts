import * as THREE from 'three';
import { APP_CONFIG } from './config';
import { initializeApp } from './initializeApp';
import {
  confirmSignUpWithEmail,
  getAuthenticatedUser,
  getRealtimeAuthToken,
  signInWithEmail,
  signOutCurrentUser,
  signUpWithEmail,
} from '../backend/authClient';
import { RemotePlayerManager } from '../player/remotePlayerManager';
import { RoomClient } from '../room/roomClient';
import { applyServerMessage } from '../room/roomPresence';
import { RoomSessionStore } from '../room/roomSession';
import { RoomStateStore } from '../room/roomState';
import type { ChatMessage } from '../types/chat';
import type { ServerMessage } from '../types/network';
import type { PlayerTransform } from '../types/player';
import { AuthPanel } from '../ui/authPanel';
import { ChatPanel } from '../ui/chatPanel';
import { ParticipantList } from '../ui/participantList';
import { PreferencesPanel } from '../ui/preferencesPanel';
import { RoomPanel } from '../ui/roomPanel';
import { loadPreferences, resetPreferences, savePreferences } from '../preferences/preferencesStore';
import type { UserPreferences } from '../preferences/preferencesModel';

const roomState = new RoomStateStore();
const sessionStore = new RoomSessionStore();

export function bootstrapApp(): void {
  window.addEventListener('DOMContentLoaded', async () => {
    const sidebarPanels = initializeSidebarLayout();
    initializeApp();

    let currentUser = await getAuthenticatedUser();
    let preferences = loadPreferences();
    const initialRoomSlug = getRoomSlugFromUrl() ?? (preferences.room.defaultRoomSlug || undefined);
    const remotePlayerManager = window.scene ? new RemotePlayerManager(window.scene) : null;
    let roomClient: RoomClient | null = null;
    let presenceTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let pendingSeatRequestId: string | null = null;
    let appliedSeatId: string | null = null;
    let pendingObjectId: string | null = null;
    let appliedObjectId: string | null = null;

    const participantList = new ParticipantList({
      onKick: (targetSessionId) => {
        const activeSession = sessionStore.getCurrentSession();
        if (!activeSession || !roomClient?.isConnected()) {
          return;
        }

        roomClient.send({
          type: 'admin.kick',
          roomId: activeSession.roomId,
          sessionId: activeSession.sessionId,
          targetSessionId,
        });
      },
      onSetRole: (targetUserId, role) => {
        const activeSession = sessionStore.getCurrentSession();
        if (!activeSession || !roomClient?.isConnected()) {
          return;
        }

        roomClient.send({
          type: 'admin.setRole',
          roomId: activeSession.roomId,
          sessionId: activeSession.sessionId,
          targetUserId,
          role,
        });
      },
      onSetMute: (targetUserId, muted) => {
        const activeSession = sessionStore.getCurrentSession();
        if (!activeSession || !roomClient?.isConnected()) {
          return;
        }

        roomClient.send({
          type: 'admin.setMute',
          roomId: activeSession.roomId,
          sessionId: activeSession.sessionId,
          targetUserId,
          muted,
        });
      },
      onSetRoomLock: (locked) => {
        const activeSession = sessionStore.getCurrentSession();
        if (!activeSession || !roomClient?.isConnected()) {
          return;
        }

        roomClient.send({
          type: 'admin.setRoomLock',
          roomId: activeSession.roomId,
          sessionId: activeSession.sessionId,
          locked,
        });
      },
    });

    let roomPanel!: RoomPanel;
    let authPanel!: AuthPanel;
    let chatPanel!: ChatPanel;

    const enterRoom = ({ roomSlug, displayName }: { roomSlug: string; displayName: string }) => {
      updateRoomSlugInUrl(roomSlug);
      const session = sessionStore.createSession(roomSlug, displayName, currentUser?.userId, preferences.profile.avatarPresetId);
      roomState.reset(session.roomId);
      pendingSeatRequestId = null;
      appliedSeatId = null;
      pendingObjectId = null;
      appliedObjectId = null;
      syncRoomUi(chatPanel, participantList, remotePlayerManager);

      stopRealtimeLoops(presenceTimer, heartbeatTimer);
      presenceTimer = null;
      heartbeatTimer = null;

      if (roomClient) {
        roomClient.disconnect(1000, 'switch-room');
      }

      const realtimeUrl = getRealtimeUrl();
      roomPanel.setStatus(`Joined ${roomSlug}. Connecting to ${realtimeUrl}.`);
      roomPanel.setMeta('Connecting');
      participantList.setConnectionStatus('Connecting');

      const nextRoomClient = new RoomClient({
        url: realtimeUrl,
        reconnect: true,
        reconnectDelayMs: APP_CONFIG.reconnectBaseDelayMs,
        maxReconnectDelayMs: APP_CONFIG.reconnectMaxDelayMs,
        onOpen: async () => {
          const authToken = await getRealtimeAuthToken();
          roomPanel.setStatus(`Connected to ${roomSlug}.`);
          roomPanel.setMeta('Live');
          participantList.setConnectionStatus('Live');
          nextRoomClient.send({
            type: 'room.join',
            roomId: session.roomId,
            sessionId: session.sessionId,
            displayName: session.displayName,
            userId: session.userId,
            avatarStyle: session.avatarStyle,
            token: authToken ?? undefined,
          });

          startRealtimeLoops(
            nextRoomClient,
            session.roomId,
            session.sessionId,
            () => getLocalPlayerTransform(),
            () => window.__musicspaceGetSeatState?.(),
            () => window.__musicspaceGetObjectState?.(),
            (presence, heartbeat) => {
              presenceTimer = presence;
              heartbeatTimer = heartbeat;
            },
          );
        },
        onClose: () => {
          stopRealtimeLoops(presenceTimer, heartbeatTimer);
          presenceTimer = null;
          heartbeatTimer = null;
          roomState.clearPresence();
          syncRoomUi(chatPanel, participantList, remotePlayerManager);
          roomPanel.setStatus(`Disconnected from ${roomSlug}.`);
          roomPanel.setMeta('Offline');
          participantList.setConnectionStatus('Offline');
          pendingSeatRequestId = null;
          appliedSeatId = null;
          pendingObjectId = null;
          appliedObjectId = null;
          window.__musicspaceReleaseSeat?.();
        },
        onError: () => {
          roomPanel.setStatus(`Realtime connection failed for ${roomSlug}. Make sure the ws server is running.`);
          roomPanel.setMeta('Retrying soon');
          participantList.setConnectionStatus('Retrying soon');
        },
        onReconnectAttempt: (attempt, delayMs) => {
          roomPanel.setStatus(`Reconnect attempt ${attempt} for ${roomSlug}.`);
          roomPanel.setMeta(`Retrying in ${Math.round(delayMs / 1000)}s`);
          participantList.setConnectionStatus(`Retrying in ${Math.round(delayMs / 1000)}s`);
        },
        onMessage: (message) => {
          applyServerMessage(roomState, message);
          applyInitialSpawnTransform(message);
          syncSeatState(session.sessionId, roomPanel, () => {
            pendingSeatRequestId = null;
            appliedSeatId = null;
          }, {
            getPendingSeatId: () => pendingSeatRequestId,
            setPendingSeatId: (seatId) => { pendingSeatRequestId = seatId; },
            getAppliedSeatId: () => appliedSeatId,
            setAppliedSeatId: (seatId) => { appliedSeatId = seatId; },
          });
          syncObjectState(session.sessionId, roomPanel, {
            getPendingObjectId: () => pendingObjectId,
            setPendingObjectId: (objectId) => { pendingObjectId = objectId; },
            getAppliedObjectId: () => appliedObjectId,
            setAppliedObjectId: (objectId) => { appliedObjectId = objectId; },
          });
          syncRoomUi(chatPanel, participantList, remotePlayerManager);
        },
      });

      roomClient = nextRoomClient;
      nextRoomClient.connect();
    };

    roomPanel = new RoomPanel(enterRoom, {
      initialRoomSlug,
      initialDisplayName: preferences.profile.displayName || undefined,
    });

    authPanel = new AuthPanel({
      initialLoginId: currentUser?.signInDetails?.loginId ?? null,
      onSignIn: async (email, password) => {
        await signInWithEmail(email, password);
        currentUser = await getAuthenticatedUser();
        authPanel.setUser(currentUser?.signInDetails?.loginId ?? null);
        roomPanel.applyPreferenceDefaults({
          displayName: preferences.profile.displayName,
        });
        const activeSession = sessionStore.getCurrentSession();
        if (activeSession) {
          roomPanel.setStatus(`Signed in as ${currentUser?.signInDetails?.loginId ?? email}. Refreshing room access.`);
          roomPanel.setMeta('Reconnecting');
          participantList.setConnectionStatus('Reconnecting');
          enterRoom({
            roomSlug: activeSession.roomSlug,
            displayName: activeSession.displayName,
          });
          return;
        }

        roomPanel.setStatus(`Signed in as ${currentUser?.signInDetails?.loginId ?? email}. Enter a room to claim ownership or gain admin access.`);
      },
      onSignUp: async (email, password) => {
        const result = await signUpWithEmail(email, password);
        const step = result.nextStep?.signUpStep;
        if (step === 'DONE') {
          currentUser = await getAuthenticatedUser();
          authPanel.setUser(currentUser?.signInDetails?.loginId ?? email);
          roomPanel.setStatus(`Signed in as ${currentUser?.signInDetails?.loginId ?? email}. Re-enter a room to claim ownership or gain admin access.`);
          return {
            needsConfirmation: false,
            message: 'Account created and signed in.',
          };
        }

        return {
          needsConfirmation: true,
          message: 'Account created. Check your email for the confirmation code.',
        };
      },
      onConfirm: async (email, code) => {
        await confirmSignUpWithEmail(email, code);
      },
      onSignOut: async () => {
        await signOutCurrentUser();
        currentUser = null;
        authPanel.setUser(null);
        if (roomClient) {
          roomClient.disconnect(1000, 'sign-out');
          roomClient = null;
        }
        stopRealtimeLoops(presenceTimer, heartbeatTimer);
        presenceTimer = null;
        heartbeatTimer = null;
        sessionStore.clear();
        roomState.clearPresence();
        syncRoomUi(chatPanel, participantList, remotePlayerManager);
        participantList.setConnectionStatus('Idle');
        roomPanel.setMeta('Idle');
        roomPanel.setStatus('Signed out. Enter a room after signing in to claim ownership and use admin controls.');
      },
    });

    window.__musicspaceRequestSeatClaim = (seatId: string) => {
      const activeSession = sessionStore.getCurrentSession();
      if (!activeSession) {
        roomPanel.setStatus('Enter a room before taking a seat.');
        return;
      }

      pendingSeatRequestId = seatId;
      if (roomClient?.isConnected()) {
        roomClient.send({ type: 'seat.claim', roomId: activeSession.roomId, sessionId: activeSession.sessionId, seatId });
        roomPanel.setStatus(`Requesting ${seatId}...`);
        return;
      }

      const occupied = window.__musicspaceOccupySeat?.(seatId);
      if (occupied) {
        appliedSeatId = seatId;
        roomPanel.setStatus(`Seated locally in ${seatId}.`);
      }
    };

    window.__musicspaceRequestSeatRelease = (seatId: string) => {
      const activeSession = sessionStore.getCurrentSession();
      if (!activeSession) {
        return;
      }

      pendingSeatRequestId = null;
      if (roomClient?.isConnected()) {
        roomClient.send({ type: 'seat.release', roomId: activeSession.roomId, sessionId: activeSession.sessionId, seatId });
        roomPanel.setStatus(`Releasing ${seatId}...`);
        return;
      }

      window.__musicspaceReleaseSeat?.();
      appliedSeatId = null;
    };

    window.__musicspaceRequestObjectClaim = (objectId: string) => {
      const activeSession = sessionStore.getCurrentSession();
      if (!activeSession || !roomClient?.isConnected()) {
        return false;
      }

      pendingObjectId = objectId;
      roomClient.send({ type: 'object.claim', roomId: activeSession.roomId, sessionId: activeSession.sessionId, objectId });
      roomPanel.setStatus(`Requesting ${objectId}...`);
      return true;
    };

    window.__musicspaceRequestObjectRelease = (objectId, transform) => {
      const activeSession = sessionStore.getCurrentSession();
      pendingObjectId = null;

      if (!activeSession || !roomClient?.isConnected()) {
        window.__musicspaceApplyObjectSnapshot?.(transform);
        appliedObjectId = null;
        return;
      }

      roomClient.send({
        type: 'object.release',
        roomId: activeSession.roomId,
        sessionId: activeSession.sessionId,
        objectId,
        transform: {
          position: transform.position,
          rotation: transform.rotation,
        },
      });
    };

    const stationOptions = window.__musicspaceGetStationOptions?.() ?? [];
    const preferencesPanel = new PreferencesPanel({
      initialPreferences: preferences,
      stationOptions,
      onSave: (nextPreferences: UserPreferences) => {
        preferences = nextPreferences;
        savePreferences(nextPreferences);
        roomPanel.applyPreferenceDefaults({
          roomSlug: nextPreferences.room.defaultRoomSlug,
          displayName: nextPreferences.profile.displayName,
        });
        window.__musicspaceApplyPreferences?.({
          preferredStationMood: nextPreferences.audio.preferredStationMood,
          defaultVolume: nextPreferences.audio.defaultVolume,
          backgroundOverrideMood: nextPreferences.visuals.backgroundOverrideMood,
        });
      },
      onReset: () => {
        const reset = resetPreferences();
        preferences = reset;
        roomPanel.applyPreferenceDefaults({
          roomSlug: reset.room.defaultRoomSlug,
          displayName: reset.profile.displayName,
        });
        window.__musicspaceApplyPreferences?.({
          preferredStationMood: reset.audio.preferredStationMood,
          defaultVolume: reset.audio.defaultVolume,
          backgroundOverrideMood: reset.visuals.backgroundOverrideMood,
        });
        return reset;
      },
    });

    chatPanel = new ChatPanel((body) => {
      const activeSession = sessionStore.getCurrentSession();
      if (!activeSession) {
        roomPanel.setStatus('Enter a room before sending chat.');
        return;
      }

      if (roomClient?.isConnected()) {
        roomClient.send({
          type: 'chat.send',
          roomId: activeSession.roomId,
          sessionId: activeSession.sessionId,
          body,
          clientMessageId: `${activeSession.sessionId}-${Date.now()}`,
        });
        return;
      }

      const localMessage: ChatMessage = {
        id: `${activeSession.sessionId}-${Date.now()}`,
        roomId: activeSession.roomId,
        userId: activeSession.userId,
        displayName: activeSession.displayName,
        body,
        createdAt: new Date().toISOString(),
      };

      roomState.addMessage(localMessage);
      syncRoomUi(chatPanel, participantList, remotePlayerManager);
      roomPanel.setStatus('Stored message locally. Start the realtime server to broadcast chat.');
    });

    authPanel.mount(sidebarPanels);
    roomPanel.mount(sidebarPanels);
    participantList.mount(sidebarPanels);
    chatPanel.mount(sidebarPanels);
    preferencesPanel.mount(sidebarPanels);
    syncRoomUi(chatPanel, participantList, remotePlayerManager);
    roomPanel.setMeta('Idle');
    participantList.setConnectionStatus('Idle');

    if (currentUser?.signInDetails?.loginId) {
      authPanel.setUser(currentUser.signInDetails.loginId);
      roomPanel.setStatus(`Signed in as ${currentUser.signInDetails.loginId}. Enter a room to create it or join it if it already exists.`);
    } else {
      authPanel.setUser(null);
      roomPanel.setStatus('Enter a room name to create it or join it if it already exists. Sign in to claim ownership and use admin controls.');
    }

    window.addEventListener('beforeunload', () => {
      const session = sessionStore.getCurrentSession();
      if (session && roomClient?.isConnected()) {
        roomClient.send({ type: 'room.leave', roomId: session.roomId, sessionId: session.sessionId });
      }
    });
  });
}

function initializeSidebarLayout(): HTMLElement {
  const sidebar = document.getElementById('musicspace-sidebar');
  const toggle = document.getElementById('musicspace-sidebar-toggle') as HTMLButtonElement | null;
  const panels = document.getElementById('musicspace-panels');

  if (!sidebar || !toggle || !panels) {
    throw new Error('Sidebar UI shell is missing from the DOM.');
  }

  const applyState = (isOpen: boolean) => {
    sidebar.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.textContent = isOpen ? '< Hide' : 'Show >';
  };

  applyState(true);
  toggle.addEventListener('click', () => {
    applyState(!sidebar.classList.contains('is-open'));
  });

  return panels;
}

function applyInitialSpawnTransform(message: ServerMessage): void {
  if (message.type !== 'room.joined') {
    return;
  }

  const selfParticipant = message.participants.find((participant) => participant.sessionId === message.selfSessionId);
  if (!selfParticipant) {
    return;
  }

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  window.__musicspaceApplyLocalPlayerTransform?.(selfParticipant.transform);
  window.renderer?.domElement?.focus();
}

function syncRoomUi(chatPanel: ChatPanel, participantList: ParticipantList, remotePlayerManager: RemotePlayerManager | null): void {
  const snapshot = roomState.getSnapshot();
  const participants = Object.values(snapshot.participants);
  chatPanel.setMessages(snapshot.messages.slice(-APP_CONFIG.chatHistoryLimit));
  participantList.setParticipants(participants, snapshot.selfSessionId, snapshot.authority, snapshot.selfRole);
  Object.values(snapshot.objects).forEach((object) => window.__musicspaceApplyObjectSnapshot?.(object));
  window.__musicspaceGetRemoteParticipants = () => participants
    .filter((participant) => participant.sessionId !== snapshot.selfSessionId)
    .map((participant) => ({
      sessionId: participant.sessionId,
      position: participant.transform.position,
      isSitting: participant.isSitting,
    }));
  remotePlayerManager?.sync(participants, snapshot.selfSessionId);
}

function syncSeatState(
  selfSessionId: string,
  roomPanel: RoomPanel,
  reset: () => void,
  seatState: {
    getPendingSeatId: () => string | null;
    setPendingSeatId: (seatId: string | null) => void;
    getAppliedSeatId: () => string | null;
    setAppliedSeatId: (seatId: string | null) => void;
  },
): void {
  const snapshot = roomState.getSnapshot();
  const occupiedSeat = Object.values(snapshot.seats).find((seat) => seat.occupiedBySessionId === selfSessionId) ?? null;
  const occupiedSeatId = occupiedSeat?.seatId ?? null;

  if (occupiedSeatId && seatState.getAppliedSeatId() !== occupiedSeatId) {
    const didOccupy = window.__musicspaceOccupySeat?.(occupiedSeatId);
    if (didOccupy) {
      seatState.setAppliedSeatId(occupiedSeatId);
      seatState.setPendingSeatId(null);
      roomPanel.setStatus(`Seat confirmed: ${occupiedSeatId}.`);
    }
  }

  if (!occupiedSeatId && seatState.getAppliedSeatId()) {
    window.__musicspaceReleaseSeat?.();
    roomPanel.setStatus('Seat released.');
    seatState.setAppliedSeatId(null);
  }

  const pendingSeatId = seatState.getPendingSeatId();
  if (pendingSeatId) {
    const pendingSeat = snapshot.seats[pendingSeatId];
    if (pendingSeat && pendingSeat.occupiedBySessionId && pendingSeat.occupiedBySessionId !== selfSessionId) {
      roomPanel.setStatus(`Seat ${pendingSeatId} is occupied.`);
      seatState.setPendingSeatId(null);
    }
  }

  if (!snapshot.selfSessionId) {
    reset();
  }
}

function syncObjectState(
  selfSessionId: string,
  roomPanel: RoomPanel,
  objectState: {
    getPendingObjectId: () => string | null;
    setPendingObjectId: (objectId: string | null) => void;
    getAppliedObjectId: () => string | null;
    setAppliedObjectId: (objectId: string | null) => void;
  },
): void {
  const snapshot = roomState.getSnapshot();
  const heldObject = Object.values(snapshot.objects).find((object) => object.ownerSessionId === selfSessionId) ?? null;
  const heldObjectId = heldObject?.objectId ?? null;

  if (heldObjectId && objectState.getAppliedObjectId() !== heldObjectId) {
    const didOccupy = window.__musicspaceOccupyObject?.(heldObjectId) ?? false;
    if (didOccupy) {
      objectState.setAppliedObjectId(heldObjectId);
      objectState.setPendingObjectId(null);
      roomPanel.setStatus(`Object confirmed: ${heldObjectId}.`);
    }
  }

  const pendingObjectId = objectState.getPendingObjectId();
  if (pendingObjectId) {
    const pendingObject = snapshot.objects[pendingObjectId];
    if (pendingObject && pendingObject.ownerSessionId && pendingObject.ownerSessionId !== selfSessionId) {
      roomPanel.setStatus(`Object ${pendingObjectId} is already held.`);
      objectState.setPendingObjectId(null);
    }
  }

  if (!heldObjectId && objectState.getAppliedObjectId()) {
    objectState.setAppliedObjectId(null);
  }
}

function getRealtimeUrl(): string {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';
  const isPrivateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  const isDevHost = import.meta.env.DEV || isLoopback || isPrivateIpv4;
  const port = isDevHost
    ? `:${APP_CONFIG.defaultRealtimePort}`
    : window.location.port
      ? `:${window.location.port}`
      : '';

  return window.__MUSICSPACE_REALTIME_URL__
    ?? import.meta.env.VITE_REALTIME_URL
    ?? `${protocol}://${hostname}${port}`;
}

function getLocalPlayerTransform(): PlayerTransform | null {
  const transform = window.__musicspaceGetLocalPlayerTransform?.();
  if (transform) {
    return transform;
  }

  const camera = window.camera;
  if (!camera) {
    return null;
  }

  const worldPosition = new THREE.Vector3();
  camera.getWorldPosition(worldPosition);

  return {
    position: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
    rotation: { yaw: camera.rotation.y, pitch: camera.rotation.x },
  };
}

function startRealtimeLoops(
  roomClient: RoomClient,
  roomId: string,
  sessionId: string,
  getTransform: () => PlayerTransform | null,
  getSeatState: () => { currentSeatId: string | null; isSitting: boolean } | undefined,
  getObjectState: () => { heldObjectId: string | null } | undefined,
  assign: (presenceTimer: number, heartbeatTimer: number) => void,
): void {
  const presenceTimer = window.setInterval(() => {
    const transform = getTransform();
    const seatState = getSeatState();
    const objectState = getObjectState();
    if (!transform) {
      return;
    }

    roomClient.send({
      type: 'presence.update',
      roomId,
      sessionId,
      transform,
      isSitting: seatState?.isSitting ?? false,
      seatId: seatState?.currentSeatId ?? null,
      heldObjectId: objectState?.heldObjectId ?? null,
    });
  }, Math.round(1000 / APP_CONFIG.movementBroadcastHz));

  const heartbeatTimer = window.setInterval(() => {
    roomClient.send({ type: 'ping', ts: Date.now() });
  }, 15000);

  assign(presenceTimer, heartbeatTimer);
}

function stopRealtimeLoops(presenceTimer: number | null, heartbeatTimer: number | null): void {
  if (presenceTimer !== null) {
    window.clearInterval(presenceTimer);
  }
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
  }
}



function getRoomSlugFromUrl(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const roomSlug = params.get('room')?.trim();
  return roomSlug || undefined;
}

function updateRoomSlugInUrl(roomSlug: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomSlug);
  window.history.replaceState({}, '', url);
}
