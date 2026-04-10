import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createPublicKey, createVerify, randomUUID } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Euler, Quaternion, Vector3 } from 'three';
import { WebSocketServer } from 'ws';
import { canUseBackendPersistence, deleteRoomFromBackend, loadAuthorityFromBackend, loadFallbackAuthorityStore, normalizeAuthority as normalizeRoomAuthority, persistFallbackAuthorityStore, saveAuthorityToBackend } from './roomAuthorityRepository.js';
import {
  createRoomMediaAssetInBackend,
  deleteRoomMediaAssetFromBackend,
  deleteRoomMediaAssetsFromBackend,
  getRoomMediaAssetByChecksumFromBackend,
  getRoomMediaAssetByIdFromBackend,
  getRoomMediaAssetByStorageKeyFromBackend,
  listRoomMediaAssetsFromBackend,
  summarizeRoomMediaUsage,
  updateRoomMediaAssetInBackend,
} from './roomMediaAssetRepository.js';
import { canUseSurfaceBackendPersistence, deleteSurfaceSnapshotFromBackend, deleteSurfaceSnapshotsFromBackend, loadSurfaceSnapshotsFromBackend, saveSurfaceSnapshotToBackend } from './roomSurfaceRepository.js';

const HOST = process.env.REALTIME_HOST?.trim() || null;
const PORT = Number(process.env.REALTIME_PORT ?? process.env.PORT ?? 8787);
const MAX_ROOM_SIZE = Number(process.env.REALTIME_MAX_ROOM_SIZE ?? 8);
const MAX_CHAT_LENGTH = Number(process.env.REALTIME_MAX_CHAT_LENGTH ?? 280);
const CHAT_WINDOW_MS = Number(process.env.REALTIME_CHAT_WINDOW_MS ?? 10000);
const CHAT_MAX_MESSAGES = Number(process.env.REALTIME_CHAT_MAX_MESSAGES ?? 5);
const MAX_DISPLAY_NAME_LENGTH = Number(process.env.REALTIME_MAX_DISPLAY_NAME_LENGTH ?? 32);
const MAX_ROOM_ID_LENGTH = Number(process.env.REALTIME_MAX_ROOM_ID_LENGTH ?? 64);
const MAX_OBJECT_ID_LENGTH = Number(process.env.REALTIME_MAX_OBJECT_ID_LENGTH ?? 64);
const MAX_SEAT_ID_LENGTH = Number(process.env.REALTIME_MAX_SEAT_ID_LENGTH ?? 64);
const MAX_SURFACE_IMAGE_PATH_LENGTH = Number(process.env.REALTIME_MAX_SURFACE_IMAGE_PATH_LENGTH ?? 512);
const MAX_UPLOAD_FILE_NAME_LENGTH = Number(process.env.REALTIME_MAX_UPLOAD_FILE_NAME_LENGTH ?? 160);
const MAX_UPLOAD_CONTENT_TYPE_LENGTH = Number(process.env.REALTIME_MAX_UPLOAD_CONTENT_TYPE_LENGTH ?? 128);
const MAX_UPLOAD_INTENTS_PER_USER = Number(process.env.REALTIME_MAX_UPLOAD_INTENTS_PER_USER ?? 12);
const MEDIA_UPLOAD_INTENT_TTL_MS = Number(process.env.REALTIME_MEDIA_UPLOAD_INTENT_TTL_MS ?? 5 * 60 * 1000);
const MAX_SURFACE_IMAGE_BYTES = Number(process.env.REALTIME_MAX_SURFACE_IMAGE_BYTES ?? 10 * 1024 * 1024);
const MAX_TV_VIDEO_BYTES = Number(process.env.REALTIME_MAX_TV_VIDEO_BYTES ?? 100 * 1024 * 1024);
const MAX_ROOM_MEDIA_BYTES = Number(process.env.REALTIME_MAX_ROOM_MEDIA_BYTES ?? 500 * 1024 * 1024);
const MAX_MEDIA_CHECKSUM_LENGTH = Number(process.env.REALTIME_MAX_MEDIA_CHECKSUM_LENGTH ?? 128);
const MAX_MEDIA_ASSET_ID_LENGTH = Number(process.env.REALTIME_MAX_MEDIA_ASSET_ID_LENGTH ?? 128);
const ROOM_MEDIA_DEDUP_CACHE_TTL_MS = Number(process.env.REALTIME_ROOM_MEDIA_DEDUP_CACHE_TTL_MS ?? 15 * 60 * 1000);
const LOG_LEVEL = normalizeLogLevel(process.env.REALTIME_LOG_LEVEL);
const DEFAULT_EYE_HEIGHT = 1.6;
const VALID_SURFACE_IDS = new Set(['image01', 'image02', 'image03', 'image04']);
const ALLOWED_SURFACE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_TV_VIDEO_TYPES = new Set(['video/mp4']);
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.REALTIME_ALLOWED_ORIGINS ?? process.env.RENDER_EXTERNAL_URL ?? '');
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const AMPLIFY_OUTPUTS_PATH = join(__dirname, '..', 'amplify_outputs.json');
const AMPLIFY_OUTPUTS = loadAmplifyOutputs();
const COGNITO_USER_POOL_ID = process.env.REALTIME_COGNITO_USER_POOL_ID?.trim() || AMPLIFY_OUTPUTS.auth?.user_pool_id || '';
const COGNITO_CLIENT_ID = process.env.REALTIME_COGNITO_CLIENT_ID?.trim() || AMPLIFY_OUTPUTS.auth?.user_pool_client_id || '';
const COGNITO_ISSUER = process.env.REALTIME_COGNITO_ISSUER?.trim() || deriveCognitoIssuer(COGNITO_USER_POOL_ID);
const STORAGE_BUCKET_NAME = process.env.REALTIME_STORAGE_BUCKET_NAME?.trim()
  || AMPLIFY_OUTPUTS.storage?.bucket_name
  || AMPLIFY_OUTPUTS.storage?.buckets?.[0]?.bucket_name
  || '';
const STORAGE_REGION = process.env.REALTIME_STORAGE_REGION?.trim()
  || AMPLIFY_OUTPUTS.storage?.aws_region
  || AMPLIFY_OUTPUTS.storage?.buckets?.[0]?.aws_region
  || process.env.AWS_REGION?.trim()
  || AMPLIFY_OUTPUTS.auth?.aws_region
  || 'us-east-1';
const storageCredentialsProvider = STORAGE_BUCKET_NAME ? defaultProvider() : null;
const storageClient = STORAGE_BUCKET_NAME && storageCredentialsProvider
  ? new S3Client({
      region: STORAGE_REGION,
      credentials: storageCredentialsProvider,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  : null;
const DIST_DIR = join(__dirname, '..', 'dist');
const INDEX_FILE = join(DIST_DIR, 'index.html');
const HAS_DIST = existsSync(INDEX_FILE);
const SPAWN_POINTS = loadSpawnPoints();
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const roomParticipants = new Map();
const roomSockets = new Map();
const roomMessages = new Map();
const roomSeats = new Map();
const roomObjects = new Map();
const roomSurfaces = new Map();
const roomTvMedia = new Map();
const hydratedSurfaceRooms = new Set();
const chatRateLimits = new Map();
const mediaUploadIntents = new Map();
const roomMediaChecksumCache = new Map();
const roomAuthorities = new Map(Object.entries(loadFallbackAuthorityStore()).map(([roomId, authority]) => [roomId, normalizeRoomAuthority(authority)]));
const jwksCache = new Map();
const persistenceHealth = {
  authority: createPersistenceStatus(canUseBackendPersistence(), 'fallback-only'),
  surface: createPersistenceStatus(canUseSurfaceBackendPersistence(), 'memory-only'),
};

function writeHealthResponse(request, response) {
  response.writeHead(200, withCorsHeaders(request, { 'Content-Type': 'application/json' }));
  response.end(JSON.stringify({
    ok: true,
    host: HOST ?? 'default',
    port: PORT,
    roomCount: roomParticipants.size,
    maxRoomSize: MAX_ROOM_SIZE,
    allowedOrigins: ALLOWED_ORIGINS.length === 0 ? 'all' : ALLOWED_ORIGINS,
    servingDist: HAS_DIST,
    spawnPoints: SPAWN_POINTS.length,
    authorityRooms: roomAuthorities.size,
    surfaceRooms: roomSurfaces.size,
    authorityPersistence: describePersistenceStatus(persistenceHealth.authority, 'backend+fallback'),
    surfacePersistence: describePersistenceStatus(persistenceHealth.surface, 'backend'),
    authorityPersistenceStatus: persistenceHealth.authority,
    surfacePersistenceStatus: persistenceHealth.surface,
    cognitoIssuer: COGNITO_ISSUER || null,
  }));
}

const server = createServer((request, response) => {
  if (request.url?.startsWith('/api/')) {
    if (!isHttpOriginAllowed(request)) {
      response.writeHead(403, withCorsHeaders(request, { 'Content-Type': 'application/json; charset=utf-8' }));
      response.end(JSON.stringify({ error: 'origin_not_allowed', message: 'Origin is not allowed.' }));
      return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, withCorsHeaders(request, {}));
      response.end();
      return;
    }
  }

  if (request.url === '/health' || request.url === '/healthz') {
    writeHealthResponse(request, response);
    return;
  }
  if (request.url === '/api/rooms/live') {
    response.writeHead(200, withCorsHeaders(request, { 'Content-Type': 'application/json' }));
    response.end(JSON.stringify({
      rooms: listLiveRooms(),
    }));
    return;
  }
  if (request.url === '/api/rooms/delete' && request.method === 'POST') {
    void handleDeleteRoomRequest(request, response);
    return;
  }
  if (request.url === '/api/uploads/surface-authorize' && request.method === 'POST') {
    void handleAuthorizeSurfaceUploadRequest(request, response);
    return;
  }
  if (request.url === '/api/uploads/tv-authorize' && request.method === 'POST') {
    void handleAuthorizeTvUploadRequest(request, response);
    return;
  }
  if (request.url === '/api/uploads/media-finalize' && request.method === 'POST') {
    void handleFinalizeMediaUploadRequest(request, response);
    return;
  }
  if (request.url?.startsWith('/api/rooms/media') && request.method === 'GET') {
    void handleListRoomMediaRequest(request, response);
    return;
  }
  if (request.url === '/api/rooms/media/delete' && request.method === 'POST') {
    void handleDeleteRoomMediaRequest(request, response);
    return;
  }

  if (HAS_DIST) {
    serveStaticAsset(request, response);
    return;
  }

  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('musicspace realtime server');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket, request) => {
  const origin = request.headers.origin ?? '';
  if (!isOriginAllowed(origin)) {
    socket.close(1008, 'origin_not_allowed');
    return;
  }

  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'error', code: 'bad_json', message: 'Unable to parse message payload.' });
      return;
    }

    void handleClientMessage(socket, message);
  });

  socket.on('close', () => cleanupSocket(socket));
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.isAlive) {
      socket.terminate();
      cleanupSocket(socket);
      return;
    }

    socket.isAlive = false;
    socket.ping();
  });
}, 15000);

wss.on('close', () => clearInterval(heartbeat));
if (HOST) {
  server.listen(PORT, HOST, () => {
    logServerStart();
    void probePersistenceHealth();
  });
} else {
  server.listen(PORT, () => {
    logServerStart();
    void probePersistenceHealth();
  });
}

