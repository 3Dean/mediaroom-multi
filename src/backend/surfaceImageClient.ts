import type { RoomSurfaceId } from '../types/room';
import { getRealtimeApiUrl } from './realtimeApiClient';

const MAX_SURFACE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type AuthorizedUploadResponse = {
  ok: true;
  upload: {
    uploadId: string;
    objectKey: string;
    uploadUrl: string;
    uploadHeaders?: Record<string, string>;
  };
};

export async function uploadRoomSurfaceImage(
  roomId: string,
  surfaceId: RoomSurfaceId,
  file: File,
  token: string,
): Promise<{ uploadId: string; objectKey: string }> {
  validateSurfaceImage(file);

  const authorization = await authorizeSurfaceUpload(roomId, surfaceId, file, token);
  await uploadAuthorizedFile(file, authorization.upload.uploadUrl, authorization.upload.uploadHeaders);

  return {
    uploadId: authorization.upload.uploadId,
    objectKey: authorization.upload.objectKey,
  };
}

export function validateSurfaceImage(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Only PNG, JPG, or WebP images are supported.');
  }
  if (file.size > MAX_SURFACE_IMAGE_BYTES) {
    throw new Error('Images must be 5MB or smaller.');
  }
}

async function authorizeSurfaceUpload(
  roomId: string,
  surfaceId: RoomSurfaceId,
  file: File,
  token: string,
): Promise<AuthorizedUploadResponse> {
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
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.upload?.uploadId || !payload?.upload?.objectKey || !payload?.upload?.uploadUrl) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'Unable to authorize that image upload right now.');
  }
  return payload as AuthorizedUploadResponse;
}

async function uploadAuthorizedFile(file: File, uploadUrl: string, uploadHeaders: Record<string, string> | undefined): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      ...(uploadHeaders ?? {}),
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Image upload failed with status ${response.status}.`);
  }
}
