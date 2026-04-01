import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const AMPLIFY_OUTPUTS_PATH = join(__dirname, '..', 'amplify_outputs.json');
const FALLBACK_STORE_PATH = join(__dirname, 'data', 'room-authority-store.json');
const MAX_ROOM_NAME_LENGTH = 64;

const outputs = loadAmplifyOutputs();
const appsyncUrl = process.env.REALTIME_APPSYNC_URL?.trim() || outputs.data?.url || '';
const region = process.env.AWS_REGION?.trim() || outputs.data?.aws_region || outputs.auth?.aws_region || 'us-east-1';
const credentialsProvider = appsyncUrl ? defaultProvider() : null;
const signer = appsyncUrl ? new SignatureV4({
  service: 'appsync',
  region,
  credentials: credentialsProvider,
  sha256: Sha256,
}) : null;

export function loadFallbackAuthorityStore() {
  try {
    if (!existsSync(FALLBACK_STORE_PATH)) {
      return {};
    }
    const parsed = JSON.parse(readFileSync(FALLBACK_STORE_PATH, 'utf8'));
    return typeof parsed?.rooms === 'object' && parsed.rooms ? parsed.rooms : {};
  } catch (error) {
    console.error('[realtime] failed to load authority fallback store', error);
    return {};
  }
}

export function persistFallbackAuthorityStore(roomAuthorities) {
  try {
    mkdirSync(join(FALLBACK_STORE_PATH, '..'), { recursive: true });
  } catch {}

  const rooms = Object.fromEntries(Array.from(roomAuthorities.entries()).map(([roomId, authority]) => [roomId, normalizeAuthority(authority)]));
  writeFileSync(FALLBACK_STORE_PATH, JSON.stringify({ version: 1, rooms }, null, 2), 'utf8');
}

export function normalizeAuthority(value) {
  return {
    ownerUserId: typeof value?.ownerUserId === 'string' ? value.ownerUserId : null,
    adminUserIds: normalizeStringArray(value?.adminUserIds),
    mutedUserIds: normalizeStringArray(value?.mutedUserIds),
    isLocked: Boolean(value?.isLocked),
    roomRecordId: typeof value?.roomRecordId === 'string' ? value.roomRecordId : null,
  };
}

export async function loadAuthorityFromBackend(roomId) {
  if (!canUseBackendPersistence()) {
    return null;
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      query ListRoomsBySlug($slug: String!) {
        listRooms(filter: { slug: { eq: $slug } }, limit: 1) {
          items {
            id
            slug
            createdBy
            maxUsers
            isPrivate
            isLocked
            adminUserIds
            mutedUserIds
          }
        }
      }
    `,
    { slug: roomId },
  );

  const room = response?.listRooms?.items?.[0];
  if (!room) {
    return null;
  }

  return normalizeAuthority({
    ownerUserId: room.createdBy,
    adminUserIds: parseJsonArray(room.adminUserIds),
    mutedUserIds: parseJsonArray(room.mutedUserIds),
    isLocked: Boolean(room.isLocked),
    roomRecordId: room.id,
  });
}

export async function saveAuthorityToBackend(roomId, authority, options = {}) {
  if (!canUseBackendPersistence()) {
    return null;
  }

  const normalized = normalizeAuthority(authority);
  const roomRecordId = normalized.roomRecordId ?? await ensureRoomRecord(roomId, normalized.ownerUserId, options.maxUsers ?? 8);
  if (!roomRecordId) {
    return null;
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      mutation UpdateRoomAuthority($input: UpdateRoomInput!) {
        updateRoom(input: $input) {
          id
          createdBy
          isLocked
          adminUserIds
          mutedUserIds
        }
      }
    `,
    {
      input: {
        id: roomRecordId,
        isLocked: normalized.isLocked,
        adminUserIds: JSON.stringify(normalized.adminUserIds),
        mutedUserIds: JSON.stringify(normalized.mutedUserIds),
      },
    },
  );

  const room = response?.updateRoom;
  if (!room) {
    return null;
  }

  return normalizeAuthority({
    ownerUserId: room.createdBy,
    adminUserIds: parseJsonArray(room.adminUserIds),
    mutedUserIds: parseJsonArray(room.mutedUserIds),
    isLocked: Boolean(room.isLocked),
    roomRecordId,
  });
}

export function canUseBackendPersistence() {
  return Boolean(appsyncUrl && signer);
}

async function ensureRoomRecord(roomId, ownerUserId, maxUsers) {
  if (!ownerUserId) {
    return null;
  }

  const existing = await loadAuthorityFromBackend(roomId);
  if (existing?.roomRecordId) {
    return existing.roomRecordId;
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      mutation CreateRoomForAuthority($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          createdBy
          isLocked
          adminUserIds
          mutedUserIds
        }
      }
    `,
    {
      input: {
        slug: roomId,
        name: roomId.slice(0, MAX_ROOM_NAME_LENGTH),
        createdBy: ownerUserId,
        maxUsers,
        isPrivate: false,
        isLocked: false,
        adminUserIds: JSON.stringify([]),
        mutedUserIds: JSON.stringify([]),
      },
    },
  );

  return response?.createRoom?.id ?? null;
}

async function executeGraphql(query, variables) {
  if (!appsyncUrl || !signer) {
    return null;
  }

  const endpoint = new URL(appsyncUrl);
  const body = JSON.stringify({ query, variables });
  const request = new HttpRequest({
    method: 'POST',
    protocol: endpoint.protocol,
    hostname: endpoint.hostname,
    path: endpoint.pathname,
    headers: {
      'content-type': 'application/json',
      host: endpoint.hostname,
    },
    body,
  });

  const signed = await signer.sign(request);
  const response = await fetch(appsyncUrl, {
    method: 'POST',
    headers: signed.headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`AppSync request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors.map((entry) => entry.message).join('; '));
  }

  return payload.data ?? null;
}

function loadAmplifyOutputs() {
  try {
    if (!existsSync(AMPLIFY_OUTPUTS_PATH)) {
      return {};
    }
    return JSON.parse(readFileSync(AMPLIFY_OUTPUTS_PATH, 'utf8'));
  } catch (error) {
    console.error('[realtime] failed to load amplify outputs for authority repository', error);
    return {};
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }
  try {
    return normalizeStringArray(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}
