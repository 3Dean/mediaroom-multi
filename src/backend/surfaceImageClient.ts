import { uploadData } from 'aws-amplify/storage';
import type { RoomSurfaceId } from '../types/room';

const MAX_SURFACE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadRoomSurfaceImage(roomId: string, surfaceId: RoomSurfaceId, file: File): Promise<string> {
  validateSurfaceImage(file);
  const safeName = sanitizeFilename(file.name || `${surfaceId}.png`);
  const path = `room-surfaces/${roomId}/${surfaceId}/${Date.now()}-${safeName}`;
  await uploadData({
    path,
    data: file,
    options: {
      contentType: file.type,
    },
  }).result;
  return path;
}

export function validateSurfaceImage(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Only PNG, JPG, or WebP images are supported.');
  }
  if (file.size > MAX_SURFACE_IMAGE_BYTES) {
    throw new Error('Images must be 5MB or smaller.');
  }
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'surface-image';
}
