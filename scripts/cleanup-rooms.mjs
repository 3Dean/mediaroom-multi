import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import {
  loadFallbackAuthorityStore,
  persistFallbackAuthorityStore,
} from '../server/roomAuthorityRepository.js';
import { deleteSurfaceSnapshotsFromBackend } from '../server/roomSurfaceRepository.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '..');
const outputs = loadAmplifyOutputs();
const appsyncUrl = process.env.REALTIME_APPSYNC_URL?.trim() || outputs.data?.url || '';
const region = process.env.AWS_REGION?.trim() || outputs.data?.aws_region || outputs.auth?.aws_region || 'us-east-1';
const appsyncAuthToken = process.env.APPSYNC_AUTH_TOKEN?.trim() || '';
const storageBucketName = process.env.REALTIME_STORAGE_BUCKET_NAME?.trim()
  || outputs.storage?.bucket_name
  || outputs.storage?.buckets?.[0]?.bucket_name
  || '';
const credentials = appsyncUrl || storageBucketName ? defaultProvider() : null;
const appsyncSigner = appsyncUrl && credentials
  ? new SignatureV4({
      service: 'appsync',
      region,
      credentials,
      sha256: Sha256,
    })
  : null;
const storageClient = storageBucketName && credentials
  ? new S3Client({
      region,
      credentials,
    })
  : null;

const options = parseArgs(process.argv.slice(2));

if (options.help || options.roomIds.length === 0) {
  printUsage();
  process.exit(options.help ? 0 : 1);
}

if (!options.dryRun && !options.confirm) {
  console.error('Refusing to delete rooms without --yes. Use --dry-run first if needed.');
  printUsage();
  process.exit(1);
}

const fallbackStore = loadFallbackAuthorityStore();
const fallbackEntries = new Map(Object.entries(fallbackStore));
let changedFallbackStore = false;
let hadFailures = false;

for (const roomId of options.roomIds) {
  console.log(`\n=== ${roomId} ===`);
  try {
    const summary = await inspectRoom(roomId);
    printSummary(summary);

    if (options.dryRun) {
      continue;
    }

    const result = await deleteRoomData(roomId, summary);
    if (fallbackEntries.delete(roomId)) {
      changedFallbackStore = true;
    }
    printResult(result);
  } catch (error) {
    hadFailures = true;
    console.error(`Failed to clean ${roomId}: ${formatError(error)}`);
  }
}

if (!options.dryRun && changedFallbackStore) {
  persistFallbackAuthorityStore(fallbackEntries);
  console.log('\nUpdated fallback authority store.');
}

if (hadFailures) {
  process.exitCode = 1;
}

async function inspectRoom(roomId) {
  const roomRecords = await listRoomRecordsBySlug(roomId).catch(() => []);
  const roomMessages = await listModelIdsByRoom('RoomMessage', roomId).catch(() => []);
  const roomSeatSnapshots = await listModelIdsByRoom('RoomSeatSnapshot', roomId).catch(() => []);
  const roomObjectSnapshots = await listModelIdsByRoom('RoomObjectSnapshot', roomId).catch(() => []);
  const roomSurfaceSnapshots = await listModelIdsByRoom('RoomSurfaceSnapshot', roomId).catch(() => []);
  const surfaceObjects = await listStorageKeys(`room-surfaces/${roomId}/`).catch(() => []);
  const tvObjects = await listStorageKeys(`room-tv/${roomId}/`).catch(() => []);

  return {
    roomId,
    roomRecordId: roomRecords[0]?.id ?? null,
    ownerUserId: roomRecords[0]?.createdBy ?? null,
    fallbackAuthority: fallbackEntries.has(roomId),
    counts: {
      roomRecords: roomRecords.length,
      roomMessages: roomMessages.length,
      roomSeatSnapshots: roomSeatSnapshots.length,
      roomObjectSnapshots: roomObjectSnapshots.length,
      roomSurfaceSnapshots: roomSurfaceSnapshots.length,
      surfaceObjects: surfaceObjects.length,
      tvObjects: tvObjects.length,
    },
    ids: {
      roomRecords: roomRecords.map((record) => record.id),
      roomMessages,
      roomSeatSnapshots,
      roomObjectSnapshots,
    },
  };
}

