import { APP_CONFIG } from '../app/config';

export function getRealtimeApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const explicitBase = resolveConfiguredRealtimeHttpBase();
  if (explicitBase) {
    return `${explicitBase}${normalizedPath}`;
  }

  if (import.meta.env.DEV) {
    return `http://localhost:${APP_CONFIG.defaultRealtimePort}${normalizedPath}`;
  }

  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';
  const isPrivateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  const isDevHost = isLoopback || isPrivateIpv4;
  const port = isDevHost
    ? `:${APP_CONFIG.defaultRealtimePort}`
    : window.location.port
      ? `:${window.location.port}`
      : '';

  return `${protocol}//${hostname}${port}${normalizedPath}`;
}

function resolveConfiguredRealtimeHttpBase(): string | null {
  const configured = window.__MUSICSPACE_REALTIME_URL__ ?? import.meta.env.VITE_REALTIME_URL ?? null;
  if (!configured || typeof configured !== 'string') {
    return null;
  }

  try {
    const url = new URL(configured, window.location.href);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
