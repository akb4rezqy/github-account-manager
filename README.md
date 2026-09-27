# Stock Manager

Secure account stock dashboard built with **native HTML, CSS, and JavaScript** — no framework, no build step — plus a small pure Node.js server backed by MongoDB.

## Features

- Username/password admin login with signed HTTP-only session cookies
- MongoDB Atlas account storage
- Dashboard statistics
- Search and status filtering
- Add, edit, inspect, and delete accounts
- Account folders: group accounts by package/source with chips navigation, per-folder statistics, bulk move, rename, and delete (accounts are detached, never deleted)
- Soft delete with Trash view: restore or purge permanently (auto-purge after 30 days)
- Live TOTP codes (RFC 6238, 6 digit, refresh every 30s) derived from the stored secret — the 16-digit secret is never modified
- Bulk account import
- Bulk status updates
- Copy/download selected available accounts and mark them sold
- Responsive native cards, dialogs, buttons, inputs, badges, and tables
- Login rate limiting and server-side input normalization

## Stack

- Frontend: HTML5 + CSS + vanilla JavaScript (tanpa framework, tanpa build step)
- Backend: Node.js `http` murni (tanpa framework)
- Mongoose + MongoDB Atlas
- bcrypt password hashes

## Environment

Copy `.env.example` to `.env` and fill in private values:

```env
MONGODB_URI="mongodb+srv://..."
ADMIN_USERNAME="admin"
ADMIN_PASSWORD_HASH="$2a$..."
SESSION_SECRET="a-long-random-secret"
```

You may use `ADMIN_PASSWORD` instead of `ADMIN_PASSWORD_HASH` for local-only setups.

## Development

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Verification

```bash
npm test
```

The same API logic powers two entry points:

- `server.js` — plain Node.js http server (self-hosting: VPS, Railway, Render, Fly.io, dll.)
- `api/*.js` — Vercel serverless functions (`/api/*` endpoints)

Static files live in `public/`, which both setups serve at the root.

### Trash & restore endpoints

Deleting an account moves it to Trash instead of removing the document:

| Method | Endpoint | Effect |
| --- | --- | --- |
| `DELETE` | `/api/accounts/:id` | Soft delete (sets `deleted_at`) |
| `DELETE` | `/api/accounts/:id?permanent=1` | Delete permanently |
| `POST` | `/api/accounts/:id/restore` | Restore from Trash |
| `DELETE` | `/api/accounts/trash` | Empty the Trash |
| `GET` | `/api/accounts?trash=1` | List trashed accounts (purges entries older than 30 days) |

Trashed accounts are excluded from listings, statistics, edits, and status updates.

### Folder endpoints

| Method | Endpoint | Effect |
| --- | --- | --- |
| `GET` | `/api/folders` | List folders with live-account counts + `unassigned` |
| `POST` | `/api/folders` | Create folder (`409` on duplicate name) |
| `PUT` | `/api/folders/:id` | Rename folder (`409` on duplicate name) |
| `DELETE` | `/api/folders/:id` | Delete folder and detach its accounts (`detached`) |
| `GET` | `/api/accounts?folder=<id\|none>` | Accounts of one folder (`none` = unassigned) |
| `GET` | `/api/statistics?folder=<id\|none>` | Statistics scoped to a folder (Trash card stays global) |
| `PUT` | `/api/accounts/bulk/folder` | Move selected accounts (`{ ids, folder_id }`) |

Bulk import (`POST /api/accounts/bulk`) accepts an optional `folder_id` applied to every imported account.

### Self-hosting (VPS / PaaS)

Runs on any Node.js 18+ host:

```bash
npm install --omit=dev
npm start
```

Set `PORT` (default `3000`) and the environment variables above. Put the process behind a reverse proxy with HTTPS (nginx/Caddy) for production — the session cookie is automatically marked `Secure` when `x-forwarded-proto: https` is present.

### Vercel (serverless)

1. Push this repo to GitHub and import it in the Vercel dashboard (Framework preset: **Other**).
2. Set the environment variables in **Project → Settings → Environment Variables**:
   - `MONGODB_URI`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`
   - `SESSION_SECRET`
3. Deploy. The `api/` folder becomes the `/api/*` endpoints and `public/` is served as static assets — no build step, no `server.js` needed.

Note: `server.js` is ignored on Vercel; only the serverless functions run there. The MongoDB connection and login rate-limit state are cached per serverless instance, which is fine for a small admin dashboard.

## Security

- Never commit `.env` files or account exports.
- Use HTTPS in production.
- Rotate any credentials exposed in screenshots, chat, logs, or terminal history.
- MongoDB Atlas network access should be restricted to trusted sources where practical.

## License

Licensed under the [MIT License](LICENSE).

Copyright © 2026 [AKBZQ](https://akbzq.me).
