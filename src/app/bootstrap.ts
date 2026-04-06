import * as THREE from 'three';
import { APP_CONFIG } from './config';
import {
  confirmSignUpWithEmail,
  getAuthenticatedUser,
  getRealtimeAuthToken,
  signInWithEmail,
  signOutCurrentUser,
  signUpWithEmail,
} from '../backend/authClient';
import type { RemotePlayerManager } from '../player/remotePlayerManager';
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
import type { RoomSummary, RoomSurfaceId } from '../types/room';

const roomState = new RoomStateStore();
const sessionStore = new RoomSessionStore();

export function bootstrapApp(): void {
  window.addEventListener('DOMContentLoaded', async () => {
    const sidebarPanels = initializeSidebarLayout();
    const [{ initializeApp }, { RemotePlayerManager }] = await Promise.all([
      import('./initializeApp'),
      import('../player/remotePlayerManager'),
    ]);
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
    let knownRooms: RoomSummary[] = [];

    const updateLobbyOverlay = () => {
      if (currentUser?.signInDetails?.loginId) {
        (window as any).__musicspaceSetLobbyOverlaySupport?.('Choose a room or create one from the sidebar.');
        return;
      }
      (window as any).__musicspaceSetLobbyOverlaySupport?.('Sign in to create a saved room with ownership and moderation controls.');
    };

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

    const refreshRooms = async () => {
      const activeRoomSlug = sessionStore.getCurrentSession()?.roomSlug ?? null;
      roomPanel.setRoomListLoading();
      try {
        const { listLiveRooms, listRooms, mergeRoomSummaries } = await import('../backend/dataClient');
        if (!currentUser) {
          let liveRooms: RoomSummary[] = [];
          try {
            liveRooms = await listLiveRooms();
          } catch (error) {
            console.error('Failed to load live rooms', error);
          }

          knownRooms = mergeRoomSummaries([], liveRooms);
          roomPanel.setRooms(knownRooms, activeRoomSlug);
          roomPanel.setStatus('Signed out. Join a live room as guest or sign in to create a saved room.');
          if (liveRooms.length === 0) {
            roomPanel.setRoomListSignedOut('No live rooms right now. Sign in to load saved rooms.');
          } else {
            roomPanel.setRoomListStatusMessage(`${liveRooms.length} live room${liveRooms.length === 1 ? '' : 's'} available`);
          }
          return;
        }

        const [savedResult, liveResult] = await Promise.allSettled([listRooms(), listLiveRooms()]);
        const nextSavedRooms = savedResult.status === 'fulfilled' ? savedResult.value : [];
        const liveRooms = liveResult.status === 'fulfilled' ? liveResult.value : [];

        if (savedResult.status === 'rejected') {
          console.error('Failed to load persisted rooms', savedResult.reason);
        }
        if (liveResult.status === 'rejected') {
          console.error('Failed to load live rooms', liveResult.reason);
        }

        knownRooms = mergeRoomSummaries(nextSavedRooms, liveRooms);
        roomPanel.setRooms(knownRooms, activeRoomSlug);
        if (savedResult.status === 'rejected' && liveResult.status === 'fulfilled') {
          roomPanel.setRoomListStatusMessage('Saved rooms are unavailable right now. Showing live rooms only.');
          return;
        }
        if (savedResult.status === 'fulfilled' && liveResult.status === 'rejected') {
          roomPanel.setStatus('Live room lookup is unavailable right now. Saved rooms are still available.');
        }
        if (savedResult.status === 'rejected' && liveResult.status === 'rejected') {
          roomPanel.setRoomListError('Unable to load saved or live rooms right now.');
          return;
        }
      } catch (error) {
        console.error('Failed to load persisted rooms', error);
        roomPanel.setRoomListError('Unable to load persisted rooms.');
      }
    };

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
      roomPanel.setActiveRoom(roomSlug, knownRooms.some((room) => room.slug.toLowerCase() === roomSlug.toLowerCase() && room.isPersisted));
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
          const wasPersistedRoom = roomState.getSnapshot().isPersisted;
          stopRealtimeLoops(presenceTimer, heartbeatTimer);
          presenceTimer = null;
          heartbeatTimer = null;
          roomState.clearPresence();
          syncRoomUi(chatPanel, participantList, remotePlayerManager);
          roomPanel.setStatus(`Disconnected from ${roomSlug}.`);
          roomPanel.setMeta('Offline');
          roomPanel.setActiveRoom(roomSlug, wasPersistedRoom);
          participantList.setConnectionStatus('Offline');
          pendingSeatRequestId = null;
          appliedSeatId = null;
          pendingObjectId = null;
          appliedObjectId = null;
          window.__musicspaceReleaseSeat?.();
          (window as any).__musicspaceSetLobbyMode?.(true);
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
          roomPanel.setActiveRoom(session.roomSlug, roomState.getSnapshot().isPersisted);
          if (
            message.type === 'room.joined'
            && message.isPersisted
            && !knownRooms.some((room) => room.slug.toLowerCase() === session.roomSlug.toLowerCase() && room.isPersisted)
          ) {
            void refreshRooms();
          }
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
      initialIsAuthenticated: Boolean(currentUser),
    });

    authPanel = new AuthPanel({
      initialLoginId: currentUser?.signInDetails?.loginId ?? null,
      onSignIn: async (email, password) => {
        await signInWithEmail(email, password);
        currentUser = await getAuthenticatedUser();
        authPanel.setUser(currentUser?.signInDetails?.loginId ?? null);
        updateLobbyOverlay();
        roomPanel.setAuthenticationState(Boolean(currentUser));
        roomPanel.applyPreferenceDefaults({
          displayName: preferences.profile.displayName,
        });
        const activeSession = sessionStore.getCurrentSession();
        if (activeSession) {
          roomPanel.setStatus(`Signed in as ${currentUser?.signInDetails?.loginId ?? email}. Refreshing room access and saved-room ownership.`);
          roomPanel.setMeta('Reconnecting');
          participantList.setConnectionStatus('Reconnecting');
          void refreshRooms();
          enterRoom({
            roomSlug: activeSession.roomSlug,
            displayName: activeSession.displayName,
          });
          return;
        }

        roomPanel.setStatus(`Signed in as ${currentUser?.signInDetails?.loginId ?? email}. Create a saved room or join an existing one.`);
        void refreshRooms();
      },
      onSignUp: async (email, password) => {
        const result = await signUpWithEmail(email, password);
        const step = result.nextStep?.signUpStep;
        if (step === 'DONE') {
          currentUser = await getAuthenticatedUser();
          authPanel.setUser(currentUser?.signInDetails?.loginId ?? email);
          updateLobbyOverlay();
          roomPanel.setAuthenticationState(Boolean(currentUser));
          void refreshRooms();
          roomPanel.setStatus(`Signed in as ${currentUser?.signInDetails?.loginId ?? email}. Re-enter a room to create or claim its saved session.`);
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
        updateLobbyOverlay();
        roomPanel.setAuthenticationState(false);
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
        void refreshRooms();
        roomPanel.setStatus('Signed out. Join a saved room or enter a temporary guest room. Sign in to create saved rooms and use admin controls.');
        (window as any).__musicspaceSetLobbyMode?.(true);
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

    chatPanel = new ChatPanel({
      onSend: (body) => {
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
      },
      onUploadSurface: async (surfaceId: RoomSurfaceId, file: File) => {
        const activeSession = sessionStore.getCurrentSession();
        if (!activeSession || !roomClient?.isConnected()) {
          throw new Error('Enter a live room before updating shared surfaces.');
        }
        if (!activeSession.userId) {
          throw new Error('Sign in to update shared surfaces.');
        }
        if (!roomState.getSnapshot().isPersisted) {
          throw new Error('Shared surfaces are available only in saved rooms.');
        }

        const { uploadRoomSurfaceImage } = await import('../backend/surfaceImageClient');
        const imagePath = await uploadRoomSurfaceImage(activeSession.roomId, surfaceId, file);
        roomClient.send({
          type: 'admin.setSurfaceImage',
          roomId: activeSession.roomId,
          sessionId: activeSession.sessionId,
          surfaceId,
          imagePath,
        });
        roomPanel.setStatus(`Uploaded ${surfaceId}. Waiting for room sync...`);
      },
      onSetTvMedia: async (sourceUrl: string | null) => {
        const activeSession = sessionStore.getCurrentSession();
        if (!activeSession || !roomClient?.isConnected()) {
          throw new Error('Enter a live room before updating the shared TV.');
        }
        if (!activeSession.userId) {
          throw new Error('Sign in to update the shared TV.');
        }
        if (!roomState.getSnapshot().isPersisted) {
          throw new Error('Shared TV is available only in saved rooms.');
        }

        roomClient.send({
          type: 'admin.setTvMedia',
          roomId: activeSession.roomId,
          sessionId: activeSession.sessionId,
          sourceUrl,
        });
        roomPanel.setStatus(sourceUrl ? 'Updating shared TV...' : 'Clearing shared TV...');
      },
      onUploadTvMedia: async (file: File) => {
        const activeSession = sessionStore.getCurrentSession();
        if (!activeSession || !roomClient?.isConnected()) {
          throw new Error('Enter a live room before uploading a shared TV video.');
        }
        if (!activeSession.userId) {
          throw new Error('Sign in to upload a shared TV video.');
        }
        if (!roomState.getSnapshot().isPersisted) {
          throw new Error('Shared TV is available only in saved rooms.');
        }

        const { uploadRoomTvVideo } = await import('../backend/tvMediaClient');
        const sourceUrl = await uploadRoomTvVideo(activeSession.roomId, file);
        roomClient.send({
          type: 'admin.setTvMedia',
          roomId: activeSession.roomId,
          sessionId: activeSession.sessionId,
          sourceUrl,
        });
        roomPanel.setStatus(`Uploaded ${file.name}. Waiting for shared TV sync...`);
      },
      onSetTvPlayback: async (isPlaying: boolean, currentTime: number) => {
        const activeSession = sessionStore.getCurrentSession();
        if (!activeSession || !roomClient?.isConnected()) {
          throw new Error('Enter a live room before updating shared TV playback.');
        }
        if (!activeSession.userId) {
          throw new Error('Sign in to update shared TV playback.');
        }
        if (!roomState.getSnapshot().isPersisted) {
          throw new Error('Shared TV is available only in saved rooms.');
        }

        window.__musicspaceSetTvPlayback?.(isPlaying, currentTime);
        roomClient.send({
          type: 'admin.setTvPlayback',
          roomId: activeSession.roomId,
          sessionId: activeSession.sessionId,
          isPlaying,
          currentTime,
        });
        roomPanel.setStatus(isPlaying ? 'Resuming shared TV...' : 'Pausing shared TV...');
      },
    });

    roomPanel.mount(sidebarPanels.primaryPanels);
    participantList.mount(sidebarPanels.primaryPanels);
    authPanel.mount(sidebarPanels.advancedPanels);
    chatPanel.mount(sidebarPanels.primaryPanels, sidebarPanels.advancedPanels);
    preferencesPanel.mount(sidebarPanels.advancedPanels);
    syncRoomUi(chatPanel, participantList, remotePlayerManager);
    roomPanel.setMeta('Idle');
    participantList.setConnectionStatus('Idle');

    if (currentUser?.signInDetails?.loginId) {
      authPanel.setUser(currentUser.signInDetails.loginId);
      updateLobbyOverlay();
      roomPanel.setAuthenticationState(true);
      roomPanel.setStatus(`Signed in as ${currentUser.signInDetails.loginId}. Create a saved room or join an existing one.`);
      void refreshRooms();
    } else {
      authPanel.setUser(null);
      updateLobbyOverlay();
      roomPanel.setAuthenticationState(false);
      void refreshRooms();
      roomPanel.setStatus('Join a live room as guest or sign in to create saved rooms and use admin controls.');
    }

    window.addEventListener('beforeunload', () => {
      const session = sessionStore.getCurrentSession();
      if (session && roomClient?.isConnected()) {
        roomClient.send({ type: 'room.leave', roomId: session.roomId, sessionId: session.sessionId });
      }
    });
  });
}

type SidebarLayout = {
  primaryPanels: HTMLElement;
  advancedPanels: HTMLElement;
};

function initializeSidebarLayout(): SidebarLayout {
  const sidebar = document.getElementById('musicspace-sidebar');
  const toggle = document.getElementById('musicspace-sidebar-toggle') as HTMLButtonElement | null;
  const primaryPanels = document.getElementById('musicspace-primary-panels');
  const advancedPanels = document.getElementById('musicspace-advanced-panels');
  const scrollContainer = document.getElementById('musicspace-sidebar-scroll');
  const statusIndicator = document.getElementById('musicspace-session-indicator');
  const statusLine1 = document.getElementById('musicspace-session-line-1');
  const statusLine2 = document.getElementById('musicspace-session-line-2');
  const quickNavButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#musicspace-quick-nav [data-target]'));

  if (
    !sidebar
    || !toggle
    || !primaryPanels
    || !advancedPanels
    || !scrollContainer
    || !statusIndicator
    || !statusLine1
    || !statusLine2
  ) {
    throw new Error('Sidebar UI shell is missing from the DOM.');
  }

  const applyState = (isOpen: boolean) => {
    sidebar.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.textContent = isOpen ? 'Hide >' : '< Show';
  };

  applyState(true);
  toggle.addEventListener('click', () => {
    applyState(!sidebar.classList.contains('is-open'));
  });

  const setActiveQuickNav = (targetId: string) => {
    quickNavButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.target === targetId);
    });
  };

  quickNavButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.target;
      if (!targetId) {
        return;
      }

      const target = document.getElementById(targetId);
      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveQuickNav(targetId);
    });
  });

  const observedSections = quickNavButtons
    .map((button) => button.dataset.target)
    .filter((value): value is string => Boolean(value))
    .map((id) => document.getElementById(id))
    .filter((value): value is HTMLElement => Boolean(value));

  const observer = new IntersectionObserver((entries) => {
    const visibleEntry = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

    if (visibleEntry?.target.id) {
      setActiveQuickNav(visibleEntry.target.id);
    }
  }, {
    root: scrollContainer,
    threshold: [0.2, 0.45, 0.7],
  });

  observedSections.forEach((section) => observer.observe(section));
  setActiveQuickNav('music-section');

  const syncSessionHeader = () => {
    const roomMeta = document.querySelector<HTMLElement>('#room-panel .room-meta')?.textContent?.trim() || 'Idle';
    const roomStatus = document.querySelector<HTMLElement>('#room-panel .room-status')?.textContent?.trim() || 'Join a room to start a session.';
    const roomSlug = document.querySelector<HTMLInputElement>('#room-panel input[placeholder="Room link / slug"]')?.value.trim() || 'No room selected';
    const displayName = document.querySelector<HTMLInputElement>('#room-panel input[placeholder="Display name"]')?.value.trim()
      || document.querySelector<HTMLElement>('#auth-panel .musicspace-accordion-meta')?.textContent?.trim()
      || 'Guest';

    statusLine1.textContent = roomMeta;
    statusLine2.textContent = `${roomSlug} · ${displayName}`;

    statusIndicator.classList.remove('is-idle', 'is-live', 'is-warn');
    if (/live|connected/i.test(roomMeta)) {
      statusIndicator.classList.add('is-live');
    } else if (/retry|offline|disconnected|failed/i.test(roomStatus) || /offline|retry/i.test(roomMeta)) {
      statusIndicator.classList.add('is-warn');
    } else {
      statusIndicator.classList.add('is-idle');
    }
  };

  const mutationObserver = new MutationObserver(() => {
    syncSessionHeader();
  });

  const mutationConfig = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['value', 'data-auth-state'],
  };

  mutationObserver.observe(primaryPanels, mutationConfig);
  mutationObserver.observe(advancedPanels, mutationConfig);
  scrollContainer.addEventListener('input', () => {
    syncSessionHeader();
  });

  syncSessionHeader();

  return { primaryPanels, advancedPanels };
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

  (window as any).__musicspaceSetLobbyMode?.(false);
  window.__musicspaceApplyLocalPlayerTransform?.(selfParticipant.transform);
  window.renderer?.domElement?.focus();
}

