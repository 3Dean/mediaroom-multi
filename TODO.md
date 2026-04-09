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

## Next

- Room media library planning and implementation checklist lives in `ROOM_MEDIA_LIBRARY_V1_CHECKLIST.md`.
- Improve remote avatar presentation beyond placeholders.
- Shared surface image upload and saved-room lifecycle follow-up
  - done: add Amplify storage for guest-readable room surface images
  - done: add persisted room surface snapshot model and server repository
  - done: add realtime room snapshot/broadcast support for surface updates
  - done: refactor frame texture replacement into reusable surface image application
  - done: add owner/admin-only upload controls targeting `image01`-`image04`
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
  - next: deploy the updated Amplify storage policy and re-test direct browser access in the target environment

## Later

- Consider a future "claim/save this room" action when a guest signs in after starting a temporary room.
- Revisit editable room titles as an owner-only room setting instead of part of the join flow.
- Shared TV media playback
  - done: create private S3 + CloudFront distribution path for app-managed media delivery
  - v1: owner/admin-only TV control for saved rooms
  - use curated or app-managed `S3`/`CloudFront` mp4 URLs
  - next: build a local hardcoded TV-video proof of concept by swapping the current `tvscreen.glb` visualizer material to a `THREE.VideoTexture`
  - sync media source and play/pause through room state
  - apply video as a Three.js `VideoTexture` on the TV mesh
  - done: remove seek UX for now instead of keeping a misleading partial control
  - defer uploads and YouTube support
  - later: add `MediaConvert`/HLS if direct mp4 delivery becomes too heavy
- Improve shared object sync beyond claim/drop authority only.
- Evaluate voice chat after the room/session UX is stable.
