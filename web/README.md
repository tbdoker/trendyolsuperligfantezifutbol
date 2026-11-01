# Tribün web app

Next.js 16 (App Router, Cache Components) with Supabase for sign-in and data.

## Run locally

```sh
cp .env.example .env.local   # fill in the project URL and publishable key
npm install
npm run dev
```

## How it fits together

- `src/proxy.ts`: runs before every page; refreshes the session and sends signed-out visitors to `/giris`
- `src/lib/supabase/`: Supabase clients for the server and the proxy
- `src/lib/data.ts`: reading data on the server (your leagues, the selected league, the next round)
- `src/lib/actions.ts`: Server Actions for forms. Game rules are checked by the database functions they call
- `src/app/(app)/`: the four tabs (Maç, Kadro, Oyuncular, Lig) with the league switcher in the header
- `src/app/giris`, `src/app/auth/callback`: sign-in by email link
- `src/app/profil`: name and username on first sign-in

Pages that read the session stream in behind `<Suspense>`, so the frame of each tab shows instantly.
