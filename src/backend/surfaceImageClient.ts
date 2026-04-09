import type { RoomSurfaceId } from '../types/room';
import { getRealtimeApiUrl } from './realtimeApiClient';
import { computeFileChecksum, uploadAuthorizedFile } from './mediaUploadClientUtils';
import { finalizeRoomMediaUpload } from './roomMediaClient';

const MAX_SURFACE_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type AuthorizedUploadResponse = {
  ok: true;
  mode: 'upload' | 'reuse';
  upload?: {
    uploadId: string;
    objectKey: string;
    uploadUrl: string;
    uploadHeaders?: Record<string, string>;
  };
  asset?: {
    id: string;
    storageKey: string;
  };
};

export async function uploadRoomSurfaceImage(
  roomId: string,
  surfaceId: RoomSurfaceId,
  file: File,
  token: string,
): Promise<{ assetId: string; objectKey: string }> {
  validateSurfaceImage(file);

  const authorization = await authorizeSurfaceUpload(roomId, surfaceId, file, token);

  if (authorization.mode === 'reuse' && authorization.asset?.id && authorization.asset.storageKey) {
    return {
      assetId: authorization.asset.id,
      objectKey: authorization.asset.storageKey,
    };
  }

  if (!authorization.upload?.uploadId || !authorization.upload.objectKey || !authorization.upload.uploadUrl) {
    throw new Error('Unable to authorize that image upload right now.');
  }

  await uploadAuthorizedFile(file, authorization.upload.uploadUrl, authorization.upload.uploadHeaders);
  const finalized = await finalizeRoomMediaUpload(roomId, authorization.upload.uploadId, token);

  return {
    assetId: finalized.asset.id,
    objectKey: finalized.asset.storageKey,
  };
}

export function validateSurfaceImage(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Only PNG, JPG, or WebP images are supported.');
  }
  if (file.size > MAX_SURFACE_IMAGE_BYTES) {
    throw new Error('Images must be 10MB or smaller.');
  }
}

async function authorizeSurfaceUpload(
  roomId: string,
  surfaceId: RoomSurfaceId,
  file: File,
  token: string,
): Promise<AuthorizedUploadResponse> {
  const checksum = await computeFileChecksum(file);
  const response = await fetch(getRealtimeApiUrl('/api/uploads/surface-authorize'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      roomId,
      surfaceId,
      fileName: file.name || `${surfaceId}.png`,
      contentType: file.type,
      contentLength: file.size,
      checksum,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || (payload?.mode !== 'upload' && payload?.mode !== 'reuse')) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'Unable to authorize that image upload right now.');
  }
  return payload as AuthorizedUploadResponse;
}
