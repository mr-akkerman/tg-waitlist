# TG Waitlist

Minimal Telegram WebApp for collecting emails. Opens inside Telegram, adapts to the user's theme, saves emails to a database.

## Stack

- **Next.js** (App Router) — frontend + API
- **Neon** — serverless PostgreSQL
- **Drizzle ORM** — type-safe database access
- **Tailwind CSS** — styling
- **Telegram WebApp API** — native integration

## How It Works

1. User opens the WebApp inside Telegram
2. Enters their email
3. Taps the native MainButton
4. Email is saved to the database
5. User sees a confirmation screen

The UI adapts to the user's Telegram theme (light/dark) via CSS variables. Haptic feedback is used for interactions on supported devices.

## Deploy to Vercel

### 1. Create a Neon database

Go to [neon.tech](https://neon.tech), create a project, and copy the connection string.

### 2. Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mr-akkerman/tg-waitlist&env=DATABASE_URL&envDescription=Neon%20PostgreSQL%20connection%20string&project-name=tg-waitlist)

Or deploy manually:

```bash
npm install
npm run build
```

### 3. Set environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |

### 4. Push the database schema

```bash
npx drizzle-kit push
```

### 5. Set up the Telegram bot

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Go to **Bot Settings → Menu Button** (or use the Web Apps API)
3. Set the URL to your Vercel deployment

## Local Development

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL

npm install
npx drizzle-kit push
npm run dev
```

## Project Structure

```
src/
  app/
    page.tsx                  — main (and only) page
    layout.tsx                — root layout with Telegram SDK
    globals.css               — styles with Telegram CSS variables
    api/submit-email/route.ts — POST endpoint
  db/
    schema.ts                 — database schema
    index.ts                  — database connection
  lib/
    telegram.ts               — Telegram WebApp utilities
```

## License

MIT