function logServerStart() {
  logEvent('info', 'server.start', {
    port: PORT,
    host: HOST,
    servingDist: HAS_DIST,
    spawnPoints: SPAWN_POINTS.length,
    maxRoomSize: MAX_ROOM_SIZE,
    maxChatLength: MAX_CHAT_LENGTH,
    chatRate: `${CHAT_MAX_MESSAGES}/${CHAT_WINDOW_MS}ms`,
    allowedOrigins: ALLOWED_ORIGINS.length === 0 ? 'all' : ALLOWED_ORIGINS,
    authorityPersistence: describePersistenceStatus(persistenceHealth.authority, 'backend+fallback'),
    cognitoIssuer: COGNITO_ISSUER || 'disabled',
    logLevel: LOG_LEVEL,
  });
}

async function handleClientMessage(socket, message) {
  if (!message || typeof message.type !== 'string') {
    send(socket, { type: 'error', code: 'bad_message', message: 'Message type is required.' });
    return;
  }

  switch (message.type) {
    case 'room.join':
      await handleRoomJoin(socket, message);
      return;
    case 'room.leave':
      cleanupSocket(socket, message.roomId, message.sessionId);
      return;
    case 'presence.update':
      handlePresenceUpdate(socket, message);
      return;
    case 'chat.send':
      handleChatSend(socket, message);
      return;
    case 'seat.claim':
      handleSeatClaim(socket, message);
      return;
    case 'seat.release':
      handleSeatRelease(socket, message);
      return;
    case 'object.claim':
      handleObjectClaim(socket, message);
      return;
    case 'object.release':
      handleObjectRelease(socket, message);
      return;
    case 'admin.kick':
      handleAdminKick(socket, message);
      return;
    case 'admin.setRole':
      await handleAdminSetRole(socket, message);
      return;
    case 'admin.setMute':
      await handleAdminSetMute(socket, message);
      return;
    case 'admin.setRoomLock':
      await handleAdminSetRoomLock(socket, message);
      return;
    case 'admin.setSurfaceImage':
      await handleAdminSetSurfaceImage(socket, message);
      return;
    case 'admin.setTvMedia':
      await handleAdminSetTvMedia(socket, message);
      return;
    case 'admin.setTvPlayback':
      await handleAdminSetTvPlayback(socket, message);
      return;
    case 'ping':
      send(socket, { type: 'pong', ts: message.ts });
      return;
    default:
      send(socket, { type: 'error', code: 'unknown_type', message: `Unsupported message type: ${message.type}` });
  }
}
async function handleRoomJoin(socket, message) {
  const roomId = normalizeToken(message.roomId, MAX_ROOM_ID_LENGTH);
  const sessionId = normalizeToken(message.sessionId, 128);
  const displayName = normalizeDisplayName(message.displayName);
  const avatarStyle = normalizeToken(message.avatarStyle ?? '', 64);

  if (!roomId || !sessionId || !displayName) {
    logEvent('warn', 'room.join.invalid', {
      roomId,
      sessionId,
      hasDisplayName: Boolean(displayName),
    });
    send(socket, { type: 'error', code: 'invalid_join', message: 'roomId, sessionId, and displayName are required.' });
    return;
  }

  const authResult = await verifyAuthToken(message.token);
  if (message.token && !authResult.ok) {
    logEvent('warn', 'room.join.invalid_auth', {
      roomId,
      sessionId,
      reason: authResult.message,
    });
    send(socket, { type: 'error', code: 'invalid_auth', message: authResult.message });
    return;
  }

  const userId = authResult.userId ?? `guest:${sessionId}`;
  const participants = ensureRoomParticipants(roomId);
  if (!participants.has(sessionId) && participants.size >= MAX_ROOM_SIZE) {
    logEvent('warn', 'room.join.full', {
      roomId,
      sessionId,
      userId,
      participantCount: participants.size,
      maxRoomSize: MAX_ROOM_SIZE,
    });
    send(socket, { type: 'error', code: 'room_full', message: `Room ${roomId} is full.` });
    return;
  }

  let authority = await hydrateRoomAuthority(roomId);
  if (!authority.ownerUserId && !authority.roomRecordId && authResult.userId) {
    authority.ownerUserId = authResult.userId;
    authority = await persistRoomAuthority(roomId, { maxUsers: MAX_ROOM_SIZE });
  } else if (authority.ownerUserId === authResult.userId && !authority.roomRecordId && authResult.userId) {
    authority = await persistRoomAuthority(roomId, { maxUsers: MAX_ROOM_SIZE });
  }

  const selfRole = resolveRole(userId, authority);
  if (authority.isLocked && selfRole === 'member') {
    logEvent('warn', 'room.join.locked', {
      roomId,
      sessionId,
      userId,
      selfRole,
    });
    send(socket, { type: 'error', code: 'room_locked', message: `Room ${roomId} is locked.` });
    return;
  }

  const sockets = ensureRoomSockets(roomId);
  const seats = ensureRoomSeats(roomId);
  const objects = ensureRoomObjects(roomId);
  const surfaces = await ensureRoomSurfaces(roomId);
  const tvMedia = roomTvMedia.get(roomId) ?? null;
  const spawn = selectSpawnPoint(participants);
  const participant = {
    sessionId,
    userId,
    displayName,
    roomId,
    transform: spawn.transform,
    isSitting: false,
    seatId: null,
    heldObjectId: null,
    avatarStyle: avatarStyle ?? null,
    spawnId: spawn.spawnId,
    updatedAt: Date.now(),
  };

  socket.roomId = roomId;
  socket.sessionId = sessionId;
  socket.userId = userId;
  participants.set(sessionId, participant);
  sockets.set(sessionId, socket);
  logEvent('info', 'room.join.success', {
    roomId,
    sessionId,
    userId,
    displayName,
    selfRole,
    isAuthenticated: Boolean(authResult.userId),
    participantCount: participants.size,
    ownerUserId: authority.ownerUserId,
    isLocked: authority.isLocked,
  });

  send(socket, {
    type: 'room.joined',
    roomId,
    isPersisted: Boolean(authority.roomRecordId),
    selfSessionId: sessionId,
    participants: Array.from(participants.values()),
    seats,
    objects,
    surfaces,
    tvMedia,
    authority: serializeAuthority(authority),
    selfRole,
    recentMessages: roomMessages.get(roomId) ?? [],
    serverTime: Date.now(),
  });
  broadcast(roomId, { type: 'participant.joined', participant }, sessionId);
  broadcastAuthorityUpdate(roomId);

  if (authority.ownerUserId === userId && participants.size === 1) {
    pushSystemNotice(roomId, `${displayName} claimed ownership of room ${roomId}.`);
  }
}

function selectSpawnPoint(participants) {
  if (SPAWN_POINTS.length === 0) {
    return {
      spawnId: 'default',
      transform: { position: { x: 0, y: DEFAULT_EYE_HEIGHT, z: 0 }, rotation: { yaw: 0, pitch: 0 } },
    };
  }

  const usedSpawnIds = new Set(Array.from(participants.values()).map((participant) => participant.spawnId).filter(Boolean));
  const availableSpawn = SPAWN_POINTS.find((spawn) => !usedSpawnIds.has(spawn.spawnId)) ?? SPAWN_POINTS[participants.size % SPAWN_POINTS.length];
  return availableSpawn;
}

function handlePresenceUpdate(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  if (!roomId || !sessionId) return;

  const participants = roomParticipants.get(roomId);
  const participant = participants?.get(sessionId);
  if (!participant) return;

  if (!isVec3(message.transform?.position) || !isRotation(message.transform?.rotation)) {
    send(socket, { type: 'error', code: 'invalid_transform', message: 'Invalid presence transform payload.' });
    return;
  }

  const updated = {
    ...participant,
    transform: message.transform,
    isSitting: Boolean(message.isSitting),
    seatId: typeof message.seatId === 'string' ? message.seatId : null,
    heldObjectId: typeof message.heldObjectId === 'string' ? message.heldObjectId : null,
    updatedAt: Date.now(),
  };

  participants.set(sessionId, updated);
  broadcast(roomId, { type: 'participant.updated', participant: updated }, sessionId);
}

function handleChatSend(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  if (!roomId || !sessionId) return;

  const body = typeof message.body === 'string' ? message.body.trim() : '';
  if (!body || body.length > MAX_CHAT_LENGTH) {
    logEvent('warn', 'chat.invalid', {
      roomId,
      sessionId,
      length: body.length,
    });
    send(socket, { type: 'error', code: 'invalid_chat', message: `Chat messages must be 1-${MAX_CHAT_LENGTH} characters.` });
    return;
  }

  if (!checkChatRateLimit(sessionId)) {
    logEvent('warn', 'chat.rate_limited', {
      roomId,
      sessionId,
    });
    send(socket, { type: 'error', code: 'chat_rate_limited', message: 'You are sending messages too quickly.' });
    return;
  }

  const participants = roomParticipants.get(roomId);
  const participant = participants?.get(sessionId);
  if (!participant) return;

  const authority = ensureRoomAuthority(roomId);
  if (authority.mutedUserIds.includes(participant.userId)) {
    logEvent('warn', 'chat.muted', {
      roomId,
      sessionId,
      userId: participant.userId,
    });
    send(socket, { type: 'error', code: 'user_muted', message: 'You are muted in this room.' });
    return;
  }

  const chatMessage = {
    id: typeof message.clientMessageId === 'string' ? message.clientMessageId : `${sessionId}-${Date.now()}`,
    roomId,
    userId: participant.userId,
    displayName: participant.displayName,
    body,
    createdAt: new Date().toISOString(),
  };

  const messages = roomMessages.get(roomId) ?? [];
  messages.push(chatMessage);
  roomMessages.set(roomId, messages.slice(-50));
  logEvent('debug', 'chat.sent', {
    roomId,
    sessionId,
    userId: participant.userId,
    messageId: chatMessage.id,
    length: body.length,
  });
  broadcast(roomId, { type: 'chat.received', message: chatMessage });
}

function handleSeatClaim(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  const seatId = normalizeToken(message.seatId, MAX_SEAT_ID_LENGTH);
  if (!roomId || !sessionId || !seatId) return;

  const participants = roomParticipants.get(roomId);
  const participant = participants?.get(sessionId);
  if (!participant) return;

  const seats = ensureRoomSeats(roomId);
  const requestedSeat = ensureSeatState(seats, seatId);
  if (requestedSeat.occupiedBySessionId && requestedSeat.occupiedBySessionId !== sessionId) {
    send(socket, { type: 'error', code: 'seat_occupied', message: `Seat ${seatId} is already occupied.` });
    return;
  }

  const currentlyOccupied = seats.find((seat) => seat.occupiedBySessionId === sessionId);
  if (currentlyOccupied && currentlyOccupied.seatId !== seatId) {
    currentlyOccupied.occupiedBySessionId = null;
    currentlyOccupied.updatedAt = Date.now();
    broadcast(roomId, { type: 'seat.updated', seat: { ...currentlyOccupied } });
  }

  requestedSeat.occupiedBySessionId = sessionId;
  requestedSeat.updatedAt = Date.now();
  participant.isSitting = true;
  participant.seatId = seatId;
  participant.updatedAt = Date.now();
  broadcast(roomId, { type: 'seat.updated', seat: { ...requestedSeat } });
  broadcast(roomId, { type: 'participant.updated', participant: { ...participant } });
}

function handleSeatRelease(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  const seatId = normalizeToken(message.seatId, MAX_SEAT_ID_LENGTH);
  if (!roomId || !sessionId || !seatId) return;

  const participants = roomParticipants.get(roomId);
  const participant = participants?.get(sessionId);
  if (!participant) return;

  const seats = ensureRoomSeats(roomId);
  const seat = ensureSeatState(seats, seatId);
  if (seat.occupiedBySessionId !== sessionId) {
    send(socket, { type: 'error', code: 'seat_not_owned', message: `Seat ${seatId} is not owned by this session.` });
    return;
  }

  seat.occupiedBySessionId = null;
  seat.updatedAt = Date.now();
  participant.isSitting = false;
  participant.seatId = null;
  participant.updatedAt = Date.now();
  broadcast(roomId, { type: 'seat.updated', seat: { ...seat } });
  broadcast(roomId, { type: 'participant.updated', participant: { ...participant } });
}

