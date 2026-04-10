import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const AMPLIFY_OUTPUTS_PATH = join(__dirname, '..', 'amplify_outputs.json');
const VALID_MEDIA_KINDS = new Set(['surface-image', 'tv-video']);

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

export function canUseRoomMediaAssetPersistence() {
  return Boolean(appsyncUrl && signer);
}

export async function listRoomMediaAssetsFromBackend(roomId, kind = null) {
  if (!canUseRoomMediaAssetPersistence()) {
    return [];
  }

  const items = await listRoomMediaAssetItems(roomId, kind);
  return normalizeRoomMediaAssetArray(items)
    .filter((asset) => asset.status === 'ready')
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function getRoomMediaAssetByIdFromBackend(id) {
  if (!canUseRoomMediaAssetPersistence() || typeof id !== 'string' || !id.trim()) {
    return null;
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      query GetRoomMediaAsset($id: ID!) {
        getRoomMediaAsset(id: $id) {
          id
          roomId
          kind
          storageKey
          fileName
          mimeType
          sizeBytes
          checksum
          createdBy
          createdAt
          updatedAt
          status
          width
          height
          durationSeconds
          inUseSurfaceIds
          inUseTv
        }
      }
    `,
    { id: id.trim() },
  );

  return normalizeRoomMediaAsset(response?.getRoomMediaAsset ?? null);
}

export async function getRoomMediaAssetByChecksumFromBackend(roomId, kind, checksum) {
  if (!canUseRoomMediaAssetPersistence() || !VALID_MEDIA_KINDS.has(kind) || typeof checksum !== 'string' || !checksum.trim()) {
    return null;
  }

  const normalizedChecksum = checksum.trim().toLowerCase();
  const assets = await listRoomMediaAssetItems(roomId, kind);
  return normalizeRoomMediaAsset(
    assets.find((asset) => {
      const assetChecksum = typeof asset?.checksum === 'string' ? asset.checksum.trim().toLowerCase() : '';
      const assetStatus = typeof asset?.status === 'string' ? asset.status.trim().toLowerCase() : '';
      return assetChecksum === normalizedChecksum && assetStatus === 'ready';
    }) ?? null,
  );
}

export async function getRoomMediaAssetByStorageKeyFromBackend(roomId, storageKey) {
  if (!canUseRoomMediaAssetPersistence() || typeof storageKey !== 'string' || !storageKey.trim()) {
    return null;
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      query ListRoomMediaAssetsByStorageKey($roomId: String!, $storageKey: String!) {
        listRoomMediaAssets(
          filter: {
            roomId: { eq: $roomId }
            storageKey: { eq: $storageKey }
            status: { eq: "ready" }
          }
          limit: 1
        ) {
          items {
            id
            roomId
            kind
            storageKey
            fileName
            mimeType
            sizeBytes
            checksum
            createdBy
            createdAt
            updatedAt
            status
            width
            height
            durationSeconds
            inUseSurfaceIds
            inUseTv
          }
        }
      }
    `,
    { roomId, storageKey: storageKey.trim() },
  );

  return normalizeRoomMediaAsset(response?.listRoomMediaAssets?.items?.[0] ?? null);
}

export async function createRoomMediaAssetInBackend(asset) {
  if (!canUseRoomMediaAssetPersistence()) {
    return null;
  }

  const normalized = normalizeRoomMediaAsset(asset);
  if (!normalized) {
    return null;
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      mutation CreateRoomMediaAsset($input: CreateRoomMediaAssetInput!) {
        createRoomMediaAsset(input: $input) {
          id
          roomId
          kind
          storageKey
          fileName
          mimeType
          sizeBytes
          checksum
          createdBy
          createdAt
          updatedAt
          status
          width
          height
          durationSeconds
          inUseSurfaceIds
          inUseTv
        }
      }
    `,
    {
      input: toRoomMediaAssetInput(normalized, false),
    },
  );

  return normalizeRoomMediaAsset(response?.createRoomMediaAsset ?? null);
}

export async function updateRoomMediaAssetInBackend(asset) {
  if (!canUseRoomMediaAssetPersistence()) {
    return null;
  }

  const normalized = normalizeRoomMediaAsset(asset);
  if (!normalized?.id) {
    return null;
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      mutation UpdateRoomMediaAsset($input: UpdateRoomMediaAssetInput!) {
        updateRoomMediaAsset(input: $input) {
          id
          roomId
          kind
          storageKey
          fileName
          mimeType
          sizeBytes
          checksum
          createdBy
          createdAt
          updatedAt
          status
          width
          height
          durationSeconds
          inUseSurfaceIds
          inUseTv
        }
      }
    `,
    {
      input: toRoomMediaAssetInput(normalized, true),
    },
  );

  return normalizeRoomMediaAsset(response?.updateRoomMediaAsset ?? null);
}

export async function deleteRoomMediaAssetFromBackend(id) {
  if (!canUseRoomMediaAssetPersistence() || typeof id !== 'string' || !id.trim()) {
    return false;
  }

  const response = await executeGraphql(
    /* GraphQL */ `
      mutation DeleteRoomMediaAsset($input: DeleteRoomMediaAssetInput!) {
        deleteRoomMediaAsset(input: $input) {
          id
        }
      }
    `,
    { input: { id: id.trim() } },
  );

  return Boolean(response?.deleteRoomMediaAsset?.id);
}

export async function deleteRoomMediaAssetsFromBackend(roomId) {
  if (!canUseRoomMediaAssetPersistence()) {
    return 0;
  }

  const items = await listRoomMediaAssetItems(roomId, null);
  let deletedCount = 0;
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!id) {
      continue;
    }
    if (await deleteRoomMediaAssetFromBackend(id)) {
      deletedCount += 1;
    }
  }
  return deletedCount;
}

