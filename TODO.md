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

## Next

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
  - investigate: durable room ownership still does not survive Render restart
  - investigate: `Room` records are being written to DynamoDB, but post-restart authority hydration still returns `ownerUserId: null`
  - investigate: compare server AppSync read path in `server/roomAuthorityRepository.js` with the persisted `Room` table contents
  - investigate: once authority hydration is fixed, verify saved-room upload gating and `Recent` ordering again in production

## Later

- Consider a future "claim/save this room" action when a guest signs in after starting a temporary room.
- Revisit editable room titles as an owner-only room setting instead of part of the join flow.
- Improve shared object sync beyond claim/drop authority only.
- Evaluate voice chat after the room/session UX is stable.
