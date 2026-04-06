import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

const port = Number(process.env.SMOKE_PORT ?? 8792);
const baseUrl = `http://127.0.0.1:${port}`;
const socketUrl = `ws://127.0.0.1:${port}`;
const timeoutMs = 15000;

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    REALTIME_PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';

server.stdout?.on('data', (chunk) => {
  stdout += chunk.toString();
});

server.stderr?.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitForHealthEndpoint();
  const joinedMessage = await joinRealtimeRoom();
  if (joinedMessage.type !== 'room.joined') {
    throw new Error(`Expected room.joined, received ${joinedMessage.type}.`);
  }
  if (joinedMessage.roomId !== 'smoke-room') {
    throw new Error(`Expected roomId smoke-room, received ${joinedMessage.roomId}.`);
  }
  if (joinedMessage.selfSessionId !== 'smoke-session') {
    throw new Error(`Expected selfSessionId smoke-session, received ${joinedMessage.selfSessionId}.`);
  }
  if (!Array.isArray(joinedMessage.participants) || joinedMessage.participants.length !== 1) {
    throw new Error(`Expected exactly one participant in room.joined, received ${joinedMessage.participants?.length ?? 'unknown'}.`);
  }
  if (joinedMessage.participants[0]?.sessionId !== 'smoke-session') {
    throw new Error('Joined participant sessionId did not match smoke-session.');
  }

  console.log(`Realtime smoke test passed for ${socketUrl}`);
} finally {
  server.kill();
  await onceServerExited(server);
}

async function joinRealtimeRoom() {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`Timed out waiting for realtime join response.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, timeoutMs);

    socket.once('open', () => {
      socket.send(JSON.stringify({
        type: 'room.join',
        roomId: 'smoke-room',
        sessionId: 'smoke-session',
        displayName: 'Smoke Test',
      }));
    });

    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'error') {
          clearTimeout(timer);
          socket.close();
          reject(new Error(`Realtime server returned error ${message.code}: ${message.message}`));
          return;
        }
        if (message.type === 'room.joined') {
          clearTimeout(timer);
          socket.send(JSON.stringify({
            type: 'room.leave',
            roomId: 'smoke-room',
            sessionId: 'smoke-session',
          }));
          socket.close();
          resolve(message);
        }
      } catch (error) {
        clearTimeout(timer);
        socket.close();
        reject(error);
      }
    });

    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    socket.once('close', () => {
      clearTimeout(timer);
    });
  });
}

async function waitForHealthEndpoint() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited early with code ${server.exitCode}.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting up.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${baseUrl}/health.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
}

async function onceServerExited(child) {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 2000);
  });
}
