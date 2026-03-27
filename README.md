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

If `REALTIME_ALLOWED_ORIGINS` is empty, the websocket server accepts all origins locally. On Render, the server falls back to `RENDER_EXTERNAL_URL` automatically so the deployed app can use same-origin websocket connections without extra configuration.

## Health check

The realtime server exposes:

```text
GET /health
```

Example:

```powershell
node -e "fetch('http://127.0.0.1:8787/health').then(r=>r.text()).then(console.log)"
```

## Render deployment

This repo is now prepared for a single Render web service deployment. The service:

- builds the Vite frontend with `npm run build`
- serves the built `dist` files from the Node server
- hosts the websocket multiplayer backend on the same origin

The included [`render.yaml`](./render.yaml) uses:

- `buildCommand: npm install && npm run build`
- `startCommand: npm start`

That means you do not need a separate static host and websocket host for the first production deploy.

Detailed steps are in `DEPLOYMENT.md`.

## Current limitations

- remote avatars are placeholder capsules/name labels
- object sync is authoritative for ownership and final dropped transform, not continuous mid-air physics sync
- Amplify persistence is scaffolded, but most live room state is intentionally kept in realtime memory
- voice chat is not implemented

## Recommended next steps

- deploy to Render and run a real two-browser QA pass
- add moderation/admin controls
- add room creation persistence and room listing UX
- add analytics/logging if this moves beyond local evaluation
