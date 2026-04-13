# Project TODO

## Done

- Deploy the combined frontend and realtime server to Render.
- Verify Cognito-backed room ownership and admin controls.
- Persist room authority in the Amplify backend.
- Fix in-room sign-in so the websocket rejoins with a fresh auth token.
- Complete production QA for the current multiplayer flow.
- Add persisted room creation and room listing UX.
- Add sort/filter/share actions to the room browser.
- Add analytics and operational logging for production debugging.
- Reduce bundle size from the frontend Amplify room-browser path.
- Add a non-interactive cinematic lobby camera before room entry.
- Clarify room lifecycle so signed-in users create saved rooms while guests enter temporary sessions.
- Move realtime room authority persistence to direct DynamoDB reads/writes on Render.
- Verify saved-room ownership survives Render restart while temporary guest rooms remain ownerless.
- Clarify room-browser metadata and simplify Shared TV controls.
- Implement Room Media Library V1 for saved rooms.
- Restore stable production shared-media uploads on Render.
- Fix room media dedup, one-frame image placement, and uploader label polish in production.

## Next

- Launch hardening: add field-level authorization for `Room.createdBy` so owners cannot reassign saved-room ownership through GraphQL/Data updates.
- Improve remote avatar presentation beyond placeholders.
- Room media library follow-up
  - done: add `RoomMediaAsset` backend model and AppSync persistence
  - done: add room-scoped media list, finalize, dedup, and delete flows
  - done: add room quota and per-file upload validation
  - done: add Room Media Library UI for images and videos
  - done: simplify Shared Surfaces so uploads add to the library first and placement happens from library cards
  - done: add non-destructive `Clear` for in-use library images
  - done: restore production uploads by fixing Render storage env/IAM alignment and simplifying presigned browser PUT behavior
  - done: production re-test owner/admin upload, reuse, TV apply, clear, and same-room dedup flows on Render
  - done: switch image assets to one-frame-at-a-time placement with immediate clear visibility
  - done: replace raw uploader IDs with friendlier labels when profile/current-user context is available
  - next: evaluate thumbnails/previews for library assets if the list starts to grow
  - reference: implementation notes live in `ROOM_MEDIA_LIBRARY_V1_CHECKLIST.md`
- Shared surface image upload and saved-room lifecycle follow-up
  - done: add Amplify storage for guest-readable room surface images
  - done: add persisted room surface snapshot model and server repository
  - done: add realtime room snapshot/broadcast support for surface updates
  - done: refactor frame texture replacement into reusable surface image application
  - done: add owner/admin-only upload controls for saved-room shared surfaces
  - done: gate shared surfaces to saved rooms so temporary guest sessions do not imply durable ownership
  - done: merge live rooms into the room browser so active rooms show as joinable
  - done: verify Render can perform shared surface updates after widening AppSync IAM access
  - done: fix durable ownership by switching server authority hydration/persistence to direct DynamoDB
  - next: re-verify shared-surface upload gating and `Recent` ordering in production after the DynamoDB authority change
  - done: tighten shared media uploads with a server-authorized flow
  - cleanup before step 1:
    - document the current upload paths, limits, and room-role checks so rollout preserves existing behavior
    - identify every read/write/delete path for `room-surfaces/*` and `room-tv/*`, including room deletion and media replacement
    - decide whether to keep existing stored asset paths fully backward-compatible or migrate only new uploads
    - confirm S3/CloudFront/CORS requirements for presigned `PUT` uploads from the browser
    - define the upload-intent lifetime, single-use behavior, and object-key naming rules before changing bucket permissions
  - done: step 1: add server upload-authorization endpoints for surface images and TV video uploads
  - done: step 2: add server-side validation for room role, media type, size limits, and object-key scope
  - done: step 3: update the client upload helpers to request authorization, upload via presigned `PUT`, and submit the returned storage key
  - done: step 4: verify websocket room-state updates only accept authorized, unexpired uploaded keys for that room and media kind
  - done: step 5: add cleanup for replaced media, deleted rooms, expired upload intents, and orphaned protected uploads
  - done in code: step 6: remove broad authenticated `write/delete` access from shared media prefixes and re-test owner/admin, non-admin, and guest flows
  - done: clarify room-browser cards with explicit slug, owner, and saved/live state
  - done: simplify Shared TV controls to upload, clear, and play/pause only
  - done: replace misleading synced TV seconds copy with clearer playback status text
  - done: verify production direct browser media access after the updated storage/upload flow was deployed

## Later

- Consider a future "claim/save this room" action when a guest signs in after starting a temporary room.
- Revisit editable room titles as an owner-only room setting instead of part of the join flow.
- Shared TV media playback
  - done: create private S3 + CloudFront distribution path for app-managed media delivery
  - v1: owner/admin-only TV control for saved rooms
  - done: use app-managed uploaded room media assets for saved rooms
  - next: build a local hardcoded TV-video proof of concept by swapping the current `tvscreen.glb` visualizer material to a `THREE.VideoTexture`
  - sync media source and play/pause through room state
  - apply video as a Three.js `VideoTexture` on the TV mesh
  - done: remove seek UX for now instead of keeping a misleading partial control
  - defer uploads and YouTube support
  - later: add `MediaConvert`/HLS if direct mp4 delivery becomes too heavy
- Improve shared object sync beyond claim/drop authority only.
- Evaluate voice chat after the room/session UX is stable.