function handleObjectClaim(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  const objectId = normalizeToken(message.objectId, MAX_OBJECT_ID_LENGTH);
  if (!roomId || !sessionId || !objectId) return;

  const participants = roomParticipants.get(roomId);
  const participant = participants?.get(sessionId);
  if (!participant) return;

  const objects = ensureRoomObjects(roomId);
  const object = ensureObjectState(objects, objectId);
  if (object.ownerSessionId && object.ownerSessionId !== sessionId) {
    send(socket, { type: 'error', code: 'object_claimed', message: `Object ${objectId} is already held.` });
    return;
  }

  const currentlyHeld = objects.find((entry) => entry.ownerSessionId === sessionId);
  if (currentlyHeld && currentlyHeld.objectId !== objectId) {
    currentlyHeld.ownerSessionId = null;
    currentlyHeld.updatedAt = Date.now();
    broadcast(roomId, { type: 'object.updated', object: { ...currentlyHeld } });
  }

  object.ownerSessionId = sessionId;
  object.updatedAt = Date.now();
  participant.heldObjectId = objectId;
  participant.updatedAt = Date.now();
  broadcast(roomId, { type: 'object.updated', object: { ...object } });
  broadcast(roomId, { type: 'participant.updated', participant: { ...participant } });
}

function handleObjectRelease(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  const objectId = normalizeToken(message.objectId, MAX_OBJECT_ID_LENGTH);
  if (!roomId || !sessionId || !objectId) return;

  if (!isVec3(message.transform?.position) || !nullableRotation(message.transform?.rotation)) {
    send(socket, { type: 'error', code: 'invalid_object_transform', message: 'Invalid object transform payload.' });
    return;
  }

  const participants = roomParticipants.get(roomId);
  const participant = participants?.get(sessionId);
  if (!participant) return;

  const objects = ensureRoomObjects(roomId);
  const object = ensureObjectState(objects, objectId);
  if (object.ownerSessionId !== sessionId) {
    send(socket, { type: 'error', code: 'object_not_owned', message: `Object ${objectId} is not owned by this session.` });
    return;
  }

  object.ownerSessionId = null;
  object.position = message.transform.position;
  object.rotation = message.transform.rotation;
  object.updatedAt = Date.now();
  participant.heldObjectId = null;
  participant.updatedAt = Date.now();
  broadcast(roomId, { type: 'object.updated', object: { ...object } });
  broadcast(roomId, { type: 'participant.updated', participant: { ...participant } });
}
function handleAdminKick(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  const targetSessionId = normalizeToken(message.targetSessionId, 128);
  if (!roomId || !sessionId || !targetSessionId) {
    return;
  }

  const actor = getParticipant(roomId, sessionId);
  const target = getParticipant(roomId, targetSessionId);
  if (!actor || !target) {
    return;
  }

  const authorization = authorizeModerator(roomId, actor.userId, target.userId, { ownerOnly: false });
  if (!authorization.ok) {
    logEvent('warn', 'moderation.kick.denied', {
      roomId,
      actorUserId: actor.userId,
      targetUserId: target.userId,
      reason: authorization.message,
    });
    send(socket, { type: 'error', code: 'forbidden', message: authorization.message });
    return;
  }

  const targetSocket = roomSockets.get(roomId)?.get(targetSessionId);
  if (!targetSocket) {
    return;
  }

  send(targetSocket, { type: 'error', code: 'kicked', message: `You were removed from ${roomId}.` });
  targetSocket.close(4001, 'room_kicked');
  logEvent('info', 'moderation.kick', {
    roomId,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    targetUserId: target.userId,
    targetDisplayName: target.displayName,
  });
  pushSystemNotice(roomId, `${target.displayName} was removed by ${actor.displayName}.`);
}

async function handleAdminSetRole(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  const targetUserId = normalizeToken(message.targetUserId, 128);
  const role = message.role === 'admin' ? 'admin' : message.role === 'member' ? 'member' : null;
  if (!roomId || !sessionId || !targetUserId || !role) {
    return;
  }

  const actor = getParticipant(roomId, sessionId);
  if (!actor) {
    return;
  }

  const authorization = authorizeModerator(roomId, actor.userId, targetUserId, { ownerOnly: true });
  if (!authorization.ok) {
    logEvent('warn', 'moderation.role.denied', {
      roomId,
      actorUserId: actor.userId,
      targetUserId,
      role,
      reason: authorization.message,
    });
    send(socket, { type: 'error', code: 'forbidden', message: authorization.message });
    return;
  }

  const authority = ensureRoomAuthority(roomId);
  if (authority.ownerUserId === targetUserId) {
    send(socket, { type: 'error', code: 'forbidden', message: 'Owner role cannot be changed.' });
    return;
  }

  const nextAdmins = new Set(authority.adminUserIds);
  if (role === 'admin') {
    nextAdmins.add(targetUserId);
  } else {
    nextAdmins.delete(targetUserId);
  }
  authority.adminUserIds = Array.from(nextAdmins);
  await persistRoomAuthority(roomId, { maxUsers: MAX_ROOM_SIZE });
  logEvent('info', 'moderation.role.updated', {
    roomId,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    targetUserId,
    role,
    adminCount: authority.adminUserIds.length,
  });
  broadcastAuthorityUpdate(roomId);
  pushSystemNotice(roomId, `${actor.displayName} ${role === 'admin' ? 'granted' : 'removed'} admin access.`);
}

async function handleAdminSetMute(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  const targetUserId = normalizeToken(message.targetUserId, 128);
  if (!roomId || !sessionId || !targetUserId || typeof message.muted !== 'boolean') {
    return;
  }

  const actor = getParticipant(roomId, sessionId);
  if (!actor) {
    return;
  }

  const authorization = authorizeModerator(roomId, actor.userId, targetUserId, { ownerOnly: false });
  if (!authorization.ok) {
    logEvent('warn', 'moderation.mute.denied', {
      roomId,
      actorUserId: actor.userId,
      targetUserId,
      muted: message.muted,
      reason: authorization.message,
    });
    send(socket, { type: 'error', code: 'forbidden', message: authorization.message });
    return;
  }

  const authority = ensureRoomAuthority(roomId);
  const nextMuted = new Set(authority.mutedUserIds);
  if (message.muted) {
    nextMuted.add(targetUserId);
  } else {
    nextMuted.delete(targetUserId);
  }
  authority.mutedUserIds = Array.from(nextMuted);
  await persistRoomAuthority(roomId, { maxUsers: MAX_ROOM_SIZE });
  logEvent('info', 'moderation.mute.updated', {
    roomId,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    targetUserId,
    muted: message.muted,
    mutedCount: authority.mutedUserIds.length,
  });
  broadcastAuthorityUpdate(roomId);

  const affectedParticipant = Array.from(roomParticipants.get(roomId)?.values() ?? []).find((participant) => participant.userId === targetUserId);
  const actorLabel = actor.displayName;
  const targetLabel = affectedParticipant?.displayName ?? 'A user';
  pushSystemNotice(roomId, `${targetLabel} was ${message.muted ? 'muted' : 'unmuted'} by ${actorLabel}.`);
}

async function handleAdminSetRoomLock(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  if (!roomId || !sessionId || typeof message.locked !== 'boolean') {
    return;
  }

  const actor = getParticipant(roomId, sessionId);
  if (!actor) {
    return;
  }

  const authorization = authorizeModerator(roomId, actor.userId, actor.userId, { ownerOnly: true });
  if (!authorization.ok) {
    logEvent('warn', 'moderation.lock.denied', {
      roomId,
      actorUserId: actor.userId,
      locked: message.locked,
      reason: authorization.message,
    });
    send(socket, { type: 'error', code: 'forbidden', message: authorization.message });
    return;
  }

  const authority = ensureRoomAuthority(roomId);
  authority.isLocked = message.locked;
  await persistRoomAuthority(roomId, { maxUsers: MAX_ROOM_SIZE });
  logEvent('info', 'moderation.lock.updated', {
    roomId,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    locked: message.locked,
  });
  broadcastAuthorityUpdate(roomId);
  pushSystemNotice(roomId, `${actor.displayName} ${message.locked ? 'locked' : 'unlocked'} the room.`);
}

async function handleAdminSetSurfaceImage(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  const surfaceId = normalizeSurfaceId(message.surfaceId);
  const imagePath = typeof message.imagePath === 'string' && message.imagePath.trim()
    ? normalizeToken(message.imagePath, MAX_SURFACE_IMAGE_PATH_LENGTH)
    : null;
  const assetId = normalizeToken(message.assetId, MAX_MEDIA_ASSET_ID_LENGTH);
  if (!roomId || !sessionId || !surfaceId) {
    return;
  }

  const actor = getParticipant(roomId, sessionId);
  if (!actor?.userId) {
    send(socket, { type: 'error', code: 'forbidden', message: 'You must be signed in to update room surfaces.' });
    return;
  }

  const actorRole = resolveRole(actor.userId, ensureRoomAuthority(roomId));
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    logEvent('warn', 'surface.update.denied', {
      roomId,
      actorUserId: actor.userId,
      surfaceId,
      reason: 'insufficient_role',
    });
    send(socket, { type: 'error', code: 'forbidden', message: 'Only the room owner or admins can update shared surfaces.' });
    return;
  }

  if (!imagePath) {
    await clearRoomSurfaceReference(roomId, surfaceId, {
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      assetId,
      reason: 'surface_cleared_by_admin',
    });
    pushSystemNotice(roomId, `${actor.displayName} cleared ${surfaceId}.`);
    return;
  }

  const mediaAsset = await resolveRoomMediaAssetForUse({
    roomId,
    kind: 'surface-image',
    assetId,
    storageKey: imagePath,
  });
  if (!mediaAsset) {
    send(socket, { type: 'error', code: 'invalid_surface_asset', message: 'That room image is unavailable.' });
    return;
  }

  const surface = {
    surfaceId,
    imagePath,
    updatedByUserId: actor.userId,
    updatedAt: new Date().toISOString(),
  };

  const surfaces = await ensureRoomSurfaces(roomId);
  const previousSurface = surfaces.find((entry) => entry.surfaceId === surfaceId) ?? null;
  const nextSurface = await persistRoomSurface(roomId, surface);
  const index = surfaces.findIndex((entry) => entry.surfaceId === surfaceId);
  if (index >= 0) {
    surfaces[index] = nextSurface;
  } else {
    surfaces.push(nextSurface);
  }

  logEvent('info', 'surface.update', {
    roomId,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    surfaceId,
    imagePath,
    assetId: mediaAsset.id,
  });
  await markRoomMediaSurfaceUsage(roomId, surfaceId, previousSurface?.imagePath ?? null, mediaAsset);
  broadcast(roomId, { type: 'surface.updated', surface: nextSurface });
  pushSystemNotice(roomId, `${actor.displayName} updated ${surfaceId}.`);
}

