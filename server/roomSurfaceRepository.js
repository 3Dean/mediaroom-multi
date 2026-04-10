import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const AMPLIFY_OUTPUTS_PATH = join(__dirname, '..', 'amplify_outputs.json');
const VALID_SURFACE_IDS = new Set(['image01', 'image02', 'image03', 'image04']);

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

export function canUseSurfaceBackendPersistence() {
  return Boolean(appsyncUrl && signer);
}

export async function loadSurfaceSnapshotsFromBackend(roomId) {
  if (!canUseSurfaceBackendPersistence()) {
    return [];
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      query ListRoomSurfaceSnapshotsByRoom($roomId: String!) {
        listRoomSurfaceSnapshots(filter: { roomId: { eq: $roomId } }, limit: 100) {
          items {
            id
            roomId
            surfaceId
            imagePath
            updatedByUserId
            updatedAt
          }
        }
      }
    `,
    { roomId },
  );

  return collapseSurfaceSnapshots(normalizeSurfaceArray(response?.listRoomSurfaceSnapshots?.items ?? []));
}

export async function saveSurfaceSnapshotToBackend(roomId, surface) {
  if (!canUseSurfaceBackendPersistence()) {
    return null;
  }

  const normalized = normalizeSurfaceSnapshot(surface);
  if (!normalized) {
    return null;
  }

  const existingIds = await findSurfaceRecordIds(roomId, normalized.surfaceId);
  const existingId = existingIds[0] ?? null;
  const variables = existingId
    ? {
        input: {
          id: existingId,
          roomId,
          surfaceId: normalized.surfaceId,
          imagePath: normalized.imagePath,
          updatedByUserId: normalized.updatedByUserId,
          updatedAt: normalized.updatedAt,
        },
      }
    : {
        input: {
          roomId,
          surfaceId: normalized.surfaceId,
          imagePath: normalized.imagePath,
          updatedByUserId: normalized.updatedByUserId,
          updatedAt: normalized.updatedAt,
        },
      };

  const response = await executeGraphql(
    existingId
      ? /* GraphQL */ `
          mutation UpdateRoomSurfaceSnapshot($input: UpdateRoomSurfaceSnapshotInput!) {
            updateRoomSurfaceSnapshot(input: $input) {
              roomId
              surfaceId
              imagePath
              updatedByUserId
              updatedAt
            }
          }
        `
      : /* GraphQL */ `
          mutation CreateRoomSurfaceSnapshot($input: CreateRoomSurfaceSnapshotInput!) {
            createRoomSurfaceSnapshot(input: $input) {
              roomId
              surfaceId
              imagePath
              updatedByUserId
              updatedAt
            }
          }
        `,
    variables,
  );

  if (existingIds.length > 1) {
    await deleteSurfaceSnapshotIds(existingIds.slice(1));
  }

  return normalizeSurfaceSnapshot(response?.updateRoomSurfaceSnapshot ?? response?.createRoomSurfaceSnapshot ?? null);
}

export async function deleteSurfaceSnapshotsFromBackend(roomId) {
  if (!canUseSurfaceBackendPersistence()) {
    return 0;
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      query ListRoomSurfaceSnapshotIdsByRoom($roomId: String!) {
        listRoomSurfaceSnapshots(filter: { roomId: { eq: $roomId } }, limit: 100) {
          items {
            id
          }
        }
      }
    `,
    { roomId },
  );

  const ids = Array.isArray(response?.listRoomSurfaceSnapshots?.items)
    ? response.listRoomSurfaceSnapshots.items
      .map((entry) => typeof entry?.id === 'string' ? entry.id : null)
      .filter(Boolean)
    : [];

  return await deleteSurfaceSnapshotIds(ids);
}

export async function deleteSurfaceSnapshotFromBackend(roomId, surfaceId) {
  if (!canUseSurfaceBackendPersistence() || !VALID_SURFACE_IDS.has(surfaceId)) {
    return false;
  }

  const existingIds = await findSurfaceRecordIds(roomId, surfaceId);
  if (existingIds.length === 0) {
    return false;
  }

  return (await deleteSurfaceSnapshotIds(existingIds)) > 0;
}

async function findSurfaceRecordIds(roomId, surfaceId) {
  const response = await executeGraphql(
    /* GraphQL */ `
      query ListRoomSurfaceSnapshotIds($roomId: String!, $surfaceId: String!) {
        listRoomSurfaceSnapshots(filter: { roomId: { eq: $roomId }, surfaceId: { eq: $surfaceId } }, limit: 100) {
          items {
            id
            updatedAt
          }
        }
      }
    `,
    { roomId, surfaceId },
  );

  const items = Array.isArray(response?.listRoomSurfaceSnapshots?.items)
    ? response.listRoomSurfaceSnapshots.items
      .filter((item) => typeof item?.id === 'string' && item.id)
      .sort((left, right) => compareIsoDatesDesc(left?.updatedAt, right?.updatedAt))
    : [];

  return items.map((item) => item.id);
}

function normalizeSurfaceArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => normalizeSurfaceSnapshot(entry)).filter(Boolean)
    : [];
}

function collapseSurfaceSnapshots(items) {
  const latestBySurfaceId = new Map();
  for (const item of items) {
    const existing = latestBySurfaceId.get(item.surfaceId);
    if (!existing || compareIsoDatesDesc(item.updatedAt, existing.updatedAt) < 0) {
      latestBySurfaceId.set(item.surfaceId, item);
    }
  }
  return Array.from(latestBySurfaceId.values());
}

function normalizeSurfaceSnapshot(value) {
  if (!VALID_SURFACE_IDS.has(value?.surfaceId)) {
    return null;
  }
  if (typeof value?.imagePath !== 'string' || !value.imagePath.trim()) {
    return null;
  }
  if (typeof value?.updatedByUserId !== 'string' || !value.updatedByUserId.trim()) {
    return null;
  }
  const updatedAt = typeof value?.updatedAt === 'string' && value.updatedAt.trim()
    ? value.updatedAt
    : new Date().toISOString();

  return {
    surfaceId: value.surfaceId,
    imagePath: value.imagePath.trim(),
    updatedByUserId: value.updatedByUserId.trim(),
    updatedAt,
  };
}

function compareIsoDatesDesc(left, right) {
  const leftTime = Date.parse(typeof left === 'string' ? left : '');
  const rightTime = Date.parse(typeof right === 'string' ? right : '');
  const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
  const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
  return safeRight - safeLeft;
}

async function deleteSurfaceSnapshotIds(ids) {
  let deletedCount = 0;
  for (const id of ids) {
    const result = await executeGraphql(
      /* GraphQL */ `
        mutation DeleteRoomSurfaceSnapshot($input: DeleteRoomSurfaceSnapshotInput!) {
          deleteRoomSurfaceSnapshot(input: $input) {
            id
          }
        }
      `,
      { input: { id } },
    );

    if (result?.deleteRoomSurfaceSnapshot?.id) {
      deletedCount += 1;
    }
  }

  return deletedCount;
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
    console.error('[realtime] failed to load amplify outputs for room surface repository', error);
    return {};
  }
}
