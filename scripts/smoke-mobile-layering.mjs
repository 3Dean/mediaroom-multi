import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, devices } from 'playwright';

const providedBaseUrl = process.env.SMOKE_BASE_URL?.trim() || '';
const port = Number(process.env.SMOKE_PORT ?? 8793);
const baseUrl = providedBaseUrl || `http://127.0.0.1:${port}`;
const timeoutMs = 20000;

const server = providedBaseUrl ? null : spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    REALTIME_PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';

server?.stdout?.on('data', (chunk) => {
  stdout += chunk.toString();
});

server?.stderr?.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitForHealthEndpoint();

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('#musicspace-sidebar.is-open');
    await page.waitForSelector('#interactionButton');
    await page.waitForSelector('#closeButton');

    const check = await page.evaluate(() => {
      const sidebar = document.getElementById('musicspace-sidebar');
      const prompt = document.getElementById('interactionButton');
      const closeButton = document.getElementById('closeButton');
      if (!(sidebar instanceof HTMLElement) || !(prompt instanceof HTMLButtonElement) || !(closeButton instanceof HTMLButtonElement)) {
        throw new Error('Required overlay elements are missing.');
      }

      const sidebarRect = sidebar.getBoundingClientRect();
      const left = Math.max(24, Math.round(sidebarRect.left + 24));
      const promptTop = Math.max(120, Math.round(sidebarRect.top + 120));
      const closeTop = promptTop + 72;

      for (const [element, label, top] of [
        [prompt, 'Sit', promptTop],
        [closeButton, 'Stand', closeTop],
      ]) {
        element.textContent = label;
        element.style.display = 'block';
        element.style.position = 'fixed';
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        element.style.transform = 'none';
      }

      const hitTest = (element) => {
        const rect = element.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);
        const topElement = document.elementFromPoint(x, y);
        return {
          x,
          y,
          topId: topElement?.id ?? null,
          withinSidebar: Boolean(topElement && topElement.closest('#musicspace-sidebar')),
          blockedByPrompt: Boolean(topElement && topElement.closest('#interactionButton, #closeButton')),
        };
      };

      return {
        prompt: hitTest(prompt),
        closeButton: hitTest(closeButton),
        sidebarZ: window.getComputedStyle(sidebar).zIndex,
        promptZ: window.getComputedStyle(prompt).zIndex,
        closeZ: window.getComputedStyle(closeButton).zIndex,
      };
    });

    const failures = [
      ['interactionButton', check.prompt],
      ['closeButton', check.closeButton],
    ].filter(([, result]) => !result.withinSidebar || result.blockedByPrompt);

    if (failures.length > 0) {
      throw new Error(`Mobile layering regression detected: ${JSON.stringify(check, null, 2)}`);
    }

    console.log(`Mobile layering smoke test passed for ${baseUrl}`);
    console.log(JSON.stringify(check, null, 2));
    await context.close();
  } finally {
    await browser.close();
  }
} finally {
  server?.kill();
  if (server) {
    await onceServerExited(server);
  }
}

async function waitForHealthEndpoint() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (server && server.exitCode !== null) {
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