async function handleAdminSetTvMedia(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  if (!roomId || !sessionId) {
    return;
  }

  const actor = getParticipant(roomId, sessionId);
  if (!actor?.userId) {
    send(socket, { type: 'error', code: 'forbidden', message: 'You must be signed in to update the shared TV.' });
    return;
  }

  const authority = ensureRoomAuthority(roomId);
  const actorRole = resolveRole(actor.userId, authority);
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    send(socket, { type: 'error', code: 'forbidden', message: 'Only owner/admin can control the shared TV.' });
    return;
  }

  if (!authority.roomRecordId) {
    send(socket, { type: 'error', code: 'room_not_persisted', message: 'Shared TV is available only in saved rooms.' });
    return;
  }

  const sourceUrl = typeof message.sourceUrl === 'string' && message.sourceUrl.trim()
    ? normalizeToken(message.sourceUrl, 512)
    : null;
  const assetId = typeof message.assetId === 'string' && message.assetId.trim()
    ? normalizeToken(message.assetId, MAX_MEDIA_ASSET_ID_LENGTH)
    : null;
  if (message.sourceUrl && !sourceUrl) {
    send(socket, { type: 'error', code: 'invalid_tv_source', message: 'TV source URL is invalid.' });
    return;
  }
  let mediaAsset = null;
  if (sourceUrl) {
    mediaAsset = await resolveRoomMediaAssetForUse({
      roomId,
      kind: 'tv-video',
      assetId,
      storageKey: sourceUrl,
    });
    if (!mediaAsset) {
      send(socket, { type: 'error', code: 'invalid_tv_asset', message: 'That shared TV video is unavailable.' });
      return;
    }
  }

  const previousTvMedia = roomTvMedia.get(roomId) ?? null;
  const tvMedia = sourceUrl
    ? {
        sourceUrl,
        isPlaying: true,
        currentTime: 0,
        updatedByUserId: actor.userId,
        updatedAt: new Date().toISOString(),
      }
    : null;

  if (tvMedia) {
    roomTvMedia.set(roomId, tvMedia);
  } else {
    roomTvMedia.delete(roomId);
  }

  logEvent('info', 'tv.updated', {
    roomId,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    sourceUrl,
    assetId: mediaAsset?.id ?? null,
  });
  await markRoomMediaTvUsage(roomId, previousTvMedia?.sourceUrl ?? null, mediaAsset);
  broadcast(roomId, { type: 'tv.updated', tvMedia });
  pushSystemNotice(roomId, sourceUrl ? `${actor.displayName} updated the shared TV.` : `${actor.displayName} restored the TV visualizer.`);
}

async function handleAdminSetTvPlayback(socket, message) {
  const roomId = getSocketRoomId(socket, message.roomId);
  const sessionId = getSocketSessionId(socket, message.sessionId);
  if (!roomId || !sessionId) {
    return;
  }

  const actor = getParticipant(roomId, sessionId);
  if (!actor?.userId) {
    send(socket, { type: 'error', code: 'forbidden', message: 'You must be signed in to update shared TV playback.' });
    return;
  }

  const authority = ensureRoomAuthority(roomId);
  const actorRole = resolveRole(actor.userId, authority);
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    send(socket, { type: 'error', code: 'forbidden', message: 'Only owner/admin can control shared TV playback.' });
    return;
  }

  const existing = roomTvMedia.get(roomId);
  if (!existing) {
    send(socket, { type: 'error', code: 'tv_not_set', message: 'Set a shared TV source before controlling playback.' });
    return;
  }

  const currentTime = Number(message.currentTime);
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    send(socket, { type: 'error', code: 'invalid_tv_time', message: 'Playback time must be a positive number.' });
    return;
  }

  const tvMedia = {
    ...existing,
    isPlaying: Boolean(message.isPlaying),
    currentTime,
    updatedByUserId: actor.userId,
    updatedAt: new Date().toISOString(),
  };
  roomTvMedia.set(roomId, tvMedia);

  logEvent('info', 'tv.playback.updated', {
    roomId,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    isPlaying: tvMedia.isPlaying,
    currentTime: tvMedia.currentTime,
  });
  broadcast(roomId, { type: 'tv.updated', tvMedia });
}

function cleanupSocket(socket, roomId = socket.roomId, sessionId = socket.sessionId) {
  if (!roomId || !sessionId) return;

  const participants = roomParticipants.get(roomId);
  const participant = participants?.get(sessionId);
  if (participant?.seatId) {
    const seats = ensureRoomSeats(roomId);
    const seat = ensureSeatState(seats, participant.seatId);
    seat.occupiedBySessionId = null;
    seat.updatedAt = Date.now();
    broadcast(roomId, { type: 'seat.updated', seat: { ...seat } }, sessionId);
  }
  if (participant?.heldObjectId) {
    const objects = ensureRoomObjects(roomId);
    const object = ensureObjectState(objects, participant.heldObjectId);
    object.ownerSessionId = null;
    object.updatedAt = Date.now();
    broadcast(roomId, { type: 'object.updated', object: { ...object } }, sessionId);
  }

  participants?.delete(sessionId);
  const remainingParticipants = participants?.size ?? 0;
  if (participants && participants.size === 0) roomParticipants.delete(roomId);
  const sockets = roomSockets.get(roomId);
  sockets?.delete(sessionId);
  if (sockets && sockets.size === 0) roomSockets.delete(roomId);
  chatRateLimits.delete(sessionId);
  broadcast(roomId, { type: 'participant.left', sessionId }, sessionId);
  broadcastAuthorityUpdate(roomId);
  logEvent('info', 'room.leave', {
    roomId,
    sessionId,
    userId: socket.userId ?? null,
    displayName: participant?.displayName ?? null,
    remainingParticipants,
  });
}

function ensureRoomParticipants(roomId) {
  const existing = roomParticipants.get(roomId);
  if (existing) return existing;
  const created = new Map();
  roomParticipants.set(roomId, created);
  return created;
}

async function handleDeleteRoomRequest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const roomId = normalizeToken(payload?.roomId, MAX_ROOM_ID_LENGTH);
    if (!roomId) {
      writeJson(response, 400, { error: 'invalid_room', message: 'A valid roomId is required.' });
      return;
    }

    const authorizationHeader = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
    const token = authorizationHeader.startsWith('Bearer ') ? authorizationHeader.slice(7).trim() : '';
    const authResult = await verifyAuthToken(token);
    if (!authResult.ok || !authResult.userId) {
      writeJson(response, 401, { error: 'unauthorized', message: authResult.message ?? 'Authentication is required.' });
      return;
    }

    const authority = await hydrateRoomAuthority(roomId);
    if (!authority.roomRecordId) {
      writeJson(response, 404, { error: 'room_not_persisted', message: 'Only saved rooms can be deleted.' });
      return;
    }

    if (authority.ownerUserId !== authResult.userId) {
      writeJson(response, 403, { error: 'forbidden', message: 'Only the room owner can delete this room.' });
      return;
    }

    const participants = roomParticipants.get(roomId);
    if (participants && participants.size > 0) {
      writeJson(response, 409, { error: 'room_live', message: 'Live rooms cannot be deleted.' });
      return;
    }

    await deleteSurfaceSnapshotsFromBackend(roomId);
    await deleteRoomMediaAssetsFromBackend(roomId);
    await cleanupManagedMediaPrefix(`room-surfaces/${roomId}/`, { roomId, reason: 'room_deleted_surfaces' });
    await cleanupManagedMediaPrefix(`room-tv/${roomId}/`, { roomId, reason: 'room_deleted_tv' });
    const deleted = await deleteRoomFromBackend(roomId, authority.roomRecordId);
    if (!deleted) {
      writeJson(response, 500, { error: 'delete_failed', message: 'Unable to delete the saved room.' });
      return;
    }

    roomAuthorities.delete(roomId);
    persistFallbackAuthorityStore(roomAuthorities);
    roomParticipants.delete(roomId);
    roomSockets.delete(roomId);
    roomMessages.delete(roomId);
    roomSeats.delete(roomId);
    roomObjects.delete(roomId);
    roomSurfaces.delete(roomId);
    roomTvMedia.delete(roomId);
    hydratedSurfaceRooms.delete(roomId);

    logEvent('info', 'room.deleted', {
      roomId,
      ownerUserId: authResult.userId,
    });
    writeJson(response, 200, { ok: true });
  } catch (error) {
    logEvent('error', 'room.delete.failed', {
      error: formatErrorForLog(error),
    });
    writeJson(response, 500, { error: 'delete_failed', message: 'Unable to delete the saved room right now.' });
  }
}

async function handleAuthorizeSurfaceUploadRequest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const roomId = normalizeToken(payload?.roomId, MAX_ROOM_ID_LENGTH);
    const fileName = normalizeUploadFileName(payload?.fileName);
    const contentType = normalizeToken(payload?.contentType, MAX_UPLOAD_CONTENT_TYPE_LENGTH);
    const contentLength = normalizeUploadContentLength(payload?.contentLength);
    const checksum = normalizeMediaChecksum(payload?.checksum);

    if (!roomId) {
      writeJson(response, 400, { error: 'invalid_room', message: 'A valid roomId is required.' });
      return;
    }
    if (!fileName) {
      writeJson(response, 400, { error: 'invalid_file_name', message: 'A valid fileName is required.' });
      return;
    }
    if (!contentType || !ALLOWED_SURFACE_IMAGE_TYPES.has(contentType)) {
      writeJson(response, 400, { error: 'invalid_content_type', message: 'Only PNG, JPG, or WebP images are supported.' });
      return;
    }
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      writeJson(response, 400, { error: 'invalid_content_length', message: 'A valid contentLength is required.' });
      return;
    }
    if (!checksum) {
      writeJson(response, 400, { error: 'invalid_checksum', message: 'A valid media checksum is required.' });
      return;
    }
    if (contentLength > MAX_SURFACE_IMAGE_BYTES) {
      writeJson(response, 400, { error: 'file_too_large', message: 'Images must be 10MB or smaller.' });
      return;
    }

    const authorization = await authorizeProtectedMediaUpload(request, {
      roomId,
      kind: 'surface-image',
      contentType,
      contentLength,
      fileName,
      checksum,
    });
    if (!authorization.ok) {
      writeJson(response, authorization.statusCode, { error: authorization.error, message: authorization.message });
      return;
    }

    writeJson(response, 200, authorization.payload);
  } catch (error) {
    logEvent('error', 'media.surface.authorize.failed', {
      error: formatErrorForLog(error),
    });
    writeJson(response, 500, { error: 'upload_authorize_failed', message: 'Unable to authorize the shared surface upload right now.' });
  }
}

async function handleAuthorizeTvUploadRequest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const roomId = normalizeToken(payload?.roomId, MAX_ROOM_ID_LENGTH);
    const fileName = normalizeUploadFileName(payload?.fileName);
    const contentType = normalizeToken(payload?.contentType, MAX_UPLOAD_CONTENT_TYPE_LENGTH);
    const contentLength = normalizeUploadContentLength(payload?.contentLength);
    const checksum = normalizeMediaChecksum(payload?.checksum);

    if (!roomId) {
      writeJson(response, 400, { error: 'invalid_room', message: 'A valid roomId is required.' });
      return;
    }
    if (!fileName) {
      writeJson(response, 400, { error: 'invalid_file_name', message: 'A valid fileName is required.' });
      return;
    }
    if (!contentType || !ALLOWED_TV_VIDEO_TYPES.has(contentType)) {
      writeJson(response, 400, { error: 'invalid_content_type', message: 'Only MP4 videos are supported right now.' });
      return;
    }
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      writeJson(response, 400, { error: 'invalid_content_length', message: 'A valid contentLength is required.' });
      return;
    }
    if (!checksum) {
      writeJson(response, 400, { error: 'invalid_checksum', message: 'A valid media checksum is required.' });
      return;
    }
    if (contentLength > MAX_TV_VIDEO_BYTES) {
      writeJson(response, 400, { error: 'file_too_large', message: 'Videos must be 100MB or smaller right now.' });
      return;
    }

    const authorization = await authorizeProtectedMediaUpload(request, {
      roomId,
      kind: 'tv-video',
      contentType,
      contentLength,
      fileName,
      checksum,
    });
    if (!authorization.ok) {
      writeJson(response, authorization.statusCode, { error: authorization.error, message: authorization.message });
      return;
    }

    writeJson(response, 200, authorization.payload);
  } catch (error) {
    logEvent('error', 'media.tv.authorize.failed', {
      error: formatErrorForLog(error),
    });
    writeJson(response, 500, { error: 'upload_authorize_failed', message: 'Unable to authorize the shared TV upload right now.' });
  }
}

