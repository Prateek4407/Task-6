# Task-6
# Real-Time Chat Server — Socket.io

Backend Onboarding Task 6. A multi-user, room-based chat server built on Socket.io, running on the same HTTP server as a (minimal) Express app. Reuses the JWT issued by the Task 5 login flow to authenticate each socket connection.

## Live Deployment

Deployed on an AWS EC2 instance:

**http://13.202.200.237:9000/index.HTML**

Open that URL directly to reach the test client.

## Tech Stack

- Node.js + Express
- Socket.io — real-time, bidirectional communication
- jsonwebtoken — verifies the token presented at socket handshake
- MongoDB + Mongoose — **optional**, only used for the bonus message-persistence section

## What it does

Multiple users join named rooms and see each other's messages, joins, departures, and typing status live — nobody refreshes or polls. The server keeps track of who's in each room **in memory**; nothing about presence is written to a database.

## Setup

```bash
npm install
```

Create a `.env` file (see `.env.example`):
```
PORT=9000
JWT_SECRET=same_secret_your_login_server_uses_to_sign_tokens
MONGO_URI=   # optional — leave blank to run with no message history
```

`JWT_SECRET` **must match** whatever secret your existing auth server (Task 5) signs tokens with — this server verifies tokens issued elsewhere; it has no login endpoints of its own.

Run:
```bash
npm start
```
Expected output:
```
Connected to MongoDB              # only if MONGO_URI was set
Server (HTTP + Socket.io) running on PORT:9000
```

## How to run and test with two users

Works identically whether you're pointed at `localhost` or the live EC2 URL — only the address in the browser changes.

