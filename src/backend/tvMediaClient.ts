import { uploadData } from 'aws-amplify/storage';

const MAX_TV_VIDEO_BYTES = 150 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4']);

export async function uploadRoomTvVideo(roomId: string, file: File): Promise<string> {
  validateTvVideo(file);
  const safeName = sanitizeFilename(file.name || 'tv-video.mp4');
  const path = `room-tv/${roomId}/${Date.now()}-${safeName}`;
  await uploadData({
    path,
    data: file,
    options: {
      contentType: file.type || 'video/mp4',
    },
  }).result;
  return path;
}

export function validateTvVideo(file: File): void {
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    throw new Error('Only MP4 videos are supported right now.');
  }
  if (file.size > MAX_TV_VIDEO_BYTES) {
    throw new Error('Videos must be 150MB or smaller right now.');
  }
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'tv-video.mp4';
}
