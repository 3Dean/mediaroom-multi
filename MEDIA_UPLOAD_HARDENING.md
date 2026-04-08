# Shared Media Upload Hardening

This note captures the current shared-media upload behavior and the recommended cleanup/rollout plan before switching to a server-authorized upload flow.

## Current Behavior

### Shared surfaces

- Upload entry point: [`src/backend/surfaceImageClient.ts`](src/backend/surfaceImageClient.ts)
- Client validation:
  - allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
  - max size: `5 MB`
- Storage key format:
  - `room-surfaces/{roomId}/{surfaceId}/{timestamp}-{safeName}`
- Room update path:
  - client uploads to storage first
  - client sends websocket `admin.setSurfaceImage`
  - server validates signed-in owner/admin before attaching `imagePath` to room state

### Shared TV video

- Upload entry point: [`src/backend/tvMediaClient.ts`](src/backend/tvMediaClient.ts)
- Client validation:
  - allowed MIME types: `video/mp4`
  - max size: `150 MB`
- Storage key format:
  - `room-tv/{roomId}/{timestamp}-{safeName}`
- Room update path:
  - client uploads to storage first
  - client sends websocket `admin.setTvMedia`
  - server validates signed-in owner/admin before attaching `sourceUrl` to room state

### Storage access

- Storage rules live in [`amplify/storage/resource.ts`](amplify/storage/resource.ts)
- Current rules:
  - `room-surfaces/*`
    - guest: `read`
    - authenticated: `read`, `write`, `delete`
  - `room-tv/*`
    - guest: `read`
    - authenticated: `read`, `write`, `delete`

### Media read path

- Stored object keys are resolved on the client via Amplify Storage `getUrl()`
- Current resolver: [`src/app/initializeApp.ts`](src/app/initializeApp.ts)
- Backward compatibility matters: existing persisted `imagePath` / `sourceUrl` values are storage object keys, not public URLs

## Current Gaps

1. Bucket permissions are broader than room permissions.
   Any authenticated user can currently write/delete under shared media prefixes, even if they are not owner/admin of the room.

2. File limits are enforced only by the normal client.
   The realtime server validates role before applying media to room state, but does not enforce MIME/size at upload time.

3. Unauthorized or abandoned uploads can leave orphaned objects.
   Upload happens before the websocket room-state update is accepted.

4. Room deletion removes room records and surface snapshot records, but does not currently remove storage objects for shared surfaces or shared TV media.

5. Surface replacement and TV replacement do not currently delete previously referenced storage objects.

## Inventory Of Storage Touchpoints

### Write paths

- surface upload: [`src/backend/surfaceImageClient.ts`](src/backend/surfaceImageClient.ts)
- TV upload: [`src/backend/tvMediaClient.ts`](src/backend/tvMediaClient.ts)

### Read paths

- storage URL resolution: [`src/app/initializeApp.ts`](src/app/initializeApp.ts)
- surface application: [`src/app/scene/surfaceFeature.ts`](src/app/scene/surfaceFeature.ts)
- TV playback state sync uses persisted `sourceUrl` from room snapshot: [`src/app/bootstrap.ts`](src/app/bootstrap.ts)

### Persistence paths

- surface snapshot persistence: [`server/roomSurfaceRepository.js`](server/roomSurfaceRepository.js)
- room deletion removes surface snapshot records: [`server/index.js`](server/index.js)
- TV media is not persisted to backend storage metadata today; it is in-memory room state only

### Existing delete paths

- saved room delete endpoint: [`server/index.js`](server/index.js)
- room delete client: [`src/backend/dataClient.ts`](src/backend/dataClient.ts)
- no storage object delete helper currently exists for shared media assets

## Cleanup Decisions Before Step 1

### 1. Backward compatibility

Keep all existing stored keys working as-is.

- Do not rewrite existing `imagePath` / `sourceUrl` values
- New authorized uploads should continue to produce keys under:
  - `room-surfaces/{roomId}/...`
  - `room-tv/{roomId}/...`
- Existing readers can continue to use Amplify Storage `getUrl({ path })`

