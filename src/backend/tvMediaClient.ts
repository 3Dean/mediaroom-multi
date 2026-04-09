import { getRealtimeApiUrl } from './realtimeApiClient';
import { computeFileChecksum, uploadAuthorizedFile } from './mediaUploadClientUtils';
import { finalizeRoomMediaUpload } from './roomMediaClient';

const MAX_TV_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4']);

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

export async function uploadRoomTvVideo(
  roomId: string,
  file: File,
  token: string,
): Promise<{ assetId: string; objectKey: string }> {
  validateTvVideo(file);

  const authorization = await authorizeTvUpload(roomId, file, token);
  if (authorization.mode === 'reuse' && authorization.asset?.id && authorization.asset.storageKey) {
    return {
      assetId: authorization.asset.id,
      objectKey: authorization.asset.storageKey,
    };
  }

  if (!authorization.upload?.uploadId || !authorization.upload.objectKey || !authorization.upload.uploadUrl) {
    throw new Error('Unable to authorize that TV upload right now.');
  }

  await uploadAuthorizedFile(file, authorization.upload.uploadUrl, authorization.upload.uploadHeaders);
  const finalized = await finalizeRoomMediaUpload(roomId, authorization.upload.uploadId, token);

  return {
    assetId: finalized.asset.id,
    objectKey: finalized.asset.storageKey,
  };
}

export function validateTvVideo(file: File): void {
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    throw new Error('Only MP4 videos are supported right now.');
  }
  if (file.size > MAX_TV_VIDEO_BYTES) {
    throw new Error('Videos must be 100MB or smaller right now.');
  }
}

async function authorizeTvUpload(roomId: string, file: File, token: string): Promise<AuthorizedUploadResponse> {
  const checksum = await computeFileChecksum(file);
  const response = await fetch(getRealtimeApiUrl('/api/uploads/tv-authorize'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      roomId,
      fileName: file.name || 'tv-video.mp4',
      contentType: file.type || 'video/mp4',
      contentLength: file.size,
      checksum,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || (payload?.mode !== 'upload' && payload?.mode !== 'reuse')) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'Unable to authorize that TV upload right now.');
  }
  return payload as AuthorizedUploadResponse;
}
