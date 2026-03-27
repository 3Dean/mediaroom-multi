import { APP_CONFIG } from './config';
import { initializeApp } from './initializeApp';
import { getAuthenticatedUser } from '../backend/authClient';
import { RemotePlayerManager } from '../player/remotePlayerManager';
import { RoomClient } from '../room/roomClient';
import { applyServerMessage } from '../room/roomPresence';
import { RoomSessionStore } from '../room/roomSession';
import { RoomStateStore } from '../room/roomState';
import type { ChatMessage } from '../types/chat';
import type { PlayerTransform } from '../types/player';
import { ChatPanel } from '../ui/chatPanel';
import { ParticipantList } from '../ui/participantList';
import { RoomPanel } from '../ui/roomPanel';

const roomState = new RoomStateStore();
const sessionStore = new RoomSessionStore();

export function bootstrapApp(): void {
  window.addEventListener('DOMContentLoaded', async () => {
    initializeApp();

    const currentUser = await getAuthenticatedUser();
    const remotePlayerManager = window.scene ? new RemotePlayerManager(window.scene) : null;
    const participantList = new ParticipantList();
    let roomClient: RoomClient | null = null;
    let presenceTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let pendingSeatRequestId: string | null = null;
    let appliedSeatId: string | null = null;
    let pendingObjectId: string | null = null;
    let appliedObjectId: string | null = null;

    const roomPanel = new RoomPanel(({ roomSlug, displayName }) => {
      const session = sessionStore.createSession(roomSlug, displayName, currentUser?.userId);
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
        reconnectDelayMs: 1000,
        maxReconnectDelayMs: 8000,
        onOpen: () => {
          roomPanel.setStatus(`Connected to ${roomSlug}.`);
          roomPanel.setMeta('Live');
          participantList.setConnectionStatus('Live');
          nextRoomClient.send({
            type: 'room.join',
            roomId: session.roomId,
            sessionId: session.sessionId,
            displayName: session.displayName,
            userId: session.userId,
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
    });

    window.__musicspaceRequestSeatClaim = (seatId: string) => {
      const activeSession = sessionStore.getCurrentSession();
      if (!activeSession) {
        roomPanel.setStatus('Join a room before taking a seat.');
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
        return;
      }

      pendingObjectId = objectId;
      roomClient.send({ type: 'object.claim', roomId: activeSession.roomId, sessionId: activeSession.sessionId, objectId });
      roomPanel.setStatus(`Requesting ${objectId}...`);
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

    const chatPanel = new ChatPanel((body) => {
      const activeSession = sessionStore.getCurrentSession();
      if (!activeSession) {
        roomPanel.setStatus('Join a room before sending chat.');
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

    roomPanel.mount();
    chatPanel.mount();
    participantList.mount();
    syncRoomUi(chatPanel, participantList, remotePlayerManager);
    roomPanel.setMeta('Idle');
    participantList.setConnectionStatus('Idle');

    if (currentUser?.signInDetails?.loginId) {
      roomPanel.setStatus(`Signed in as ${currentUser.signInDetails.loginId}. Join a room to start a live session.`);
    } else {
      roomPanel.setStatus('Guest mode active. Join a room and the local ws server will create a live session.');
    }

    window.addEventListener('beforeunload', () => {
      const session = sessionStore.getCurrentSession();
      if (session && roomClient?.isConnected()) {
        roomClient.send({ type: 'room.leave', roomId: session.roomId, sessionId: session.sessionId });
      }
    });
  });
}

function syncRoomUi(chatPanel: ChatPanel, participantList: ParticipantList, remotePlayerManager: RemotePlayerManager | null): void {
  const snapshot = roomState.getSnapshot();
  const participants = Object.values(snapshot.participants);
  chatPanel.setMessages(snapshot.messages.slice(-APP_CONFIG.chatHistoryLimit));
  participantList.setParticipants(participants, snapshot.selfSessionId);
  Object.values(snapshot.objects).forEach((object) => window.__musicspaceApplyObjectSnapshot?.(object));
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
    objectState.setAppliedObjectId(heldObjectId);
    objectState.setPendingObjectId(null);
    roomPanel.setStatus(`Object confirmed: ${heldObjectId}.`);
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
  return window.__MUSICSPACE_REALTIME_URL__
    ?? import.meta.env.VITE_REALTIME_URL
    ?? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:${APP_CONFIG.defaultRealtimePort}`;
}

function getLocalPlayerTransform(): PlayerTransform | null {
  const camera = window.camera;
  if (!camera || !camera.parent) {
    return null;
  }

  return {
    position: { x: camera.parent.position.x, y: camera.parent.position.y, z: camera.parent.position.z },
    rotation: { yaw: camera.parent.rotation.y, pitch: camera.rotation.x },
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