1. Get a valid JWT from the Task 5 login flow — register, log in, verify the OTP, copy the token from the response.
2. Open the chat URL (`http://13.202.200.237:9000/index.HTML` live, or `http://localhost:9000` locally) in **two separate browser tabs** (or one normal + one incognito, so they don't share state).
3. In each tab: paste a token (use **two different users' tokens** — two different people, not the same token twice), type a room name (or leave blank for `general`), click **Connect**.
4. Type a message in one tab and press Enter — it should appear in both tabs instantly.
5. Start typing (without sending) in one tab — the other tab should show a typing indicator within a second.
6. Close one tab entirely — the other tab should immediately show that user leaving and the online list updating, with no explicit action taken in the closed tab.

The test client is plain HTML/JS at `public/index.html` — no framework, since Postman can't hold a socket connection open.

## Deployment (AWS EC2)

The server is deployed on an EC2 instance and run directly with `node`/`npm`, rather than behind a managed platform like Render — meaning the instance itself, not a build pipeline, is responsible for keeping the process alive and the port reachable.

**What this required, beyond the code itself:**

- **Security Group inbound rule** — EC2 instances block all inbound traffic by default. A rule had to be added to the instance's Security Group allowing inbound TCP traffic on port **9000** (Custom TCP, port 9000, source `0.0.0.0/0` for testing) — otherwise the server would run fine *on* the instance but be completely unreachable from outside it, even with the correct public IP.
- **`.env` configured on the instance itself** — `MONGO_URI`, and critically `JWT_SECRET` matching the Task 5 auth server's secret exactly, since this server only *verifies* tokens, it doesn't issue them.
- **Node and the project dependencies installed on the EC2 instance** — `npm install` run directly there, same as locally.
- **The process kept running after disconnecting from SSH.** Running `node server.js` directly in an SSH session dies the moment that session closes. In production this needs a process manager (e.g. `pm2`) or running it as a background/daemon process so the server survives after logging out of the instance.

**Known limitation of this deployment:** the server is reached directly over `http://` on a non-standard port (9000), with no reverse proxy (e.g. Nginx) and no TLS/HTTPS in front of it. This is acceptable for demonstrating the task's core concepts, but a production deployment would put Nginx in front to serve on port 80/443 with a real certificate, rather than exposing Node's own server directly on a custom port.

## How socket authentication works

Authenticating a socket connection is a **separate step** from authenticating an HTTP request — it happens once, at the moment a client first tries to connect (the "handshake"), not on every subsequent event.

1. The client connects with the token in the handshake's `auth` payload (never a query string):
   ```javascript
   io(url, { auth: { token: '<jwt>' } })
   ```
2. `middleware/socketAuth.js` runs via `io.use(...)` before the `connection` event fires for that client. It reads `socket.handshake.auth.token`, verifies it with `jwt.verify`, and either:
   - rejects the connection outright (`next(new Error(...))`) — the client's `connect` event never fires, and none of the chat event handlers are ever reachable for that client, or
   - attaches the decoded identity to `socket.user = { id, name, role }` and allows the connection to proceed.
3. Every event handler afterward (`chat:join`, `chat:message`, etc.) reads `socket.user` directly — identity was already proven once, at the door, and is never re-checked per event.

> **Note:** for `socket.user.name` to be populated correctly, the JWT payload needs a `name` field. If your Task 5 login only signs `{ id, role }`, add `name: user.name` to the `jwt.sign(...)` payload in `authController.js`. Without it, this server falls back to the email, or a generated placeholder like `User-ab64`.

## Events Reference

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `chat:join` | client → server | `{ room: string }` | Joins (or switches to) a room. Defaults to `"general"` if omitted. |
| `chat:system` | server → room (excluding joiner) | `{ message, room, at }` | "X joined the room" notice. |
| `chat:message` | client → server, then server → room (everyone, sender included) | client sends `{ text }`; server broadcasts `{ senderId, senderName, text, room, at }` | Server always attaches sender identity and timestamp — never trusts the client to supply either. |
| `chat:typing` | client → server → room (excluding the typer) | `{ isTyping: boolean }` → broadcast as `{ id, name, isTyping }` | Never persisted — see rationale below. |
| `chat:online-users` | server → room | `[{ id, name }, ...]` | Sent whenever someone joins or leaves. |
| `chat:leave` | client → server | *(none)* | Explicit leave, separate from a disconnect. |
| `chat:user-left` | server → room | `{ id, name, room }` | Sent on both an explicit leave and an unclean disconnect — treated identically. |
| `chat:error` | server → sender only | `{ message }` | Validation failures (empty message, not in a room, etc.) — never broadcast to the room. |
| `disconnect` | built-in, server-side only | — | Socket.io's own event; always fires regardless of how the connection ended (explicit leave, network loss, closed tab). Cleanup lives here so it runs no matter what. |

## In-memory state — what it is, and what breaks it

`sockets/chatHandlers.js` keeps a `roomUsers` map: `room name → (socket id → { id, name })`. This is the server's only record of "who's online right now."

**This state is not backed by a database.** If the server restarts — a redeploy, a crash, a manual restart — this map is gone, reset to empty. Every room appears empty to anyone who reconnects, even though their accounts and any persisted messages (if the bonus is implemented) are unaffected. This is a deliberate scope boundary of the task, not an oversight: syncing presence state across restarts or multiple server instances is what a Redis adapter solves, which this task explicitly excludes.

## Why `chat:typing` is never saved, but `chat:message` is

A chat message is content someone intentionally sent — it has lasting value, which is exactly why the bonus section persists it. A typing indicator is a transient UI signal that's meaningless the instant it's over; nobody would ever want to query "was User X typing at 3:04pm." Saving it would only add storage cost for data with no future use.

## Error handling

| Situation | Behavior |
|---|---|
| No token at handshake | Connection rejected (`connect_error`, `AUTH_NO_TOKEN`) before any event handler is reachable |
| Expired/tampered token | Connection rejected (`AUTH_TOKEN_EXPIRED` / `AUTH_INVALID_TOKEN`) |
| `chat:message` with empty/missing text | `chat:error` sent to the sender only; nothing broadcast to the room |
| `chat:message` sent before joining a room | `chat:error` — "Join a room before sending messages." |
| Malformed/unexpected payload on any event | Handled defensively (type checks, safe fallbacks) rather than trusting client input directly; a bad payload from one client never crashes the server or affects other connections |

## Bonus: Message Persistence

If `MONGO_URI` is set, every `chat:message` is also saved via `models/Message.js` (room, senderId, senderName, text, timestamp). This happens **after** the live broadcast, so a database hiccup never delays or blocks real-time delivery — it only means that one message might not show up in later history.

### `GET /messages/:room`

Plain REST, not a socket event — this is the one deliberate point where the two channels overlap: writes happen inside a socket handler, reads happen over HTTP, so a user joining a room late isn't dropped into a blank screen.

```
GET /messages/general?limit=50
```
```json
{
  "status": "success",
  "room": "general",
  "data": [
    { "senderId": "...", "senderName": "Bob", "text": "Hello from Bob", "createdAt": "..." }
  ]
}
```

## What this task deliberately does not include

Per the task's scope: no frontend framework for the test client, no private/direct messaging, no message editing or deletion, and no horizontal-scaling concerns (Redis adapter, multiple instances, sticky sessions) — all explicitly out of scope for understanding real-time, stateful connections on their own.