export function summarizeRoomMediaUsage(assets) {
  const safeAssets = Array.isArray(assets) ? assets : [];
  let bytesUsed = 0;
  let assetCount = 0;
  for (const asset of safeAssets) {
    const normalized = normalizeRoomMediaAsset(asset);
    if (!normalized || normalized.status !== 'ready') {
      continue;
    }
    assetCount += 1;
    bytesUsed += normalized.sizeBytes;
  }
  return {
    bytesUsed,
    assetCount,
  };
}

async function listRoomMediaAssetItems(roomId, kind = null) {
  const items = [];
  let nextToken = null;

  do {
    const response = kind
      ? await executeGraphql(
        /* GraphQL */ `
          query ListRoomMediaAssetsByKind($roomId: String!, $kind: String!, $nextToken: String) {
            listRoomMediaAssets(
              filter: {
                roomId: { eq: $roomId }
                kind: { eq: $kind }
              }
              limit: 100
              nextToken: $nextToken
            ) {
              items {
                id
                roomId
                kind
                storageKey
                fileName
                mimeType
                sizeBytes
                checksum
                createdBy
                createdAt
                updatedAt
                status
                width
                height
                durationSeconds
                inUseSurfaceIds
                inUseTv
              }
              nextToken
            }
          }
        `,
        { roomId, kind, nextToken },
      )
      : await executeGraphql(
        /* GraphQL */ `
          query ListRoomMediaAssets($roomId: String!, $nextToken: String) {
            listRoomMediaAssets(
              filter: {
                roomId: { eq: $roomId }
              }
              limit: 100
              nextToken: $nextToken
            ) {
              items {
                id
                roomId
                kind
                storageKey
                fileName
                mimeType
                sizeBytes
                checksum
                createdBy
                createdAt
                updatedAt
                status
                width
                height
                durationSeconds
                inUseSurfaceIds
                inUseTv
              }
              nextToken
            }
          }
        `,
        { roomId, nextToken },
      );
    const payload = response?.listRoomMediaAssets ?? null;
    if (Array.isArray(payload?.items)) {
      items.push(...payload.items);
    }
    nextToken = typeof payload?.nextToken === 'string' && payload.nextToken ? payload.nextToken : null;
  } while (nextToken);

  return items;
}

function toRoomMediaAssetInput(asset, includeId) {
  const input = {
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
    inUseSurfaceIds: JSON.stringify(asset.inUseSurfaceIds),
    inUseTv: asset.inUseTv,
  };
  if (asset.width !== null && asset.width !== undefined) {
    input.width = asset.width;
  }
  if (asset.height !== null && asset.height !== undefined) {
    input.height = asset.height;
  }
  if (asset.durationSeconds !== null && asset.durationSeconds !== undefined) {
    input.durationSeconds = asset.durationSeconds;
  }
  if (includeId) {
    input.id = asset.id;
  }
  return input;
}

function normalizeRoomMediaAssetArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => normalizeRoomMediaAsset(entry)).filter(Boolean)
    : [];
}

function normalizeRoomMediaAsset(value) {
  const id = typeof value?.id === 'string' && value.id.trim() ? value.id.trim() : null;
  const roomId = typeof value?.roomId === 'string' && value.roomId.trim() ? value.roomId.trim() : null;
  const kind = typeof value?.kind === 'string' && VALID_MEDIA_KINDS.has(value.kind) ? value.kind : null;
  const storageKey = typeof value?.storageKey === 'string' && value.storageKey.trim() ? value.storageKey.trim() : null;
  const fileName = typeof value?.fileName === 'string' && value.fileName.trim() ? value.fileName.trim() : null;
  const mimeType = typeof value?.mimeType === 'string' && value.mimeType.trim() ? value.mimeType.trim() : null;
  const checksum = typeof value?.checksum === 'string' && value.checksum.trim() ? value.checksum.trim() : null;
  const createdBy = typeof value?.createdBy === 'string' && value.createdBy.trim() ? value.createdBy.trim() : null;
  const sizeBytes = Number(value?.sizeBytes);
  if (!roomId || !kind || !storageKey || !fileName || !mimeType || !checksum || !createdBy || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return null;
  }

  const createdAt = typeof value?.createdAt === 'string' && value.createdAt.trim()
    ? value.createdAt
    : new Date().toISOString();
  const updatedAt = typeof value?.updatedAt === 'string' && value.updatedAt.trim()
    ? value.updatedAt
    : createdAt;
  const status = typeof value?.status === 'string' && value.status.trim() ? value.status.trim() : 'ready';
  const inUseSurfaceIds = parseJsonStringArray(value?.inUseSurfaceIds);
  const width = Number(value?.width);
  const height = Number(value?.height);
  const durationSeconds = Number(value?.durationSeconds);

  return {
    id,
    roomId,
    kind,
    storageKey,
    fileName,
    mimeType,
    sizeBytes: Math.floor(sizeBytes),
    checksum,
    createdBy,
    createdAt,
    updatedAt,
    status,
    width: Number.isFinite(width) ? Math.floor(width) : null,
    height: Number.isFinite(height) ? Math.floor(height) : null,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    inUseSurfaceIds,
    inUseTv: Boolean(value?.inUseTv),
  };
}

function parseJsonStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim());
  }
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim())
      : [];
  } catch {
    return [];
  }
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
    console.error('[realtime] failed to load amplify outputs for room media asset repository', error);
    return {};
  }
}