async function deleteRoomData(roomId, summary) {
  const deleted = {
    roomRecords: 0,
    roomMessages: 0,
    roomSeatSnapshots: 0,
    roomObjectSnapshots: 0,
    roomSurfaceSnapshots: 0,
    surfaceObjects: 0,
    tvObjects: 0,
    roomRecord: false,
    fallbackAuthority: fallbackEntries.has(roomId),
    warnings: [],
  };

  deleted.roomRecords = await tryDelete(
    () => deleteRoomRecordIds(summary.ids.roomRecords),
    deleted,
    'roomRecords',
  );
  deleted.roomMessages = await tryDelete(
    () => deleteModelIds('RoomMessage', summary.ids.roomMessages),
    deleted,
    'roomMessages',
  );
  deleted.roomSeatSnapshots = await tryDelete(
    () => deleteModelIds('RoomSeatSnapshot', summary.ids.roomSeatSnapshots),
    deleted,
    'roomSeatSnapshots',
  );
  deleted.roomObjectSnapshots = await tryDelete(
    () => deleteModelIds('RoomObjectSnapshot', summary.ids.roomObjectSnapshots),
    deleted,
    'roomObjectSnapshots',
  );
  deleted.roomSurfaceSnapshots = await tryDelete(
    () => deleteSurfaceSnapshotsFromBackend(roomId),
    deleted,
    'roomSurfaceSnapshots',
  );
  deleted.surfaceObjects = await tryDelete(
    () => deleteStoragePrefix(`room-surfaces/${roomId}/`),
    deleted,
    'surfaceObjects',
  );
  deleted.tvObjects = await tryDelete(
    () => deleteStoragePrefix(`room-tv/${roomId}/`),
    deleted,
    'tvObjects',
  );
  deleted.roomRecord = deleted.roomRecords > 0;

  return deleted;
}

async function tryDelete(action, result, label) {
  try {
    return await action();
  } catch (error) {
    result.warnings.push(`${label}: ${formatError(error)}`);
    return label === 'roomRecord' ? false : 0;
  }
}

async function listModelIdsByRoom(modelName, roomId) {
  if (!appsyncUrl || !appsyncSigner) {
    return [];
  }

  const config = getModelConfig(modelName);
  const ids = [];
  let nextToken = null;

  do {
    const response = await executeGraphql(
      /* GraphQL */ `
        query ListByRoom($roomId: String!, $nextToken: String) {
          ${config.listField}(filter: { roomId: { eq: $roomId } }, limit: 100, nextToken: $nextToken) {
            items {
              id
            }
            nextToken
          }
        }
      `,
      { roomId, nextToken },
    );
    const payload = response?.[config.listField] ?? null;
    if (Array.isArray(payload?.items)) {
      for (const item of payload.items) {
        if (typeof item?.id === 'string' && item.id) {
          ids.push(item.id);
        }
      }
    }
    nextToken = typeof payload?.nextToken === 'string' && payload.nextToken ? payload.nextToken : null;
  } while (nextToken);

  return ids;
}

async function listRoomRecordsBySlug(roomId) {
  if (!appsyncUrl || !appsyncSigner) {
    return [];
  }

  const records = [];
  let nextToken = null;

  do {
    const response = await executeGraphql(
      /* GraphQL */ `
        query ListRoomsBySlug($slug: String!, $nextToken: String) {
          listRooms(filter: { slug: { eq: $slug } }, limit: 100, nextToken: $nextToken) {
            items {
              id
              slug
              name
              createdBy
            }
            nextToken
          }
        }
      `,
      { slug: roomId, nextToken },
    );

    const payload = response?.listRooms ?? null;
    if (Array.isArray(payload?.items)) {
      for (const item of payload.items) {
        if (typeof item?.id === 'string' && item.id) {
          records.push({
            id: item.id,
            slug: typeof item.slug === 'string' ? item.slug : '',
            name: typeof item.name === 'string' ? item.name : '',
            createdBy: typeof item.createdBy === 'string' ? item.createdBy : null,
          });
        }
      }
    }
    nextToken = typeof payload?.nextToken === 'string' && payload.nextToken ? payload.nextToken : null;
  } while (nextToken);

  return records;
}

async function deleteModelIds(modelName, ids) {
  if (!appsyncUrl || !appsyncSigner || ids.length === 0) {
    return 0;
  }

  const config = getModelConfig(modelName);
  let deleted = 0;
  for (const id of ids) {
    const response = await executeGraphql(
      /* GraphQL */ `
        mutation DeleteById($input: Delete${config.modelName}Input!) {
          ${config.deleteField}(input: $input) {
            id
          }
        }
      `,
      { input: { id } },
    );
    if (response?.[config.deleteField]?.id) {
      deleted += 1;
    }
  }
  return deleted;
}

async function deleteRoomRecordIds(ids) {
  if (!appsyncUrl || !appsyncSigner || ids.length === 0) {
    return 0;
  }

  let deleted = 0;
  for (const id of ids) {
    const response = await executeGraphql(
      /* GraphQL */ `
        mutation DeleteRoomById($input: DeleteRoomInput!) {
          deleteRoom(input: $input) {
            id
          }
        }
      `,
      { input: { id } },
    );
    if (response?.deleteRoom?.id) {
      deleted += 1;
    }
  }
  return deleted;
}

