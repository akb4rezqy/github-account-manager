# Stock Manager

Secure account stock dashboard built with Next.js App Router, TypeScript, MongoDB, and shadcn-style React components.

## Features

- Username/password admin login with signed HTTP-only session cookies
- MongoDB Atlas account storage
- Dashboard statistics
- Search and status filtering
- Add, edit, inspect, and delete accounts
- Bulk account import
- Bulk status updates
- Copy/download selected available accounts and mark them sold
- Responsive shadcn-style cards, dialogs, buttons, inputs, badges, and tables
- Login rate limiting and server-side input normalization

## Stack

- Next.js 16
- React 19 + TypeScript/TSX
- Tailwind CSS 4
- Radix UI primitives
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
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm test
npm run build
npm audit --omit=dev
```

## Deployment

The repository is configured as a Next.js Vercel project. Add the environment variables above in Vercel, then deploy the `main` branch.

## Security

- Never commit `.env` files or account exports.
- Use HTTPS in production.
- Rotate any credentials exposed in screenshots, chat, logs, or terminal history.
- MongoDB Atlas network access should be restricted to trusted sources where practical.

## License

Private project unless otherwise specified by the repository owner.
