import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const HOST = process.env.REALTIME_HOST ?? '0.0.0.0';
const PORT = Number(process.env.REALTIME_PORT ?? process.env.PORT ?? 8787);
const MAX_ROOM_SIZE = Number(process.env.REALTIME_MAX_ROOM_SIZE ?? 8);
const MAX_CHAT_LENGTH = Number(process.env.REALTIME_MAX_CHAT_LENGTH ?? 280);
const CHAT_WINDOW_MS = Number(process.env.REALTIME_CHAT_WINDOW_MS ?? 10000);
const CHAT_MAX_MESSAGES = Number(process.env.REALTIME_CHAT_MAX_MESSAGES ?? 5);
const MAX_DISPLAY_NAME_LENGTH = Number(process.env.REALTIME_MAX_DISPLAY_NAME_LENGTH ?? 32);
const MAX_ROOM_ID_LENGTH = Number(process.env.REALTIME_MAX_ROOM_ID_LENGTH ?? 64);
const MAX_OBJECT_ID_LENGTH = Number(process.env.REALTIME_MAX_OBJECT_ID_LENGTH ?? 64);
const MAX_SEAT_ID_LENGTH = Number(process.env.REALTIME_MAX_SEAT_ID_LENGTH ?? 64);
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.REALTIME_ALLOWED_ORIGINS ?? process.env.RENDER_EXTERNAL_URL ?? '');
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const INDEX_FILE = join(DIST_DIR, 'index.html');
const HAS_DIST = existsSync(INDEX_FILE);
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
const chatRateLimits = new Map();

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      ok: true,
      host: HOST,
      port: PORT,
      roomCount: roomParticipants.size,
      maxRoomSize: MAX_ROOM_SIZE,
      allowedOrigins: ALLOWED_ORIGINS.length === 0 ? 'all' : ALLOWED_ORIGINS,
      servingDist: HAS_DIST,
    }));
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

    handleClientMessage(socket, message);
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
server.listen(PORT, HOST, () => {
  console.log(`[realtime] listening on ws://${HOST}:${PORT}`);
  console.log(`[realtime] servingDist=${HAS_DIST}`);
  console.log(`[realtime] maxRoomSize=${MAX_ROOM_SIZE} maxChatLength=${MAX_CHAT_LENGTH} chatRate=${CHAT_MAX_MESSAGES}/${CHAT_WINDOW_MS}ms`);
  console.log(`[realtime] allowedOrigins=${ALLOWED_ORIGINS.length === 0 ? 'all' : ALLOWED_ORIGINS.join(',')}`);
});

function handleClientMessage(socket, message) {
  if (!message || typeof message.type !== 'string') {
    send(socket, { type: 'error', code: 'bad_message', message: 'Message type is required.' });
    return;
  }

  switch (message.type) {
    case 'room.join':
      handleRoomJoin(socket, message);
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
    case 'ping':
      send(socket, { type: 'pong', ts: message.ts });
      return;
    default:
      send(socket, { type: 'error', code: 'unknown_type', message: `Unsupported message type: ${message.type}` });
  }
}

function handleRoomJoin(socket, message) {
  const roomId = normalizeToken(message.roomId, MAX_ROOM_ID_LENGTH);
  const sessionId = normalizeToken(message.sessionId, 128);
  const displayName = normalizeDisplayName(message.displayName);
  const userId = normalizeToken(message.userId ?? message.sessionId, 128);

  if (!roomId || !sessionId || !displayName || !userId) {
    send(socket, { type: 'error', code: 'invalid_join', message: 'roomId, sessionId, userId, and displayName are required.' });
    return;
  }

  const participants = ensureRoomParticipants(roomId);
  if (!participants.has(sessionId) && participants.size >= MAX_ROOM_SIZE) {
    send(socket, { type: 'error', code: 'room_full', message: `Room ${roomId} is full.` });
    return;
  }

  const sockets = ensureRoomSockets(roomId);
  const seats = ensureRoomSeats(roomId);
  const objects = ensureRoomObjects(roomId);
  const participant = {
    sessionId,
    userId,
    displayName,
    roomId,
    transform: { position: { x: 0, y: 1.6, z: 0 }, rotation: { yaw: 0, pitch: 0 } },
    isSitting: false,
    seatId: null,
    heldObjectId: null,
    updatedAt: Date.now(),
  };

  socket.roomId = roomId;
  socket.sessionId = sessionId;
  participants.set(sessionId, participant);
  sockets.set(sessionId, socket);

  send(socket, {
    type: 'room.joined',
    roomId,
    selfSessionId: sessionId,
    participants: Array.from(participants.values()),
    seats,
    objects,
    recentMessages: roomMessages.get(roomId) ?? [],
    serverTime: Date.now(),
  });
  broadcast(roomId, { type: 'participant.joined', participant }, sessionId);
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
    send(socket, { type: 'error', code: 'invalid_chat', message: `Chat messages must be 1-${MAX_CHAT_LENGTH} characters.` });
    return;
  }

  if (!checkChatRateLimit(sessionId)) {
    send(socket, { type: 'error', code: 'chat_rate_limited', message: 'You are sending messages too quickly.' });
    return;
  }

  const participants = roomParticipants.get(roomId);
  const participant = participants?.get(sessionId);
  if (!participant) return;

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
  if (participants && participants.size === 0) roomParticipants.delete(roomId);
  const sockets = roomSockets.get(roomId);
  sockets?.delete(sessionId);
  if (sockets && sockets.size === 0) roomSockets.delete(roomId);
  chatRateLimits.delete(sessionId);
  broadcast(roomId, { type: 'participant.left', sessionId }, sessionId);
}

function ensureRoomParticipants(roomId) {
  const existing = roomParticipants.get(roomId);
  if (existing) return existing;
  const created = new Map();
  roomParticipants.set(roomId, created);
  return created;
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
  const normalizedPath = normalize(requestPath).replace(/^([.][.][/\\])+/, '');
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
