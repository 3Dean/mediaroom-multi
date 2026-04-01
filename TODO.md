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

## Next

- Improve remote avatar presentation beyond placeholders.

## Later

- Revisit editable room titles as an owner-only room setting instead of part of the join flow.
- Improve shared object sync beyond claim/drop authority only.
- Evaluate voice chat after the room/session UX is stable.
