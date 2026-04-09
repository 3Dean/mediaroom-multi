# Room Media Library V1 Checklist

## Goal

Build a room-scoped media library for saved rooms that lets owner/admin users:

- list uploaded room media
- reuse existing room media without re-uploading
- delete room media safely
- enforce per-file and per-room storage limits
- deduplicate identical uploads within the same room

## Product Rules

- Only owner/admin can manage room media.
- Only saved rooms can have durable room media.
- Each asset belongs to exactly one room.
- Duplicate uploads are deduplicated only within the same room.
- Upload authorization must reject files that exceed file-size or room-quota limits before upload begins.
- Deleting in-use media must require confirmation and clear the active room reference.

## Suggested Limits

- Images: max `10 MB`
- Videos: max `100 MB`
- Room total media quota: max `500 MB`

## Backend Schema

### 1. Add `RoomMediaAsset` model

- Add fields:
  - `id`
  - `roomId`
  - `kind` (`surface-image` or `tv-video`)
  - `storageKey`
  - `fileName`
  - `mimeType`
  - `sizeBytes`
  - `checksum`
  - `createdBy`
  - `createdAt`
  - `updatedAt`
  - `status` (`ready`, `deleted`)
  - optional `width`
  - optional `height`
  - optional `durationSeconds`
  - usage fields for current references:
    - `inUseSurfaceIds`
    - `inUseTv`

### 2. Add room-level usage tracking

- Add to `Room`:
  - `mediaBytesUsed`
  - `mediaAssetCount`

- If `Room` should not carry usage fields, define a separate `RoomMediaUsage` model instead.

### 3. Add indexes

- Query assets by `roomId`
- Query assets by `roomId + kind`
- Sort newest first by `createdAt`

## Storage Design

### 4. Define stable storage key conventions

- Images:
  - `room-surfaces/{roomId}/library/{assetId}-{safeFilename}`
- Videos:
  - `room-tv/{roomId}/library/{assetId}-{safeFilename}`

### 5. Keep room scoping strict

- Ensure upload intents only authorize keys inside the requesting room prefix
- Ensure delete logic only deletes room-owned keys

## Authorization and Validation

### 6. Enforce role checks server-side

- Only signed-in owner/admin can:
  - list assets
  - upload assets
  - reuse assets
  - delete assets

### 7. Enforce saved-room requirement

- Reject all room media management in temporary guest rooms

### 8. Enforce file type validation

- Accept:
  - `image/png`
  - `image/jpeg`
  - `image/webp`
  - `video/mp4`

### 9. Enforce file size validation

- Reject images above `10 MB`
- Reject videos above `100 MB`

### 10. Enforce room quota validation

- Reject upload authorization if:
  - `room.mediaBytesUsed + incoming size > room quota`

## Upload and Dedup Flow

### 11. Extend upload authorization request payload

- Include:
  - `roomId`
  - `kind`
  - `fileName`
  - `mimeType`
  - `sizeBytes`
  - `checksum`

### 12. Add same-room deduplication

- Before issuing an upload URL or upload intent:
  - query for existing `RoomMediaAsset` with same:
    - `roomId`
    - `kind`
    - `checksum`
    - `status = ready`

- If found:
  - return a reuse response instead of authorizing a new upload

### 13. Create asset record for new uploads

- After successful upload/finalization:
  - create `RoomMediaAsset`
  - increment room usage counters

### 14. Reuse duplicate asset cleanly

- If a duplicate exists:
  - do not create a new object
  - do not increment room usage counters
  - return the existing asset metadata

## API / Operation Checklist

### 15. Add list-room-media operation

- Input:
  - `roomId`
  - optional `kind`

- Output:
  - all room assets with display metadata and in-use state

### 16. Add authorize-room-media-upload operation

- Input:
  - `roomId`
  - `kind`
  - `fileName`
  - `mimeType`
  - `sizeBytes`
  - `checksum`

- Output:
  - either:
    - `mode: reuse` with existing asset
    - or `mode: upload` with upload authorization payload

### 17. Add finalize-room-media-upload operation

- Create asset record after successful upload
- Update room usage totals

### 18. Add reuse-room-media operation

- Images:
  - apply existing asset to a chosen `surfaceId`
- Videos:
  - apply existing asset to the shared TV

### 19. Add delete-room-media operation