async function authorizeProtectedMediaUpload(request, options) {
  if (!storageClient || !STORAGE_BUCKET_NAME) {
    return {
      ok: false,
      statusCode: 503,
      error: 'storage_not_configured',
      message: 'Protected media uploads are not configured on the server.',
    };
  }

  const managerResult = await authenticateMediaManagerRequest(request, options.roomId, 'upload shared media');
  if (!managerResult.ok) {
    return managerResult;
  }

  const usage = await listRoomMediaUsage(options.roomId);
  if (usage.bytesUsed + options.contentLength > MAX_ROOM_MEDIA_BYTES) {
    return {
      ok: false,
      statusCode: 409,
      error: 'room_media_quota_exceeded',
      message: `This upload would exceed the room's ${formatBytesForMessage(MAX_ROOM_MEDIA_BYTES)} storage limit.`,
    };
  }

  const existingAsset = await findRecentRoomMediaAssetByChecksum(options.roomId, options.kind, options.checksum);
  if (existingAsset) {
    return {
      ok: true,
      payload: {
        ok: true,
        mode: 'reuse',
        asset: serializeRoomMediaAsset(existingAsset),
        usage: serializeRoomMediaUsage(usage),
      },
    };
  }

  pruneExpiredUploadIntents();
  enforceUploadIntentQuota(managerResult.userId);

  const objectKey = buildProtectedMediaObjectKey(options);
  const uploadIntent = await createProtectedMediaUploadIntent({
    roomId: options.roomId,
    userId: managerResult.userId,
    actorRole: managerResult.actorRole,
    kind: options.kind,
    surfaceId: options.surfaceId ?? null,
    fileName: options.fileName,
    contentType: options.contentType,
    contentLength: options.contentLength,
    objectKey,
    checksum: options.checksum,
  });

  logEvent('info', 'media.upload.authorized', {
    roomId: options.roomId,
    userId: managerResult.userId,
    actorRole: managerResult.actorRole,
    kind: options.kind,
    surfaceId: options.surfaceId ?? null,
    objectKey,
    expiresAt: uploadIntent.expiresAt,
  });

  return {
    ok: true,
    payload: {
      ok: true,
      mode: 'upload',
      upload: {
        uploadId: uploadIntent.uploadId,
        roomId: uploadIntent.roomId,
        kind: uploadIntent.kind,
        surfaceId: uploadIntent.surfaceId,
        objectKey: uploadIntent.objectKey,
        contentType: uploadIntent.contentType,
        contentLength: uploadIntent.contentLength,
        expiresAt: uploadIntent.expiresAt,
        uploadUrl: uploadIntent.uploadUrl,
        uploadHeaders: {
          'content-type': uploadIntent.contentType,
        },
      },
      usage: serializeRoomMediaUsage(usage),
    },
  };
}

async function createProtectedMediaUploadIntent(options) {
  const uploadId = randomUUID();
  const expiresAtMs = Date.now() + MEDIA_UPLOAD_INTENT_TTL_MS;
  const uploadUrl = await createPresignedStoragePutUrl(options.objectKey, options.contentType, Math.max(30, Math.floor(MEDIA_UPLOAD_INTENT_TTL_MS / 1000)));
  const intent = {
    uploadId,
    roomId: options.roomId,
    userId: options.userId,
    actorRole: options.actorRole,
    kind: options.kind,
    surfaceId: options.surfaceId,
    fileName: options.fileName,
    contentType: options.contentType,
    contentLength: options.contentLength,
    checksum: options.checksum,
    objectKey: options.objectKey,
    uploadUrl,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    createdAt: new Date().toISOString(),
    usedAt: null,
  };
  mediaUploadIntents.set(uploadId, intent);
  return intent;
}

async function handleFinalizeMediaUploadRequest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const roomId = normalizeToken(payload?.roomId, MAX_ROOM_ID_LENGTH);
    const uploadId = normalizeToken(payload?.uploadId, MAX_MEDIA_ASSET_ID_LENGTH);

    if (!roomId) {
      writeJson(response, 400, { error: 'invalid_room', message: 'A valid roomId is required.' });
      return;
    }
    if (!uploadId) {
      writeJson(response, 400, { error: 'invalid_upload', message: 'A valid uploadId is required.' });
      return;
    }

    const managerResult = await authenticateMediaManagerRequest(request, roomId, 'finalize shared media upload');
    if (!managerResult.ok) {
      writeJson(response, managerResult.statusCode, { error: managerResult.error, message: managerResult.message });
      return;
    }

    const finalizeResult = await finalizeProtectedMediaUpload(roomId, uploadId, managerResult.userId);
    if (!finalizeResult.ok) {
      writeJson(response, finalizeResult.statusCode, { error: finalizeResult.error, message: finalizeResult.message });
      return;
    }

    writeJson(response, 200, {
      ok: true,
      asset: serializeRoomMediaAsset(finalizeResult.asset),
      usage: serializeRoomMediaUsage(finalizeResult.usage),
    });
  } catch (error) {
    logEvent('error', 'media.upload.finalize.failed', {
      error: formatErrorForLog(error),
    });
    writeJson(response, 500, { error: 'upload_finalize_failed', message: 'Unable to finalize the shared media upload right now.' });
  }
}

async function handleListRoomMediaRequest(request, response) {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const roomId = normalizeToken(url.searchParams.get('roomId'), MAX_ROOM_ID_LENGTH);
    const kind = normalizeRoomMediaKind(url.searchParams.get('kind'));
    if (!roomId) {
      writeJson(response, 400, { error: 'invalid_room', message: 'A valid roomId is required.' });
      return;
    }

    const managerResult = await authenticateMediaManagerRequest(request, roomId, 'list room media');
    if (!managerResult.ok) {
      writeJson(response, managerResult.statusCode, { error: managerResult.error, message: managerResult.message });
      return;
    }

    const assets = await listRoomMediaAssetsFromBackend(roomId, kind);
    const usage = summarizeRoomMediaUsage(assets);
    writeJson(response, 200, {
      ok: true,
      assets: assets.map((asset) => serializeRoomMediaAsset(asset)),
      usage: serializeRoomMediaUsage(usage),
    });
  } catch (error) {
    logEvent('error', 'media.list.failed', {
      error: formatErrorForLog(error),
    });
    writeJson(response, 500, { error: 'media_list_failed', message: 'Unable to load room media right now.' });
  }
}

async function handleDeleteRoomMediaRequest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const roomId = normalizeToken(payload?.roomId, MAX_ROOM_ID_LENGTH);
    const assetId = normalizeToken(payload?.assetId, MAX_MEDIA_ASSET_ID_LENGTH);
    if (!roomId) {
      writeJson(response, 400, { error: 'invalid_room', message: 'A valid roomId is required.' });
      return;
    }
    if (!assetId) {
      writeJson(response, 400, { error: 'invalid_asset', message: 'A valid assetId is required.' });
      return;
    }

    const managerResult = await authenticateMediaManagerRequest(request, roomId, 'delete room media');
    if (!managerResult.ok) {
      writeJson(response, managerResult.statusCode, { error: managerResult.error, message: managerResult.message });
      return;
    }

    const deleteResult = await deleteRoomMediaAssetForRoom(roomId, assetId, managerResult.userId);
    if (!deleteResult.ok) {
      writeJson(response, deleteResult.statusCode, { error: deleteResult.error, message: deleteResult.message });
      return;
    }

    writeJson(response, 200, {
      ok: true,
      usage: serializeRoomMediaUsage(deleteResult.usage),
    });
  } catch (error) {
    logEvent('error', 'media.delete.failed', {
      error: formatErrorForLog(error),
    });
    writeJson(response, 500, { error: 'media_delete_failed', message: 'Unable to delete room media right now.' });
  }
}

async function authenticateMediaManagerRequest(request, roomId, actionLabel) {
  const token = getBearerToken(request);
  const authResult = await verifyAuthToken(token);
  if (!authResult.ok || !authResult.userId) {
    return {
      ok: false,
      statusCode: 401,
      error: 'unauthorized',
      message: authResult.message ?? `Authentication is required to ${actionLabel}.`,
    };
  }

  const authority = await hydrateRoomAuthority(roomId);
  if (!authority.roomRecordId) {
    return {
      ok: false,
      statusCode: 409,
      error: 'room_not_persisted',
      message: 'Shared media is available only in saved rooms.',
    };
  }

  const actorRole = resolveRole(authResult.userId, authority);
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    return {
      ok: false,
      statusCode: 403,
      error: 'forbidden',
      message: `Only the room owner or admins can ${actionLabel}.`,
    };
  }

  return {
    ok: true,
    userId: authResult.userId,
    actorRole,
    authority,
  };
}

async function finalizeProtectedMediaUpload(roomId, uploadId, userId) {
  const consumed = consumeUploadIntentForFinalize(uploadId, roomId, userId);
  if (!consumed.ok) {
    return consumed;
  }

  const intent = consumed.intent;
  if (!storageClient || !STORAGE_BUCKET_NAME) {
    return {
      ok: false,
      statusCode: 503,
      error: 'storage_not_configured',
      message: 'Protected media uploads are not configured on the server.',
    };
  }

  const existingAsset = await findRecentRoomMediaAssetByChecksum(roomId, intent.kind, intent.checksum);
  if (existingAsset) {
    if (existingAsset.storageKey !== intent.objectKey) {
      void cleanupManagedMediaObject(intent.objectKey, { roomId, reason: 'duplicate_upload_finalized', kind: intent.kind });
    }
    return {
      ok: true,
      asset: existingAsset,
      usage: summarizeRoomMediaUsage(await listRoomMediaAssetsFromBackend(roomId)),
    };
  }

  try {
    const head = await storageClient.send(new HeadObjectCommand({
      Bucket: STORAGE_BUCKET_NAME,
      Key: intent.objectKey,
    }));
    const objectSize = Number(head.ContentLength ?? intent.contentLength);
    if (!Number.isFinite(objectSize) || objectSize <= 0) {
      return {
        ok: false,
        statusCode: 409,
        error: 'upload_missing',
        message: 'The uploaded media object could not be verified.',
      };
    }

    const asset = await createRoomMediaAssetInBackend({
      roomId,
      kind: intent.kind,
      storageKey: intent.objectKey,
      fileName: intent.fileName,
      mimeType: intent.contentType,
      sizeBytes: objectSize,
      checksum: intent.checksum,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'ready',
      inUseSurfaceIds: [],
      inUseTv: false,
    });

    if (!asset) {
      return {
        ok: false,
        statusCode: 500,
        error: 'asset_create_failed',
        message: 'Unable to record the uploaded media asset.',
      };
    }

    cacheRoomMediaAssetByChecksum(asset);

    return {
      ok: true,
      asset,
      usage: summarizeRoomMediaUsage(await listRoomMediaAssetsFromBackend(roomId)),
    };
  } catch (error) {
    logEvent('warn', 'media.upload.verify_failed', {
      roomId,
      uploadId,
      objectKey: intent.objectKey,
      error: formatErrorForLog(error),
    });
    return {
      ok: false,
      statusCode: 409,
      error: 'upload_missing',
      message: 'The uploaded media object could not be verified.',
    };
  }
}

