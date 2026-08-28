# Stock Manager

Secure account stock dashboard built with **native HTML, CSS, and JavaScript** — no framework, no build step — plus a small pure Node.js server backed by MongoDB.

## Features

- Username/password admin login with signed HTTP-only session cookies
- MongoDB Atlas account storage
- Dashboard statistics
- Search and status filtering
- Add, edit, inspect, and delete accounts
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

Copy `.env.examplee` to `.env` and fill in private values:

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

## Deployment

Runs on any Node.js 18+ host (VPS, Railway, Render, Fly.io, dll):

```bash
npm install --omit=dev
npm start
```

Set `PORT` (default `3000`) and the environment variables above. Put the process behind a reverse proxy with HTTPS (nginx/Caddy) for production — the session cookie is automatically marked `Secure` when `x-forwarded-proto: https` is present.

## Security

- Never commit `.env` files or account exports.
- Use HTTPS in production.
- Rotate any credentials exposed in screenshots, chat, logs, or terminal history.
- MongoDB Atlas network access should be restricted to trusted sources where practical.

## License

Licensed under the [MIT License](LICENSE).

Copyright © 2026 [AKBZQ](https://akbzq.dev).
