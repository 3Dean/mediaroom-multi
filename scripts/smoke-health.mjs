import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = Number(process.env.SMOKE_PORT ?? 8791);
const baseUrl = `http://127.0.0.1:${port}`;
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
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    throw new Error(`/health returned ${response.status}`);
  }

  const payload = await response.json();
  if (payload.ok !== true) {
    throw new Error('Health payload did not report ok=true.');
  }
  if (payload.servingDist !== true) {
    throw new Error('Health payload did not report servingDist=true.');
  }
  if (payload.port !== port) {
    throw new Error(`Health payload reported port ${payload.port}, expected ${port}.`);
  }

  console.log(`Smoke test passed for ${baseUrl}/health`);
} finally {
  server.kill();
  await onceServerExited(server);
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