async function createPresignedStoragePutUrl(objectKey, contentType, expiresInSeconds) {
  const command = new PutObjectCommand({
    Bucket: STORAGE_BUCKET_NAME,
    Key: objectKey,
    ContentType: contentType,
  });
  return await getSignedUrl(storageClient, command, { expiresIn: expiresInSeconds });
}

function listLiveRooms() {
  return Array.from(roomParticipants.entries())
    .filter(([, participants]) => participants.size > 0)
    .map(([roomId, participants]) => {
      const authority = roomAuthorities.get(roomId) ?? null;
      const lastActiveAt = new Date(Math.max(...Array.from(participants.values()).map((participant) => participant.updatedAt || Date.now()))).toISOString();
      return {
        id: roomId,
        slug: roomId,
        name: roomId,
        maxUsers: MAX_ROOM_SIZE,
        isPersisted: Boolean(authority?.roomRecordId),
        isPrivate: false,
        isLocked: Boolean(authority?.isLocked),
        liveParticipantCount: participants.size,
        lastActiveAt,
      };
    });
}

function ensureRoomSockets(roomId) {
  const existing = roomSockets.get(roomId);
  if (existing) return existing;
  const created = new Map();
  roomSockets.set(roomId, created);
  return created;
}

function ensureRoomSeats(roomId) {
  const existing = roomSeats.get(roomId);
  if (existing) return existing;
  const created = [];
  roomSeats.set(roomId, created);
  return created;
}

function ensureRoomObjects(roomId) {
  const existing = roomObjects.get(roomId);
  if (existing) return existing;
  const created = [];
  roomObjects.set(roomId, created);
  return created;
}

async function ensureRoomSurfaces(roomId) {
  if (!hydratedSurfaceRooms.has(roomId)) {
    hydratedSurfaceRooms.add(roomId);
    try {
      roomSurfaces.set(roomId, await loadSurfaceSnapshotsFromBackend(roomId));
      markPersistenceHealthy(persistenceHealth.surface);
    } catch (error) {
      hydratedSurfaceRooms.delete(roomId);
      markPersistenceDegraded(persistenceHealth.surface, error);
      logEvent('error', 'surface.hydrate.failed', {
        roomId,
        error: formatErrorForLog(error),
      });
      if (!roomSurfaces.has(roomId)) {
        roomSurfaces.set(roomId, []);
      }
    }
  }

  const existing = roomSurfaces.get(roomId);
  if (existing) return existing;
  const created = [];
  roomSurfaces.set(roomId, created);
  return created;
}

function ensureRoomAuthority(roomId) {
  const existing = roomAuthorities.get(roomId);
  if (existing) {
    return existing;
  }

  const created = normalizeRoomAuthority(null);
  roomAuthorities.set(roomId, created);
  persistFallbackAuthorityStore(roomAuthorities);
  return created;
}

async function hydrateRoomAuthority(roomId) {
  try {
    const persisted = await loadAuthorityFromBackend(roomId);
    markPersistenceHealthy(persistenceHealth.authority);
    if (persisted) {
      roomAuthorities.set(roomId, persisted);
      persistFallbackAuthorityStore(roomAuthorities);
      return persisted;
    }
  } catch (error) {
    markPersistenceDegraded(persistenceHealth.authority, error);
    logEvent('error', 'authority.hydrate.failed', {
      roomId,
      error: formatErrorForLog(error),
    });
    console.error('[realtime] failed to hydrate room authority from backend', error);
  }

  return ensureRoomAuthority(roomId);
}

async function persistRoomAuthority(roomId, options = {}) {
  const authority = ensureRoomAuthority(roomId);
  persistFallbackAuthorityStore(roomAuthorities);

  try {
    const persisted = await saveAuthorityToBackend(roomId, authority, options);
    markPersistenceHealthy(persistenceHealth.authority);
    if (persisted) {
      roomAuthorities.set(roomId, persisted);
      persistFallbackAuthorityStore(roomAuthorities);
      return persisted;
    }
  } catch (error) {
    markPersistenceDegraded(persistenceHealth.authority, error);
    logEvent('error', 'authority.persist.failed', {
      roomId,
      error: formatErrorForLog(error),
    });
    console.error('[realtime] failed to persist room authority to backend', error);
  }

  return authority;
}

async function persistRoomSurface(roomId, surface) {
  try {
    const persisted = await saveSurfaceSnapshotToBackend(roomId, surface);
    markPersistenceHealthy(persistenceHealth.surface);
    return persisted ?? surface;
  } catch (error) {
    markPersistenceDegraded(persistenceHealth.surface, error);
    logEvent('error', 'surface.persist.failed', {
      roomId,
      surfaceId: surface.surfaceId,
      error: formatErrorForLog(error),
    });
    return surface;
  }
}

async function probePersistenceHealth() {
  if (persistenceHealth.authority.configured) {
    try {
      await loadAuthorityFromBackend('__healthcheck__');
      markPersistenceHealthy(persistenceHealth.authority);
    } catch (error) {
      markPersistenceDegraded(persistenceHealth.authority, error);
      logEvent('warn', 'authority.healthcheck.failed', {
        error: formatErrorForLog(error),
      });
    }
  }

  if (persistenceHealth.surface.configured) {
    try {
      await loadSurfaceSnapshotsFromBackend('__healthcheck__');
      markPersistenceHealthy(persistenceHealth.surface);
    } catch (error) {
      markPersistenceDegraded(persistenceHealth.surface, error);
      logEvent('warn', 'surface.healthcheck.failed', {
        error: formatErrorForLog(error),
      });
    }
  }
}

function ensureSeatState(seats, seatId) {
  let seat = seats.find((entry) => entry.seatId === seatId);
  if (seat) return seat;
  seat = { seatId, occupiedBySessionId: null, updatedAt: Date.now() };
  seats.push(seat);
  return seat;
}

function ensureObjectState(objects, objectId) {
  let object = objects.find((entry) => entry.objectId === objectId);
  if (object) return object;
  object = { objectId, ownerSessionId: null, position: { x: 0, y: 0, z: 0 }, rotation: null, updatedAt: Date.now() };
  objects.push(object);
  return object;
}

function broadcast(roomId, message, exceptSessionId) {
  const sockets = roomSockets.get(roomId);
  if (!sockets) return;
  sockets.forEach((socket, sessionId) => {
    if (exceptSessionId && sessionId === exceptSessionId) return;
    send(socket, message);
  });
}

function send(socket, message) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function normalizeToken(value, maxLength) {
  return typeof value === 'string' && value.trim() && value.trim().length <= maxLength ? value.trim() : null;
}

function normalizeDisplayName(value) {
  return typeof value === 'string' && value.trim() && value.trim().length <= MAX_DISPLAY_NAME_LENGTH ? value.trim() : null;
}

function normalizeSurfaceId(value) {
  return typeof value === 'string' && VALID_SURFACE_IDS.has(value.trim()) ? value.trim() : null;
}

function getSocketRoomId(socket, roomId) {
  const normalized = normalizeToken(roomId ?? socket.roomId, MAX_ROOM_ID_LENGTH);
  return normalized && normalized === socket.roomId ? normalized : socket.roomId ?? normalized;
}

function getSocketSessionId(socket, sessionId) {
  const normalized = normalizeToken(sessionId ?? socket.sessionId, 128);
  return normalized && normalized === socket.sessionId ? normalized : socket.sessionId ?? normalized;
}

function isVec3(value) {
  return Boolean(value) && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isRotation(value) {
  return Boolean(value) && Number.isFinite(value.yaw) && Number.isFinite(value.pitch);
}

function nullableRotation(value) {
  return value === null || isRotation(value);
}

function checkChatRateLimit(sessionId) {
  const now = Date.now();
  const recent = (chatRateLimits.get(sessionId) ?? []).filter((timestamp) => now - timestamp < CHAT_WINDOW_MS);
  if (recent.length >= CHAT_MAX_MESSAGES) {
    chatRateLimits.set(sessionId, recent);
    return false;
  }
  recent.push(now);
  chatRateLimits.set(sessionId, recent);
  return true;
}

function parseAllowedOrigins(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin) {
  if (ALLOWED_ORIGINS.length === 0) {
    return true;
  }
  return ALLOWED_ORIGINS.includes(origin);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, withCorsHeaders(null, { 'Content-Type': 'application/json; charset=utf-8' }));
  response.end(JSON.stringify(payload));
}

function withCorsHeaders(request, headers = {}) {
  const origin = typeof request?.headers?.origin === 'string' ? request.headers.origin : '';
  const allowOrigin = !request
    ? '*'
    : origin && isOriginAllowed(origin)
      ? origin
      : ALLOWED_ORIGINS.length === 0
        ? '*'
        : '';
  const corsHeaders = {
    ...headers,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,authorization',
  };
  if (allowOrigin) {
    corsHeaders['Access-Control-Allow-Origin'] = allowOrigin;
  }
  if (allowOrigin !== '*') {
    corsHeaders.Vary = corsHeaders.Vary ? `${corsHeaders.Vary}, Origin` : 'Origin';
  }
  return corsHeaders;
}

function isHttpOriginAllowed(request) {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
  if (!origin) {
    return true;
  }
  return isOriginAllowed(origin);
}

function getBearerToken(request) {
  const authorizationHeader = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
  return authorizationHeader.startsWith('Bearer ') ? authorizationHeader.slice(7).trim() : '';
}

function normalizeUploadFileName(value) {
  const normalized = normalizeToken(value, MAX_UPLOAD_FILE_NAME_LENGTH);
  return normalized ? normalized.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').trim() : null;
}

function normalizeUploadContentLength(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.floor(numeric);
}

function normalizeMediaChecksum(value) {
  const normalized = normalizeToken(value, MAX_MEDIA_CHECKSUM_LENGTH);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeRoomMediaKind(value) {
  return value === 'surface-image' || value === 'tv-video' ? value : null;
}

function buildProtectedMediaObjectKey(options) {
  const extension = getExtensionForContentType(options.contentType);
  const safeStem = sanitizeStorageStem(options.fileName);
  const randomSuffix = randomUUID().replace(/-/g, '');
  const fileName = `${Date.now()}-${randomSuffix}-${safeStem}.${extension}`;
  if (options.kind === 'surface-image') {
    return `room-surfaces/${options.roomId}/library/${fileName}`;
  }
  return `room-tv/${options.roomId}/library/${fileName}`;
}

function getExtensionForContentType(contentType) {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'video/mp4':
      return 'mp4';
    default:
      return 'bin';
  }
}

function sanitizeStorageStem(fileName) {
  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, '');
  const normalized = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'upload';
}

function pruneExpiredUploadIntents() {
  const now = Date.now();
  for (const [uploadId, intent] of mediaUploadIntents.entries()) {
    if ((intent.expiresAtMs ?? 0) <= now) {
      mediaUploadIntents.delete(uploadId);
      if (!intent.usedAt && intent.objectKey) {
        void cleanupManagedMediaObject(intent.objectKey, {
          roomId: intent.roomId,
          reason: 'upload_intent_expired',
          kind: intent.kind,
        });
      }
    }
  }
}