async function listStorageKeys(prefix) {
  if (!storageClient || !storageBucketName) {
    return [];
  }
  const keys = [];
  let continuationToken = undefined;
  do {
    const response = await storageClient.send(new ListObjectsV2Command({
      Bucket: storageBucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    if (Array.isArray(response.Contents)) {
      for (const entry of response.Contents) {
        if (typeof entry?.Key === 'string' && entry.Key) {
          keys.push(entry.Key);
        }
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function deleteStoragePrefix(prefix) {
  if (!storageClient || !storageBucketName) {
    return 0;
  }

  const keys = await listStorageKeys(prefix);
  if (keys.length === 0) {
    return 0;
  }

  let deleted = 0;
  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    await storageClient.send(new DeleteObjectsCommand({
      Bucket: storageBucketName,
      Delete: {
        Objects: batch.map((Key) => ({ Key })),
        Quiet: true,
      },
    }));
    deleted += batch.length;
  }

  return deleted;
}

async function executeGraphql(query, variables) {
  if (!appsyncUrl || (!appsyncSigner && !appsyncAuthToken)) {
    return null;
  }

  const body = JSON.stringify({ query, variables });
  let response;
  if (appsyncAuthToken) {
    response = await fetch(appsyncUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: appsyncAuthToken,
      },
      body,
    });
  } else {
    const endpoint = new URL(appsyncUrl);
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
    response = await fetch(appsyncUrl, {
      method: 'POST',
      headers: signed.headers,
      body,
    });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AppSync request failed with status ${response.status}${text ? `: ${text}` : ''}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors.map((entry) => entry.message).join('; '));
  }

  return payload.data ?? null;
}

function getModelConfig(modelName) {
  switch (modelName) {
    case 'RoomMessage':
      return { modelName, listField: 'listRoomMessages', deleteField: 'deleteRoomMessage' };
    case 'RoomSeatSnapshot':
      return { modelName, listField: 'listRoomSeatSnapshots', deleteField: 'deleteRoomSeatSnapshot' };
    case 'RoomObjectSnapshot':
      return { modelName, listField: 'listRoomObjectSnapshots', deleteField: 'deleteRoomObjectSnapshot' };
    case 'RoomSurfaceSnapshot':
      return { modelName, listField: 'listRoomSurfaceSnapshots', deleteField: 'deleteRoomSurfaceSnapshot' };
    default:
      throw new Error(`Unsupported model ${modelName}`);
  }
}

function parseArgs(argv) {
  const roomIds = [];
  let dryRun = false;
  let confirm = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--yes') {
      confirm = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    roomIds.push(arg.trim());
  }

  return {
    roomIds: roomIds.filter(Boolean),
    dryRun,
    confirm,
    help,
  };
}

function printUsage() {
  console.log(`Usage:
  node scripts/cleanup-rooms.mjs <room-slug> [more-room-slugs...] --dry-run
  node scripts/cleanup-rooms.mjs <room-slug> [more-room-slugs...] --yes

Options:
  --dry-run   Inspect matching room data without deleting anything
  --yes       Confirm destructive deletion
  --help      Show this message

Environment:
  APPSYNC_AUTH_TOKEN   Optional Cognito/AppSync bearer token. When set, the script
                       uses user-pool auth for GraphQL room queries/deletes instead
                       of server-side IAM.
`);
}

function printSummary(summary) {
  console.log(`roomRecordId: ${summary.roomRecordId ?? 'none'}`);
  console.log(`ownerUserId: ${summary.ownerUserId ?? 'none'}`);
  console.log(`fallbackAuthority: ${summary.fallbackAuthority ? 'yes' : 'no'}`);
  Object.entries(summary.counts).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
}

function printResult(result) {
  console.log('Deleted:');
  Object.entries(result).forEach(([key, value]) => {
    if (key === 'warnings') {
      return;
    }
    console.log(`  ${key}: ${typeof value === 'boolean' ? (value ? 'yes' : 'no') : value}`);
  });
  if (result.warnings.length > 0) {
    console.log('Warnings:');
    result.warnings.forEach((warning) => {
      console.log(`  ${warning}`);
    });
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function loadAmplifyOutputs() {
  try {
    const filePath = join(repoRoot, 'amplify_outputs.json');
    if (!existsSync(filePath)) {
      return {};
    }
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('[cleanup-rooms] failed to load amplify outputs', error);
    return {};
  }
}
