# Deployment Checklist

This repo now has two deployable pieces:

- a static frontend built with `npm run build`
- a realtime websocket server started with `npm start`

## Environment variables

Frontend:

- `VITE_REALTIME_URL=wss://your-realtime-host.example.com`

Server:

- `REALTIME_HOST=0.0.0.0`
- `REALTIME_PORT=8787`
- `REALTIME_ALLOWED_ORIGINS=https://your-frontend-host.example.com`
- `REALTIME_MAX_ROOM_SIZE=8`
- `REALTIME_MAX_CHAT_LENGTH=280`
- `REALTIME_CHAT_WINDOW_MS=10000`
- `REALTIME_CHAT_MAX_MESSAGES=5`
- `REALTIME_MAX_DISPLAY_NAME_LENGTH=32`

## Local preflight

1. Run `npm run build`.
2. Run `npm start`.
3. Check `GET http://127.0.0.1:8787/health`.
4. Run the frontend locally and verify two-browser room join, movement, chat, seating, and object sync.

## Hosting shape

Any host that can run a long-lived Node process will work for the realtime server. Typical options:

- Railway
- Render
- Fly.io
- AWS ECS / EC2 / Elastic Beanstalk

The frontend can be deployed separately anywhere that serves static files.

## Runtime notes

- The realtime server keeps live room state in memory.
- Restarting the realtime server clears room presence, seat occupancy, and held object ownership.
- Persistent room/profile/chat storage is scaffolded through Amplify, but the live room authority is the websocket server.

## Production verification

1. Confirm the deployed websocket server responds at `/health`.
2. Confirm `allowedOrigins` in the health output matches the intended frontend origin policy.
3. Open two browser sessions against the deployed frontend.
4. Join the same room slug in both sessions.
5. Verify presence, movement, chat, seating conflicts, reconnect behavior, and shared object ownership.