function enforceUploadIntentQuota(userId) {
  const activeIntentIds = [];
  for (const [uploadId, intent] of mediaUploadIntents.entries()) {
    if (intent.userId === userId) {
      activeIntentIds.push({ uploadId, createdAt: intent.createdAt });
    }
  }
  if (activeIntentIds.length < MAX_UPLOAD_INTENTS_PER_USER) {
    return;
  }
  activeIntentIds
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
    .slice(0, activeIntentIds.length - MAX_UPLOAD_INTENTS_PER_USER + 1)
    .forEach(({ uploadId }) => {
      mediaUploadIntents.delete(uploadId);
    });
}

function consumeAuthorizedUploadIntent(uploadId, options) {
  pruneExpiredUploadIntents();
  const intent = mediaUploadIntents.get(uploadId);
  if (!intent) {
    return { ok: false, code: 'upload_not_authorized', message: 'That shared media upload is no longer authorized.' };
  }
  if (intent.usedAt) {
    mediaUploadIntents.delete(uploadId);
    return { ok: false, code: 'upload_already_used', message: 'That shared media upload has already been used.' };
  }
  if (intent.roomId !== options.roomId || intent.userId !== options.userId || intent.kind !== options.kind) {
    return { ok: false, code: 'upload_scope_mismatch', message: 'That shared media upload does not match this room or user.' };
  }
  if (intent.objectKey !== options.objectKey) {
    return { ok: false, code: 'upload_key_mismatch', message: 'That shared media upload key is invalid.' };
  }
  if (options.kind === 'surface-image' && intent.surfaceId !== options.surfaceId) {
    return { ok: false, code: 'upload_surface_mismatch', message: 'That shared surface upload was not authorized for this frame.' };
  }

  intent.usedAt = new Date().toISOString();
  mediaUploadIntents.delete(uploadId);
  return { ok: true, intent };
}

function consumeUploadIntentForFinalize(uploadId, roomId, userId) {
  pruneExpiredUploadIntents();
  const intent = mediaUploadIntents.get(uploadId);
  if (!intent) {
    return { ok: false, statusCode: 409, error: 'upload_not_authorized', message: 'That shared media upload is no longer authorized.' };
  }
  if (intent.usedAt) {
    mediaUploadIntents.delete(uploadId);
    return { ok: false, statusCode: 409, error: 'upload_already_used', message: 'That shared media upload has already been used.' };
  }
  if (intent.roomId !== roomId || intent.userId !== userId) {
    return { ok: false, statusCode: 403, error: 'upload_scope_mismatch', message: 'That shared media upload does not match this room or user.' };
  }
  intent.usedAt = new Date().toISOString();
  mediaUploadIntents.delete(uploadId);
  return { ok: true, intent };
}

async function listRoomMediaUsage(roomId) {
  const assets = await listRoomMediaAssetsFromBackend(roomId);
  return summarizeRoomMediaUsage(assets);
}

function serializeRoomMediaAsset(asset) {
  if (!asset) {
    return null;
  }
  return {
    id: asset.id,
    roomId: asset.roomId,
    kind: asset.kind,
    storageKey: asset.storageKey,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    checksum: asset.checksum,
    createdBy: asset.createdBy,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    status: asset.status,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    inUseSurfaceIds: Array.isArray(asset.inUseSurfaceIds) ? [...asset.inUseSurfaceIds] : [],
    inUseTv: Boolean(asset.inUseTv),
  };
}

function serializeRoomMediaUsage(usage) {
  return {
    bytesUsed: usage?.bytesUsed ?? 0,
    assetCount: usage?.assetCount ?? 0,
    byteLimit: MAX_ROOM_MEDIA_BYTES,
  };
}

