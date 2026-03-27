# Deployment Checklist

This repo is prepared for a single Render web service deployment.

The Render service does both jobs:

- serves the built frontend from `dist`
- runs the websocket multiplayer server from `server/index.js`

## Why this shape

Using a single service keeps the browser on the same origin for both HTTP and websocket traffic, which simplifies deployment and avoids separate frontend/backend URL coordination for the first production release.

## Render setup

1. Push the repo to GitHub.
2. In Render, create a new Blueprint or Web Service from this repo.
3. If using a Blueprint, Render can read `render.yaml` from the repo.
4. Build command:
   `npm install && npm run build`
5. Start command:
   `npm start`
6. Leave `VITE_REALTIME_URL` unset for Render.
7. Leave `REALTIME_ALLOWED_ORIGINS` unset unless you need to override the default origin policy.

## Environment variables

The included `render.yaml` already sets the core server values:

- `REALTIME_HOST=0.0.0.0`
- `REALTIME_MAX_ROOM_SIZE=8`
- `REALTIME_MAX_CHAT_LENGTH=280`
- `REALTIME_CHAT_WINDOW_MS=10000`
- `REALTIME_CHAT_MAX_MESSAGES=5`
- `REALTIME_MAX_DISPLAY_NAME_LENGTH=32`

Render also provides `PORT`, and the server uses that automatically.

If `REALTIME_ALLOWED_ORIGINS` is unset, the server falls back to `RENDER_EXTERNAL_URL` when available.

## Local preflight

1. Run `npm run build`.
2. Run `npm start`.
3. Check `GET http://127.0.0.1:8787/health`.
4. Open `http://127.0.0.1:8787/` and verify the built frontend loads.
5. Verify two-browser room join, movement, chat, seating, reconnect, and object sync.

## Production verification

1. Confirm the Render service deploys successfully.
2. Open `/health` on the deployed service.
3. Confirm `servingDist` is `true`.
4. Open two browser sessions against the deployed app.
5. Join the same room slug in both sessions.
6. Verify presence, movement, chat, seating conflicts, reconnect behavior, and shared object ownership.

## Operational note

Live room state is stored in memory on the websocket server. Restarting the Render service clears presence, seat occupancy, and held object ownership.