### 2. Upload authorization model

Use server-issued, short-lived presigned `PUT` uploads.

- browser asks server for upload authorization
- server checks auth + room role + room eligibility
- server returns:
  - upload intent id
  - storage key
  - presigned `PUT` URL
  - required content type
  - expiration time
- browser uploads directly to S3 using the presigned URL
- browser then submits the storage key back to the realtime server

### 3. Upload intent rules

Recommended defaults:

- expiry: `5 minutes`
- single-use: `true`
- room-scoped: `true`
- user-scoped: `true`
- media-kind scoped: `surface-image` or `tv-video`
- surface uploads must also be scoped to one `surfaceId`

### 4. Object-key contract

The client must never choose its own arbitrary storage path.

Recommended server-generated keys:

- surface image:
  - `room-surfaces/{roomId}/{surfaceId}/{timestamp}-{random}.{ext}`
- TV video:
  - `room-tv/{roomId}/{timestamp}-{random}.mp4`

The realtime server should accept only keys that match the authorized upload intent for that actor and room.

### 5. Cleanup scope

Add cleanup in the same rollout, but do not tighten bucket permissions until cleanup exists.

Required cleanup cases:

- replacing a surface image should delete the previous referenced object if it is a managed storage key
- replacing TV media should delete the previous referenced object if it is a managed storage key
- deleting a saved room should delete:
  - all `room-surfaces/{roomId}/...` objects
  - all `room-tv/{roomId}/...` objects
- expired unused upload intents should be pruned

## Recommended Rollout

### Step 1

Add HTTP endpoints on the realtime server for upload authorization.

Suggested endpoints:

- `POST /api/uploads/surface-authorize`
- `POST /api/uploads/tv-authorize`

Request should include:

- `roomId`
- `contentType`
- `contentLength`
- `fileName`
- `surfaceId` for surface uploads

### Step 2

Add a server-side media authorization helper that centralizes:

- auth token verification
- saved-room check
- owner/admin check
- content-type whitelist
- size-limit check
- storage key generation
- upload-intent creation

### Step 3

Replace direct Amplify `uploadData()` use in:

- [`src/backend/surfaceImageClient.ts`](src/backend/surfaceImageClient.ts)
- [`src/backend/tvMediaClient.ts`](src/backend/tvMediaClient.ts)

New client flow:

- local validation for fast UX
- request upload authorization from server
- `PUT` file to presigned URL
- send websocket room update with returned storage key

### Step 4

Harden websocket media updates.

- `admin.setSurfaceImage` must reject keys not backed by a valid unexpired upload intent
- `admin.setTvMedia` must reject keys not backed by a valid unexpired upload intent
- clear/reset actions should still be allowed without upload intents

### Step 5

Add storage cleanup helpers.

- delete one object by storage key
- delete all objects by room prefix
- use those helpers from:
  - surface replacement
  - TV replacement
  - room deletion

### Step 6

After the new flow is verified, tighten storage rules in [`amplify/storage/resource.ts`](amplify/storage/resource.ts).

Target:

- shared media prefixes should no longer allow broad authenticated `write` / `delete`
- reads can remain available to the audience that needs playback/viewing

## Testing Checklist

Manual verification needed before bucket permissions are tightened:

- owner can upload a valid surface image
- admin can upload a valid surface image
- non-admin signed-in participant cannot authorize a surface upload
- owner can upload a valid TV video
- admin can upload a valid TV video
- non-admin signed-in participant cannot authorize a TV upload
- guest cannot authorize any upload
- invalid MIME type is rejected server-side
- oversized file is rejected server-side
- uploaded media still resolves through `getUrl({ path })`
- replacing media removes the old object when appropriate
- deleting a saved room removes shared-media storage objects

## Notes

- No bucket-object cleanup exists yet for shared media.
- TV media currently lives only in realtime memory; if durable TV persistence is added later, this flow should be reused rather than widened.
- Before implementing presigned uploads, confirm S3 bucket CORS allows browser `PUT` from the deployed app origin with the required `Content-Type` header.
