# MusicSpace Multiplayer MVP

This project now includes a local multiplayer MVP on top of the existing three.js room.

## Included multiplayer features

- room join flow
- realtime player presence
- movement sync
- text chat
- seat ownership and seat conflict prevention
- shared object ownership for pickable room items
- reconnect with client retry/backoff
- participant/session status UI
- persisted room owner/admin state for the realtime server
- owner/admin moderation controls for kick, mute, and room lock

## Local development

Open two terminals in the project root.

### Terminal 1: realtime server

```powershell
npm run realtime
```

You can also use:

```powershell
npm start
```

The realtime server defaults to `ws://localhost:8787`.

### Terminal 2: frontend

```powershell
npm run dev
```

Open the app in two browser windows and join the same room slug.

## Environment configuration

Copy values from `.env.example` if you want to override defaults.

Frontend:

- `VITE_REALTIME_URL`

Server:

- `REALTIME_HOST`
- `REALTIME_PORT`
- `REALTIME_ALLOWED_ORIGINS`
- `REALTIME_MAX_ROOM_SIZE`
- `REALTIME_MAX_CHAT_LENGTH`
- `REALTIME_CHAT_WINDOW_MS`
- `REALTIME_CHAT_MAX_MESSAGES`
- `REALTIME_MAX_DISPLAY_NAME_LENGTH`
- `REALTIME_LOG_LEVEL` (`debug`, `info`, `warn`, or `error`)
- `REALTIME_COGNITO_USER_POOL_ID`
- `REALTIME_COGNITO_CLIENT_ID`
- `REALTIME_COGNITO_ISSUER` (optional override)
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN` (optional)
- `REALTIME_ROOM_TABLE_NAME` (recommended for stable server-side room authority persistence)

If `REALTIME_ALLOWED_ORIGINS` is empty, the websocket server accepts all origins locally. On Render, the server falls back to `RENDER_EXTERNAL_URL` automatically so the deployed app can use same-origin websocket connections without extra configuration.

To enable verified room ownership/admin controls, the realtime server must be able to verify Cognito tokens. Set `REALTIME_COGNITO_USER_POOL_ID` and `REALTIME_COGNITO_CLIENT_ID` in the server environment. Once configured:

- the first authenticated user to enter a room becomes that room's persisted owner
- the owner can promote admins
- owner/admin can mute and kick participants
- the owner can lock or unlock the room
- muted users are blocked from sending chat messages server-side

To persist room authority in the Amplify backend data model across redeploys, the realtime server can now read and write the Amplify `Room` DynamoDB table directly. Set `REALTIME_ROOM_TABLE_NAME` to the deployed table name and provide AWS credentials that can access that table. Without those credentials, the server falls back to the local file store in `server/data/room-authority-store.json`.

## Room lifecycle

The room flow now distinguishes between temporary guest sessions and saved rooms:

- signed-in users can create new saved rooms
- saved rooms are persisted to the backend and appear in the room browser
- guests can join saved rooms
- guests entering a brand-new link create a temporary room session, not a saved room
- durable room features such as shared surface uploads are available only in saved rooms
- room browser cards now show explicit slug, owner, and saved/live state to make duplicate-looking room entries easier to distinguish

In the room panel this means:

- known saved room: `Join Room`
- signed-in user + new link: `Create Room`
- signed-out user + new link: `Enter as Guest`
- current room: `Re-Enter Room`

For operational debugging, the realtime server now emits structured JSON logs for joins, disconnects, moderation actions, chat enforcement, and authority persistence failures. Use `REALTIME_LOG_LEVEL=debug|info|warn|error` to control verbosity. `info` is the default and is appropriate for Render.

## Shared media controls

Saved rooms expose owner/admin-only shared media controls:

- Shared Surfaces: upload replacement images for `image01` through `image04`
- Shared TV: upload an MP4, clear it, and toggle play/pause

The current Shared TV UX intentionally does not expose seek or scrubber controls. Playback state is kept simple until a fuller synchronized media control surface is implemented.

## Health check

The realtime server exposes:

```text
GET /health
```

Example:

```powershell
node -e "fetch('http://127.0.0.1:8787/health').then(r=>r.text()).then(console.log)"
```

The health response now includes `authorityPersistence` so you can confirm whether the server is using backend persistence (`backend+fallback`) or local fallback only (`fallback-only`).

## Render deployment

This repo is now prepared for a single Render web service deployment. The service:

- builds the Vite frontend with `npm run build`
- serves the built `dist` files from the Node server
- hosts the websocket multiplayer backend on the same origin

The included [`render.yaml`](./render.yaml) uses:

- `buildCommand: npm install && npm run build`
- `startCommand: npm start`

That means you do not need a separate static host and websocket host for the first production deploy.

For durable room authority on Render, add these in addition to the Cognito env vars:

- `AWS_REGION=us-east-1`
- `AWS_ACCESS_KEY_ID=...`
- `AWS_SECRET_ACCESS_KEY=...`
- `AWS_SESSION_TOKEN=...` if you use temporary credentials
- `REALTIME_ROOM_TABLE_NAME=Room-...`

Detailed steps are in `DEPLOYMENT.md`.

## Current limitations

- remote avatars are placeholder capsules/name labels
- object sync is authoritative for ownership and final dropped transform, not continuous mid-air physics sync
- voice chat is not implemented

## Recommended next steps

- improve remote avatar presentation beyond placeholders
- improve shared object sync beyond claim/drop authority only
- evaluate voice chat after the room/session UX is stable
- consider a future "claim/save this room" action for users who sign in after starting in a temporary guest room
- revisit editable room titles later as an owner-only room setting, not part of the join flow