- Validate ownership/admin role
- Validate room ownership of asset
- Delete storage object
- Clear any active room references
- Update usage counters
- Remove or mark asset deleted

## Usage Tracking

### 20. Track active references for images

- When an image asset is applied:
  - update `inUseSurfaceIds`
- When an image is replaced or cleared:
  - clear the old asset reference

### 21. Track active reference for TV video

- When a video asset is applied:
  - set `inUseTv = true`
- When TV video is replaced or cleared:
  - clear the old asset reference

## UI / UX Checklist

### 22. Add `Room Media Library` section in Shared Media UI

- Show only for owner/admin in saved rooms

### 23. Add usage summary

- Display:
  - `186 MB / 500 MB used`
- Optionally show asset count

### 24. Add tabs or filters

- `Images`
- `Videos`

### 25. Render asset rows/cards

- Show:
  - filename
  - size
  - uploaded date
  - uploaded by
  - `In use` badge
  - optional dimensions or duration

### 26. Add image actions

- `Use on image01`
- `Use on image02`
- `Use on image03`
- `Use on image04`
- `Delete`

### 27. Add video actions

- `Use on TV`
- `Delete`

### 28. Add empty states

- `No images uploaded for this room yet.`
- `No videos uploaded for this room yet.`

### 29. Add quota/error messaging

- File too large
- Room quota exceeded
- Unsupported file type
- Unauthorized access
- Unable to load room media

## Deletion UX

### 30. Add confirmation for unused assets

- Example:
  - `Delete "loop.mp4"?`

### 31. Add stronger confirmation for in-use assets

- For surfaces:
  - `This image is currently active on image02. Delete it and clear that surface?`
- For TV:
  - `This video is currently active on the shared TV. Delete it and clear the TV?`

### 32. Define deletion side effect behavior

- Recommended:
  - allow deletion
  - clear active room reference
  - then delete asset

## Backward Compatibility

### 33. Decide v1 treatment for existing stored media

- Recommended v1:
  - only newly indexed uploads appear in library
  - do not block rollout on backfilling older assets

### 34. Optional later migration

- Add a backfill script to scan room prefixes and create `RoomMediaAsset` records for legacy media

## Testing Checklist

### 35. Upload validation tests

- Image under limit succeeds
- Image over limit fails
- Video under limit succeeds
- Video over limit fails
- Invalid MIME fails

### 36. Quota tests

- Upload succeeds when under room quota
- Upload fails when room quota would be exceeded
- Room usage counters update correctly after delete

### 37. Dedup tests

- Same file uploaded twice to same room returns reuse
- Different file with same name creates new asset
- Same checksum in different room does not dedupe

### 38. Authorization tests

- Owner can list/upload/reuse/delete
- Admin can list/upload/reuse/delete
- Member cannot manage media
- Guest cannot manage media
- Temporary room cannot manage media

### 39. Reuse tests

- Reusing image updates surface for room
- Reusing video updates shared TV for room
- `In use` metadata updates correctly

### 40. Delete tests

- Delete unused asset removes storage object and asset record
- Delete in-use image clears surface and deletes asset
- Delete in-use video clears TV and deletes asset

### 41. UI tests

- Images tab loads correctly
- Videos tab loads correctly
- Empty states show correctly
- Error states show correctly
- Quota summary updates after upload/delete

## Rollout Order

### 42. Implementation sequence

- Add schema and indexes
- Add room usage tracking
- Add list/upload-authorize/finalize/reuse/delete operations
- Start indexing new uploads
- Add media library UI
- Add reuse flows
- Add delete flows
- Add dedup handling
- Add quota display and enforcement polish

## v1 Decisions To Lock Before Build

### 43. Confirm limits

- Images: `10 MB`
- Videos: `100 MB`
- Room total: `500 MB`

### 44. Confirm delete behavior

- Recommended:
  - deleting in-use assets is allowed with confirmation
  - current room reference is cleared automatically

### 45. Confirm duplicate-upload behavior

- Recommended:
  - same-room duplicate upload returns the existing asset
  - if upload came from an apply action, immediately apply the reused asset

### 46. Confirm owner/admin permissions

- Recommended:
  - both owner and admin can list, reuse, upload, and delete room media

### 47. Confirm uploader label strategy

- Recommended:
  - show account label if available
  - fall back to user ID if necessary
