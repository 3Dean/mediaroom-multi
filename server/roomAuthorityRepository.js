import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
const roomTableName = process.env.REALTIME_ROOM_TABLE_NAME?.trim() || '';
const region = process.env.AWS_REGION?.trim() || outputs.data?.aws_region || outputs.auth?.aws_region || 'us-east-1';
const credentialsProvider = appsyncUrl || roomTableName ? defaultProvider() : null;
const appsyncSigner = appsyncUrl ? new SignatureV4({
  service: 'appsync',
  region,
  credentials: credentialsProvider,
  sha256: Sha256,
}) : null;
const dynamodbSigner = roomTableName ? new SignatureV4({
  service: 'dynamodb',
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

  if (roomTableName && dynamodbSigner) {
    return loadAuthorityFromDynamo(roomId);
  }

  const room = await findRoomRecordBySlugFromGraphql(roomId);
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

  if (roomTableName && dynamodbSigner) {
    return saveAuthorityToDynamo(roomId, authority, options);
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

export async function deleteRoomFromBackend(roomId, roomRecordId = null) {
  if (!canUseBackendPersistence()) {
    return false;
  }

  if (roomTableName && dynamodbSigner) {
    return deleteRoomFromDynamo(roomId, roomRecordId);
  }

  const roomRecordIds = roomRecordId
    ? [roomRecordId]
    : await findRoomRecordIds(roomId);
  if (roomRecordIds.length === 0) {
    return false;
  }

  let deletedCount = 0;
  for (const id of roomRecordIds) {
    const response = await executeGraphql(
      /* GraphQL */ `
        mutation DeleteRoom($input: DeleteRoomInput!) {
          deleteRoom(input: $input) {
            id
          }
        }
      `,
      {
        input: {
          id,
        },
      },
    );

    if (response?.deleteRoom?.id) {
      deletedCount += 1;
    }
  }

  return deletedCount > 0;
}

export function canUseBackendPersistence() {
  return Boolean((roomTableName && dynamodbSigner) || (appsyncUrl && appsyncSigner));
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

async function findRoomRecordId(roomId) {
  const existing = await loadAuthorityFromBackend(roomId);
  return existing?.roomRecordId ?? null;
}

async function findRoomRecordIds(roomId) {
  if (roomTableName && dynamodbSigner) {
    const records = await listRoomRecordsFromDynamo(roomId);
    return records.map((record) => record.id).filter(Boolean);
  }

  const records = await listRoomRecordsBySlugFromGraphql(roomId);
  return records.map((record) => record.id).filter(Boolean);
}

async function findRoomRecordBySlugFromGraphql(roomId) {
  const records = await listRoomRecordsBySlugFromGraphql(roomId);
  return records[0] ?? null;
}

async function listRoomRecordsBySlugFromGraphql(roomId) {
  const records = [];
  let nextToken = null;

  do {
    const response = await executeGraphql(
      /* GraphQL */ 
      `        query ListRoomsBySlug($slug: String!, $nextToken: String) {
          listRooms(filter: { slug: { eq: $slug } }, limit: 100, nextToken: $nextToken) {
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
            nextToken
          }
        }
      `      ,
      { slug: roomId, nextToken },
    );

    const payload = response?.listRooms ?? null;
    if (Array.isArray(payload?.items)) {
      for (const item of payload.items) {
        if (typeof item?.id === 'string' && item.id && typeof item?.slug === 'string' && item.slug === roomId) {
          records.push(item);
        }
      }
    }

    nextToken = typeof payload?.nextToken === 'string' && payload.nextToken ? payload.nextToken : null;
  } while (nextToken);

  return records;
}

async function executeGraphql(query, variables) {
  if (!appsyncUrl || !appsyncSigner) {
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

  const signed = await appsyncSigner.sign(request);
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

async function loadAuthorityFromDynamo(roomId) {
  const room = await fetchRoomRecordFromDynamo(roomId, true);
  if (!room) {
    return null;
  }

  return normalizeAuthority({
    ownerUserId: readStringAttribute(room.createdBy),
    adminUserIds: readStringListAttribute(room.adminUserIds),
    mutedUserIds: readStringListAttribute(room.mutedUserIds),
    isLocked: readBooleanAttribute(room.isLocked),
    roomRecordId: readStringAttribute(room.id),
  });
}

async function saveAuthorityToDynamo(roomId, authority, options = {}) {
  const normalized = normalizeAuthority(authority);
  const roomRecord = await ensureRoomRecordInDynamo(roomId, normalized.ownerUserId, options.maxUsers ?? 8);
  if (!roomRecord?.id) {
    return null;
  }

  await executeDynamoRequest('DynamoDB_20120810.UpdateItem', {
    TableName: roomTableName,
    Key: {
      id: { S: roomRecord.id },
    },
    UpdateExpression: 'SET isLocked = :isLocked, adminUserIds = :adminUserIds, mutedUserIds = :mutedUserIds, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':isLocked': { BOOL: normalized.isLocked },
      ':adminUserIds': { L: normalized.adminUserIds.map((entry) => ({ S: entry })) },
      ':mutedUserIds': { L: normalized.mutedUserIds.map((entry) => ({ S: entry })) },
      ':updatedAt': { S: new Date().toISOString() },
    },
  });

  return normalizeAuthority({
    ownerUserId: roomRecord.createdBy,
    adminUserIds: normalized.adminUserIds,
    mutedUserIds: normalized.mutedUserIds,
    isLocked: normalized.isLocked,
    roomRecordId: roomRecord.id,
  });
}

async function ensureRoomRecordInDynamo(roomId, ownerUserId, maxUsers) {
  if (!ownerUserId) {
    return null;
  }

  const existing = await fetchRoomRecordFromDynamo(roomId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const item = {
    id: { S: id },
    slug: { S: roomId },
    name: { S: roomId.slice(0, MAX_ROOM_NAME_LENGTH) },
    createdBy: { S: ownerUserId },
    maxUsers: { N: String(maxUsers) },
    isPrivate: { BOOL: false },
    isLocked: { BOOL: false },
    adminUserIds: { L: [] },
    mutedUserIds: { L: [] },
    createdAt: { S: now },
    updatedAt: { S: now },
    __typename: { S: 'Room' },
  };

  try {
    await executeDynamoRequest('DynamoDB_20120810.PutItem', {
      TableName: roomTableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(id)',
    });
    return {
      id,
      createdBy: ownerUserId,
    };
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return fetchRoomRecordFromDynamo(roomId);
    }
    throw error;
  }
}

async function fetchRoomRecordFromDynamo(roomId, includeFullItem = false) {
  const records = await listRoomRecordsFromDynamo(roomId, includeFullItem);
  return records[0] ?? null;
}

async function listRoomRecordsFromDynamo(roomId, includeFullItem = false) {
  const records = [];
  let exclusiveStartKey = undefined;

  do {
    const response = await executeDynamoRequest('DynamoDB_20120810.Scan', {
      TableName: roomTableName,
      FilterExpression: '#slug = :slug',
      ExpressionAttributeNames: {
        '#slug': 'slug',
      },
      ExpressionAttributeValues: {
        ':slug': { S: roomId },
      },
      Limit: 100,
      ExclusiveStartKey: exclusiveStartKey,
    });

    if (Array.isArray(response?.Items)) {
      for (const item of response.Items) {
        if (readStringAttribute(item?.slug) !== roomId) {
          continue;
        }
        if (includeFullItem) {
          records.push(item);
          continue;
        }
        const id = readStringAttribute(item.id);
        if (!id) {
          continue;
        }
        records.push({
          id,
          createdBy: readStringAttribute(item.createdBy),
        });
      }
    }

    exclusiveStartKey = response?.LastEvaluatedKey ?? undefined;
  } while (exclusiveStartKey);

  return records;
}

async function deleteRoomFromDynamo(roomId, roomRecordId = null) {
  const recordIds = roomRecordId
    ? [roomRecordId]
    : (await listRoomRecordsFromDynamo(roomId)).map((record) => record.id).filter(Boolean);

  if (recordIds.length === 0) {
    return false;
  }

  let deletedCount = 0;
  for (const id of recordIds) {
    await executeDynamoRequest('DynamoDB_20120810.DeleteItem', {
      TableName: roomTableName,
      Key: {
        id: { S: id },
      },
    });
    deletedCount += 1;
  }

  return deletedCount > 0;
}

async function executeDynamoRequest(target, payload) {
  if (!roomTableName || !dynamodbSigner) {
    return null;
  }

  const endpoint = `https://dynamodb.${region}.amazonaws.com/`;
  const body = JSON.stringify(payload);
  const request = new HttpRequest({
    method: 'POST',
    protocol: 'https:',
    hostname: `dynamodb.${region}.amazonaws.com`,
    path: '/',
    headers: {
      'content-type': 'application/x-amz-json-1.0',
      'x-amz-target': target,
      host: `dynamodb.${region}.amazonaws.com`,
    },
    body,
  });

  const signed = await dynamodbSigner.sign(request);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: signed.headers,
    body,
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {}

  if (!response.ok) {
    throw new Error(parsed?.message || parsed?.__message || `DynamoDB request failed with status ${response.status}`);
  }

  return parsed;
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

function readStringAttribute(attribute) {
  return typeof attribute?.S === 'string' ? attribute.S : null;
}

function readBooleanAttribute(attribute) {
  return Boolean(attribute?.BOOL);
}

function readStringListAttribute(attribute) {
  return Array.isArray(attribute?.L)
    ? attribute.L.map((entry) => entry?.S).filter((entry) => typeof entry === 'string')
    : [];
}

function isConditionalCheckFailure(error) {
  return error instanceof Error && /ConditionalCheckFailed/i.test(error.message);
}


