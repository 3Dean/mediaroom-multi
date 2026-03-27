import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import type { ChatMessage } from '../src/types/chat';
import type { ClientMessage, ServerMessage } from '../src/types/network';
import type { PlayerPresence } from '../src/types/player';
import type { SeatState } from '../src/types/interactions';

type ClientSocket = import('ws').WebSocket & {
  isAlive?: boolean;
  roomId?: string;
  sessionId?: string;
};

const PORT = Number(process.env.REALTIME_PORT ?? 8787);
const roomParticipants = new Map<string, Map<string, PlayerPresence>>();
const roomSockets = new Map<string, Map<string, ClientSocket>>();
const roomMessages = new Map<string, ChatMessage[]>();
const roomSeats = new Map<string, SeatState[]>();

const server = createServer((_, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('musicspace realtime server');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket: ClientSocket) => {
  socket.isAlive = true;

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let message: ClientMessage;

    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(socket, {
        type: 'error',
        code: 'bad_json',
        message: 'Unable to parse message payload.',
      });
      return;
    }

    handleClientMessage(socket, message);
  });

  socket.on('close', () => {
    cleanupSocket(socket);
  });
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    const client = socket as ClientSocket;
    if (!client.isAlive) {
      client.terminate();
      cleanupSocket(client);
      return;
    }

    client.isAlive = false;
    client.ping();
  });
}, 15000);

wss.on('close', () => {
  clearInterval(heartbeat);
});

server.listen(PORT, () => {
  console.log(`musicspace realtime server listening on ws://localhost:${PORT}`);
});

function handleClientMessage(socket: ClientSocket, message: ClientMessage): void {
  switch (message.type) {
    case 'room.join': {
      const participants = ensureRoomParticipants(message.roomId);
      const sockets = ensureRoomSockets(message.roomId);
      const seats = ensureRoomSeats(message.roomId);
      const participant: PlayerPresence = {
        sessionId: message.sessionId,
        userId: message.userId ?? message.sessionId,
        displayName: message.displayName,
        roomId: message.roomId,
        transform: {
          position: { x: 0, y: 1.6, z: 0 },
          rotation: { yaw: 0, pitch: 0 },
        },
        isSitting: false,
        seatId: null,
        heldObjectId: null,
        updatedAt: Date.now(),
      };

      socket.roomId = message.roomId;
      socket.sessionId = message.sessionId;
      participants.set(message.sessionId, participant);
      sockets.set(message.sessionId, socket);

      send(socket, {
        type: 'room.joined',
        roomId: message.roomId,
        selfSessionId: message.sessionId,
        participants: Array.from(participants.values()),
        seats,
        recentMessages: roomMessages.get(message.roomId) ?? [],
        serverTime: Date.now(),
      });

      broadcast(message.roomId, {
        type: 'participant.joined',
        participant,
      }, message.sessionId);
      return;
    }

    case 'room.leave': {
      cleanupSocket(socket, message.roomId, message.sessionId);
      return;
    }

    case 'presence.update': {
      const participants = roomParticipants.get(message.roomId);
      if (!participants) {
        return;
      }

      const participant = participants.get(message.sessionId);
      if (!participant) {
        return;
      }

      const updated: PlayerPresence = {
        ...participant,
        transform: message.transform,
        isSitting: message.isSitting,
        seatId: message.seatId,
        heldObjectId: message.heldObjectId ?? null,
        updatedAt: Date.now(),
      };

      participants.set(message.sessionId, updated);
      broadcast(message.roomId, {
        type: 'participant.updated',
        participant: updated,
      }, message.sessionId);
      return;
    }

    case 'chat.send': {
      const participants = roomParticipants.get(message.roomId);
      const participant = participants?.get(message.sessionId);
      if (!participant) {
        return;
      }

      const chatMessage: ChatMessage = {
        id: message.clientMessageId,
        roomId: message.roomId,
        userId: participant.userId,
        displayName: participant.displayName,
        body: message.body,
        createdAt: new Date().toISOString(),
      };

      const messages = roomMessages.get(message.roomId) ?? [];
      messages.push(chatMessage);
      roomMessages.set(message.roomId, messages.slice(-50));

      broadcast(message.roomId, {
        type: 'chat.received',
        message: chatMessage,
      });
      return;
    }

    case 'ping': {
      send(socket, {
        type: 'pong',
        ts: message.ts,
      });
      return;
    }

    case 'seat.claim':
    case 'seat.release':
    case 'object.claim':
    case 'object.release': {
      send(socket, {
        type: 'error',
        code: 'not_implemented',
        message: `${message.type} is not implemented yet on the realtime server.`,
      });
      return;
    }

    default: {
      const exhaustiveCheck: never = message;
      return exhaustiveCheck;
    }
  }
}

function cleanupSocket(socket: ClientSocket, roomId = socket.roomId, sessionId = socket.sessionId): void {
  if (!roomId || !sessionId) {
    return;
  }

  const participants = roomParticipants.get(roomId);
  participants?.delete(sessionId);
  if (participants && participants.size === 0) {
    roomParticipants.delete(roomId);
  }

  const sockets = roomSockets.get(roomId);
  sockets?.delete(sessionId);
  if (sockets && sockets.size === 0) {
    roomSockets.delete(roomId);
  }

  broadcast(roomId, {
    type: 'participant.left',
    sessionId,
  }, sessionId);
}

function ensureRoomParticipants(roomId: string): Map<string, PlayerPresence> {
  const existing = roomParticipants.get(roomId);
  if (existing) {
    return existing;
  }

  const created = new Map<string, PlayerPresence>();
  roomParticipants.set(roomId, created);
  return created;
}

function ensureRoomSockets(roomId: string): Map<string, ClientSocket> {
  const existing = roomSockets.get(roomId);
  if (existing) {
    return existing;
  }

  const created = new Map<string, ClientSocket>();
  roomSockets.set(roomId, created);
  return created;
}

function ensureRoomSeats(roomId: string): SeatState[] {
  const existing = roomSeats.get(roomId);
  if (existing) {
    return existing;
  }

  const created: SeatState[] = [];
  roomSeats.set(roomId, created);
  return created;
}

function broadcast(roomId: string, message: ServerMessage, exceptSessionId?: string): void {
  const sockets = roomSockets.get(roomId);
  if (!sockets) {
    return;
  }

  sockets.forEach((socket, sessionId) => {
    if (exceptSessionId && sessionId === exceptSessionId) {
      return;
    }

    send(socket, message);
  });
}

function send(socket: ClientSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}
