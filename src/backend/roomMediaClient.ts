import { getRealtimeApiUrl } from './realtimeApiClient';
import type { RoomMediaAsset, RoomMediaAssetKind, RoomMediaUsage } from '../types/room';

type ListRoomMediaResponse = {
  ok: true;
  assets: RoomMediaAsset[];
  usage: RoomMediaUsage;
};

type FinalizeRoomMediaResponse = {
  ok: true;
  asset: RoomMediaAsset;
  usage: RoomMediaUsage;
};

export async function listRoomMediaAssets(
  roomId: string,
  token: string,
  kind?: RoomMediaAssetKind,
): Promise<{ assets: RoomMediaAsset[]; usage: RoomMediaUsage }> {
  const url = new URL(getRealtimeApiUrl('/api/rooms/media'), window.location.origin);
  url.searchParams.set('roomId', roomId);
  if (kind) {
    url.searchParams.set('kind', kind);
  }

  const response = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.assets) || !payload?.usage) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'Unable to load room media right now.');
  }

  return payload as ListRoomMediaResponse;
}

export async function finalizeRoomMediaUpload(
  roomId: string,
  uploadId: string,
  token: string,
): Promise<{ asset: RoomMediaAsset; usage: RoomMediaUsage }> {
  const response = await fetch(getRealtimeApiUrl('/api/uploads/media-finalize'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      roomId,
      uploadId,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.asset || !payload?.usage) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'Unable to finalize that room media upload right now.');
  }

  return payload as FinalizeRoomMediaResponse;
}

export async function deleteRoomMediaAsset(
  roomId: string,
  assetId: string,
  token: string,
): Promise<{ usage: RoomMediaUsage }> {
  const response = await fetch(getRealtimeApiUrl('/api/rooms/media/delete'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      roomId,
      assetId,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.usage) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'Unable to delete that room media asset right now.');
  }

  return payload as { usage: RoomMediaUsage };
}
