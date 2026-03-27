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

If `REALTIME_ALLOWED_ORIGINS` is empty, the websocket server accepts all origins. For production, set it explicitly to your frontend origin.

## Health check

The realtime server exposes:

```text
GET /health
```

Example:

```powershell
node -e "fetch('http://127.0.0.1:8787/health').then(r=>r.text()).then(console.log)"
```

## Deployment

A production deploy needs two running services:

- the Vite-built static frontend
- the Node realtime server from `server/index.js`

Recommended sequence:

1. Deploy the static frontend.
2. Deploy the realtime server with `npm start`.
3. Set `VITE_REALTIME_URL` on the frontend to the deployed websocket URL.
4. Set `REALTIME_ALLOWED_ORIGINS` on the server to the deployed frontend origin.
5. Verify `GET /health` and then test two live browser sessions.

A more detailed deployment checklist is in `DEPLOYMENT.md`.

## Current limitations

- remote avatars are placeholder capsules/name labels
- object sync is authoritative for ownership and final dropped transform, not continuous mid-air physics sync
- Amplify persistence is scaffolded, but most live room state is intentionally kept in realtime memory
- voice chat is not implemented

## Recommended next steps

- manual two-browser QA pass for all interactions
- deploy the realtime server to a stable host
- add moderation/admin controls
- add room creation persistence and room listing UX
- add analytics/logging if this moves beyond local evaluation