function formatBytesForMessage(bytes) {
  const safeBytes = Math.max(0, Number(bytes) || 0);
  const mb = safeBytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

async function resolveRoomMediaAssetForUse({ roomId, kind, assetId, storageKey }) {
  const normalizedKind = normalizeRoomMediaKind(kind);
  if (!roomId || !normalizedKind) {
    return null;
  }

  const asset = assetId
    ? await getRoomMediaAssetByIdFromBackend(assetId)
    : await getRoomMediaAssetByStorageKeyFromBackend(roomId, storageKey);

  if (!asset || asset.roomId !== roomId || asset.kind !== normalizedKind || asset.status !== 'ready') {
    return null;
  }
  if (storageKey && asset.storageKey !== storageKey) {
    return null;
  }
  return asset;
}

async function markRoomMediaSurfaceUsage(roomId, surfaceId, previousStorageKey, nextAsset) {
  if (previousStorageKey) {
    const previousAsset = await getRoomMediaAssetByStorageKeyFromBackend(roomId, previousStorageKey);
    if (previousAsset && previousAsset.id !== nextAsset.id) {
      await updateRoomMediaAssetInBackend({
        ...previousAsset,
        updatedAt: new Date().toISOString(),
        inUseSurfaceIds: previousAsset.inUseSurfaceIds.filter((entry) => entry !== surfaceId),
      });
    }
  }

  await updateRoomMediaAssetInBackend({
    ...nextAsset,
    updatedAt: new Date().toISOString(),
    inUseSurfaceIds: Array.from(new Set([...(nextAsset.inUseSurfaceIds ?? []), surfaceId])),
  });
}

async function getReferencedSurfaceIdsForAsset(roomId, asset) {
  if (!asset?.storageKey) {
    return Array.isArray(asset?.inUseSurfaceIds) ? asset.inUseSurfaceIds : [];
  }

  const surfaces = await ensureRoomSurfaces(roomId);
  const referencedSurfaceIds = surfaces
    .filter((surface) => surface.imagePath === asset.storageKey)
    .map((surface) => surface.surfaceId);

  return Array.from(new Set([...(asset.inUseSurfaceIds ?? []), ...referencedSurfaceIds]));
}

async function markRoomMediaTvUsage(roomId, previousStorageKey, nextAsset) {
  if (previousStorageKey) {
    const previousAsset = await getRoomMediaAssetByStorageKeyFromBackend(roomId, previousStorageKey);
    if (previousAsset && previousAsset.id !== nextAsset?.id) {
      await updateRoomMediaAssetInBackend({
        ...previousAsset,
        updatedAt: new Date().toISOString(),
        inUseTv: false,
      });
    }
  }

  if (nextAsset) {
    await updateRoomMediaAssetInBackend({
      ...nextAsset,
      updatedAt: new Date().toISOString(),
      inUseTv: true,
    });
  }
}

async function clearRoomSurfaceReference(roomId, surfaceId, metadata = {}) {
  const surfaces = await ensureRoomSurfaces(roomId);
  const existingIndex = surfaces.findIndex((entry) => entry.surfaceId === surfaceId);
  const existing = existingIndex >= 0 ? surfaces[existingIndex] : null;
  if (existingIndex >= 0) {
    surfaces.splice(existingIndex, 1);
  }
  await deleteSurfaceSnapshotFromBackend(roomId, surfaceId);
  if (existing?.imagePath) {
    const previousAsset = await getRoomMediaAssetByStorageKeyFromBackend(roomId, existing.imagePath);
    if (previousAsset) {
      await updateRoomMediaAssetInBackend({
        ...previousAsset,
        updatedAt: new Date().toISOString(),
        inUseSurfaceIds: previousAsset.inUseSurfaceIds.filter((entry) => entry !== surfaceId),
      });
    }
  }
  broadcast(roomId, { type: 'surface.cleared', surfaceId });
  logEvent('info', 'surface.cleared', {
    roomId,
    surfaceId,
    ...metadata,
  });
}

async function clearRoomTvReference(roomId, metadata = {}) {
  const existing = roomTvMedia.get(roomId) ?? null;
  roomTvMedia.delete(roomId);
  if (existing?.sourceUrl) {
    const previousAsset = await getRoomMediaAssetByStorageKeyFromBackend(roomId, existing.sourceUrl);
    if (previousAsset) {
      await updateRoomMediaAssetInBackend({
        ...previousAsset,
        updatedAt: new Date().toISOString(),
        inUseTv: false,
      });
    }
  }
  broadcast(roomId, { type: 'tv.updated', tvMedia: null });
  logEvent('info', 'tv.cleared', {
    roomId,
    ...metadata,
  });
}

async function deleteRoomMediaAssetForRoom(roomId, assetId, userId) {
  const asset = await getRoomMediaAssetByIdFromBackend(assetId);
  if (!asset || asset.roomId !== roomId || asset.status !== 'ready') {
    return {
      ok: false,
      statusCode: 404,
      error: 'asset_not_found',
      message: 'That room media asset could not be found.',
    };
  }

  const referencedSurfaceIds = await getReferencedSurfaceIdsForAsset(roomId, asset);
  for (const surfaceId of referencedSurfaceIds) {
    await clearRoomSurfaceReference(roomId, surfaceId, { assetId, userId, reason: 'asset_deleted' });
  }
  if (asset.inUseTv) {
    await clearRoomTvReference(roomId, { assetId, userId, reason: 'asset_deleted' });
  }

  await cleanupManagedMediaObject(asset.storageKey, {
    roomId,
    assetId,
    userId,
    reason: 'asset_deleted',
    kind: asset.kind,
  });
  evictRoomMediaAssetChecksum(asset);
  await deleteRoomMediaAssetFromBackend(assetId);

  const usage = summarizeRoomMediaUsage(await listRoomMediaAssetsFromBackend(roomId));
  return {
    ok: true,
    usage,
  };
}

function assetSurfaceIdsExcluding(asset, surfaceId) {
  const occupiedSurfaceIds = Array.isArray(asset?.inUseSurfaceIds) ? asset.inUseSurfaceIds : [];
  return occupiedSurfaceIds.filter((entry) => entry !== surfaceId);
}

async function findRecentRoomMediaAssetByChecksum(roomId, kind, checksum) {
  const cachedAsset = getCachedRoomMediaAssetByChecksum(roomId, kind, checksum);
  if (cachedAsset) {
    return cachedAsset;
  }

  const backendAsset = await getRoomMediaAssetByChecksumFromBackend(roomId, kind, checksum);
  if (backendAsset) {
    cacheRoomMediaAssetByChecksum(backendAsset);
  }
  return backendAsset;
}

function getCachedRoomMediaAssetByChecksum(roomId, kind, checksum) {
  pruneRoomMediaChecksumCache();
  const key = getRoomMediaChecksumCacheKey(roomId, kind, checksum);
  const entry = roomMediaChecksumCache.get(key);
  if (!entry) {
    return null;
  }
  return entry.asset?.status === 'ready' ? entry.asset : null;
}

function cacheRoomMediaAssetByChecksum(asset) {
  if (!asset?.roomId || !asset?.kind || !asset?.checksum) {
    return;
  }
  roomMediaChecksumCache.set(getRoomMediaChecksumCacheKey(asset.roomId, asset.kind, asset.checksum), {
    asset,
    cachedAtMs: Date.now(),
  });
}

function evictRoomMediaAssetChecksum(asset) {
  if (!asset?.roomId || !asset?.kind || !asset?.checksum) {
    return;
  }
  roomMediaChecksumCache.delete(getRoomMediaChecksumCacheKey(asset.roomId, asset.kind, asset.checksum));
}

function getRoomMediaChecksumCacheKey(roomId, kind, checksum) {
  return `${roomId}::${kind}::${checksum}`.toLowerCase();
}

function pruneRoomMediaChecksumCache() {
  const cutoff = Date.now() - ROOM_MEDIA_DEDUP_CACHE_TTL_MS;
  for (const [key, entry] of roomMediaChecksumCache.entries()) {
    if (!entry || entry.cachedAtMs < cutoff) {
      roomMediaChecksumCache.delete(key);
    }
  }
}

async function cleanupManagedMediaObject(objectKey, metadata = {}) {
  if (!storageClient || !STORAGE_BUCKET_NAME || !isManagedMediaKey(objectKey)) {
    return false;
  }
  try {
    await storageClient.send(new DeleteObjectCommand({
      Bucket: STORAGE_BUCKET_NAME,
      Key: objectKey,
    }));
    logEvent('info', 'media.object.deleted', {
      objectKey,
      ...metadata,
    });
    return true;
  } catch (error) {
    logEvent('warn', 'media.object.delete_failed', {
      objectKey,
      ...metadata,
      error: formatErrorForLog(error),
    });
    return false;
  }
}

async function cleanupManagedMediaPrefix(prefix, metadata = {}) {
  if (!storageClient || !STORAGE_BUCKET_NAME || !isManagedMediaPrefix(prefix)) {
    return 0;
  }
  let deletedCount = 0;
  let continuationToken = undefined;
  try {
    do {
      const response = await storageClient.send(new ListObjectsV2Command({
        Bucket: STORAGE_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      const objects = Array.isArray(response.Contents)
        ? response.Contents
          .map((entry) => typeof entry?.Key === 'string' ? ({ Key: entry.Key }) : null)
          .filter(Boolean)
        : [];
      if (objects.length > 0) {
        await storageClient.send(new DeleteObjectsCommand({
          Bucket: STORAGE_BUCKET_NAME,
          Delete: {
            Objects: objects,
            Quiet: true,
          },
        }));
        deletedCount += objects.length;
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    logEvent('info', 'media.prefix.deleted', {
      prefix,
      deletedCount,
      ...metadata,
    });
    return deletedCount;
  } catch (error) {
    logEvent('warn', 'media.prefix.delete_failed', {
      prefix,
      ...metadata,
      error: formatErrorForLog(error),
    });
    return deletedCount;
  }
}

function isManagedMediaKey(value) {
  return typeof value === 'string'
    && (value.startsWith('room-surfaces/') || value.startsWith('room-tv/'));
}

function isManagedMediaPrefix(value) {
  return typeof value === 'string'
    && (value.startsWith('room-surfaces/') || value.startsWith('room-tv/'));
}

function loadSpawnPoints() {
  const spawnFilePath = join(__dirname, '..', 'public', 'models', 'spawn_points.glb');
  if (!existsSync(spawnFilePath)) {
    return [];
  }

  try {
    const buffer = readFileSync(spawnFilePath);
    const magic = buffer.toString('utf8', 0, 4);
    if (magic !== 'glTF') {
      throw new Error('Invalid GLB header');
    }

    const jsonChunkLength = buffer.readUInt32LE(12);
    const jsonChunkType = buffer.readUInt32LE(16);
    if (jsonChunkType !== 0x4e4f534a) {
      throw new Error('GLB JSON chunk missing');
    }

    const jsonText = buffer.toString('utf8', 20, 20 + jsonChunkLength).replace(/\0+$/, '');
    const gltf = JSON.parse(jsonText);
    const sceneIndex = Number.isInteger(gltf.scene) ? gltf.scene : 0;
    const scene = gltf.scenes?.[sceneIndex];
    const rootNodes = scene?.nodes ?? [];
    const nodes = gltf.nodes ?? [];
    const spawnPoints = [];

    const walk = (nodeIndex, parentPosition, parentQuaternion) => {
      const node = nodes[nodeIndex];
      if (!node) {
        return;
      }

      const localPosition = new Vector3(...(node.translation ?? [0, 0, 0]));
      const localQuaternion = new Quaternion(...(node.rotation ?? [0, 0, 0, 1]));
      const worldPosition = localPosition.clone().applyQuaternion(parentQuaternion).add(parentPosition);
      const worldQuaternion = parentQuaternion.clone().multiply(localQuaternion);

      if (typeof node.name === 'string' && node.name.toLowerCase().startsWith('spawn_')) {
        const euler = new Euler().setFromQuaternion(worldQuaternion, 'YXZ');
        spawnPoints.push({
          spawnId: node.name,
          transform: {
            position: { x: worldPosition.x, y: worldPosition.y + DEFAULT_EYE_HEIGHT, z: worldPosition.z },
            rotation: { yaw: euler.y, pitch: euler.x },
          },
        });
      }

      for (const childIndex of node.children ?? []) {
        walk(childIndex, worldPosition, worldQuaternion);
      }
    };

    for (const nodeIndex of rootNodes) {
      walk(nodeIndex, new Vector3(), new Quaternion());
    }

    return spawnPoints.sort((a, b) => a.spawnId.localeCompare(b.spawnId));
  } catch (error) {
    console.error('[realtime] failed to load spawn points', error);
    return [];
  }
}

function serveStaticAsset(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method Not Allowed');
    return;
  }

  const url = new URL(request.url ?? '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolveDistPath(requestedPath);

  if (filePath) {
    sendFile(response, filePath, request.method === 'HEAD');
    return;
  }

  sendFile(response, INDEX_FILE, request.method === 'HEAD');
}

function resolveDistPath(requestPath) {
  const normalizedPath = normalize(requestPath).replace(/^([.][.][\/])+/, '').replace(/^([\/])+/, '');
  const candidate = join(DIST_DIR, normalizedPath);

  if (!candidate.startsWith(DIST_DIR) || !existsSync(candidate)) {
    return null;
  }

  const stats = statSync(candidate);
  if (stats.isDirectory()) {
    const nestedIndex = join(candidate, 'index.html');
    return existsSync(nestedIndex) ? nestedIndex : null;
  }

  return stats.isFile() ? candidate : null;
}

function sendFile(response, filePath, headOnly = false) {
  const extension = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] ?? 'application/octet-stream';

  response.writeHead(200, { 'Content-Type': contentType });
  if (headOnly) {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function loadAmplifyOutputs() {
  try {
    if (!existsSync(AMPLIFY_OUTPUTS_PATH)) {
      return {};
    }
    return JSON.parse(readFileSync(AMPLIFY_OUTPUTS_PATH, 'utf8'));
  } catch (error) {
    console.error('[realtime] failed to load amplify outputs', error);
    return {};
  }
}
function serializeAuthority(authority) {
  return normalizeRoomAuthority(authority);
}

function resolveRole(userId, authority) {
  if (authority.ownerUserId && authority.ownerUserId === userId) {
    return 'owner';
  }
  if (authority.adminUserIds.includes(userId)) {
    return 'admin';
  }
  return 'member';
}

function authorizeModerator(roomId, actorUserId, targetUserId, options) {
  const authority = ensureRoomAuthority(roomId);
  const actorRole = resolveRole(actorUserId, authority);
  const targetRole = resolveRole(targetUserId, authority);

  if (actorRole === 'owner') {
    return { ok: true, actorRole, targetRole };
  }
  if (options.ownerOnly) {
    return { ok: false, message: 'Only the room owner can perform this action.' };
  }
  if (actorRole !== 'admin') {
    return { ok: false, message: 'You do not have permission to perform this action.' };
  }
  if (targetRole === 'owner' || targetRole === 'admin') {
    return { ok: false, message: 'Admins cannot manage owners or other admins.' };
  }
  return { ok: true, actorRole, targetRole };
}

function broadcastAuthorityUpdate(roomId) {
  const sockets = roomSockets.get(roomId);
  if (!sockets || sockets.size === 0) {
    return;
  }

  const authority = serializeAuthority(ensureRoomAuthority(roomId));
  sockets.forEach((socket) => {
    send(socket, {
      type: 'room.authority.updated',
      authority,
      selfRole: resolveRole(socket.userId ?? `guest:${socket.sessionId}`, authority),
    });
  });
}

function pushSystemNotice(roomId, body) {
  const notice = {
    id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    userId: 'system',
    displayName: 'System',
    body,
    createdAt: new Date().toISOString(),
  };

  const messages = roomMessages.get(roomId) ?? [];
  messages.push(notice);
  roomMessages.set(roomId, messages.slice(-50));
  broadcast(roomId, { type: 'system.notice', notice });
}

function getParticipant(roomId, sessionId) {
  return roomParticipants.get(roomId)?.get(sessionId) ?? null;
}
async function verifyAuthToken(token) {
  if (!token) {
    return { ok: true, userId: null };
  }
  if (!COGNITO_ISSUER || !COGNITO_CLIENT_ID) {
    return { ok: false, message: 'Realtime auth verification is not configured on the server.' };
  }

  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return { ok: false, message: 'Malformed auth token.' };
    }

    const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8'));
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
      return { ok: false, message: 'Unsupported auth token algorithm.' };
    }

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const jwk = await getSigningKey(header.kid);
    if (!jwk) {
      return { ok: false, message: 'Unable to resolve auth signing key.' };
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const isValidSignature = verifier.verify(publicKey, base64UrlDecode(encodedSignature));
    if (!isValidSignature) {
      return { ok: false, message: 'Auth token signature is invalid.' };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds) {
      return { ok: false, message: 'Auth token has expired.' };
    }
    if (payload.iss !== COGNITO_ISSUER) {
      return { ok: false, message: 'Auth token issuer is invalid.' };
    }

    const audience = typeof payload.aud === 'string' ? payload.aud : typeof payload.client_id === 'string' ? payload.client_id : null;
    if (audience !== COGNITO_CLIENT_ID) {
      return { ok: false, message: 'Auth token audience is invalid.' };
    }
    if (!payload.sub || typeof payload.sub !== 'string') {
      return { ok: false, message: 'Auth token subject is missing.' };
    }

    return { ok: true, userId: payload.sub, claims: payload };
  } catch (error) {
    logEvent('error', 'auth.verify.failed', {
      error: formatErrorForLog(error),
    });
    console.error('[realtime] auth verification failed', error);
    return { ok: false, message: 'Unable to verify auth token.' };
  }
}

function normalizeLogLevel(value) {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }

  return 'info';
}

function shouldLog(level) {
  const priority = { debug: 10, info: 20, warn: 30, error: 40 };
  return priority[level] >= priority[LOG_LEVEL];
}

function logEvent(level, event, details = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...details,
  };
  const line = `[realtime] ${JSON.stringify(payload)}`;

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

function formatErrorForLog(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

function createPersistenceStatus(configured, fallbackMode) {
  return {
    configured,
    mode: configured ? 'verifying' : fallbackMode,
    lastCheckedAt: null,
    lastError: null,
  };
}

function markPersistenceHealthy(status) {
  if (!status.configured) {
    return;
  }

  status.mode = 'available';
  status.lastCheckedAt = new Date().toISOString();
  status.lastError = null;
}

function markPersistenceDegraded(status, error) {
  if (!status.configured) {
    return;
  }

  status.mode = 'degraded';
  status.lastCheckedAt = new Date().toISOString();
  status.lastError = formatErrorForLog(error);
}

function describePersistenceStatus(status, healthyLabel) {
  if (!status.configured) {
    return status.mode;
  }
  if (status.mode === 'available') {
    return healthyLabel;
  }
  if (status.mode === 'verifying') {
    return `${healthyLabel}:verifying`;
  }
  return `${healthyLabel}:degraded`;
}

async function getSigningKey(kid) {
  const cached = jwksCache.get(kid);
  if (cached) {
    return cached;
  }

  const response = await fetch(`${COGNITO_ISSUER}/.well-known/jwks.json`);
  if (!response.ok) {
    throw new Error(`JWKS fetch failed: ${response.status}`);
  }
  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  keys.forEach((key) => {
    if (typeof key?.kid === 'string') {
      jwksCache.set(key.kid, key);
    }
  });
  return jwksCache.get(kid) ?? null;
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padding), 'base64');
}

function deriveCognitoIssuer(userPoolId) {
  if (!userPoolId || !userPoolId.includes('_')) {
    return '';
  }
  const [region] = userPoolId.split('_');
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}