function syncRoomUi(chatPanel: ChatPanel, participantList: ParticipantList, remotePlayerManager: RemotePlayerManager | null): void {
  const snapshot = roomState.getSnapshot();
  const participants = Object.values(snapshot.participants);
  chatPanel.setMessages(snapshot.messages.slice(-APP_CONFIG.chatHistoryLimit));
  chatPanel.setSurfaceUploadState(snapshot.selfRole, snapshot.isPersisted);
  chatPanel.setTvMediaState(
    snapshot.selfRole,
    snapshot.isPersisted,
    snapshot.tvMedia?.sourceUrl ?? null,
    snapshot.tvMedia?.isPlaying ?? false,
    snapshot.tvMedia?.currentTime ?? 0,
  );
  participantList.setParticipants(participants, snapshot.selfSessionId, snapshot.authority, snapshot.selfRole);
  Object.values(snapshot.objects).forEach((object) => window.__musicspaceApplyObjectSnapshot?.(object));
  window.__musicspaceSyncRoomSurfaces?.(Object.values(snapshot.surfaces));
  if (snapshot.tvMedia?.sourceUrl) {
    window.__musicspaceSetTvVideoSource?.(snapshot.tvMedia.sourceUrl);
    window.__musicspaceSetTvPlayback?.(snapshot.tvMedia.isPlaying, snapshot.tvMedia.currentTime);
  } else {
    window.__musicspaceClearTvVideoSource?.();
  }
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
