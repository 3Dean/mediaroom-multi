import { getRealtimeApiUrl } from './realtimeApiClient';

const MAX_TV_VIDEO_BYTES = 150 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4']);

type AuthorizedUploadResponse = {
  ok: true;
  upload: {
    uploadId: string;
    objectKey: string;
    uploadUrl: string;
    uploadHeaders?: Record<string, string>;
  };
};

export async function uploadRoomTvVideo(
  roomId: string,
  file: File,
  token: string,
): Promise<{ uploadId: string; objectKey: string }> {
  validateTvVideo(file);

  const authorization = await authorizeTvUpload(roomId, file, token);
  await uploadAuthorizedFile(file, authorization.upload.uploadUrl, authorization.upload.uploadHeaders);

  return {
    uploadId: authorization.upload.uploadId,
    objectKey: authorization.upload.objectKey,
  };
}

export function validateTvVideo(file: File): void {
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    throw new Error('Only MP4 videos are supported right now.');
  }
  if (file.size > MAX_TV_VIDEO_BYTES) {
    throw new Error('Videos must be 150MB or smaller right now.');
  }
}

async function authorizeTvUpload(roomId: string, file: File, token: string): Promise<AuthorizedUploadResponse> {
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
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.upload?.uploadId || !payload?.upload?.objectKey || !payload?.upload?.uploadUrl) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'Unable to authorize that TV upload right now.');
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
    throw new Error(`Video upload failed with status ${response.status}.`);
  }
}
