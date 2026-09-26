http://localhost:3000
RUN_LOCALLY.md
# Sunrise Motel — run on localhost (Windows)

## What this website is
A Next.js 16 + React 19 hotel site for **Sunrise Motel, Lilongwe (Area 5)**:
- Public pages: `/` (home + live availability + booking), `/stay`, `/dine`, `/unwind`, `/gallery`, `/connect`, `/track?ref=...`
- Booking API: `POST /api/bookings` → creates booking + pro-forma PDF invoice (`/api/invoices/[reference]`) + tracking link
- Admin dashboard: `/admin` (bookings pipeline, invoices, gallery/posts pictures, uploads)
- Database: PostgreSQL via Drizzle ORM (`src/db/schema.ts` → 7 tables: `room_types, bookings, booking_events, invoices, posts, menu_items, gallery_images`). First call to `/api/availability` auto-seeds rooms/gallery/posts.
- `php-mysql/` is a legacy PHP/MySQL prototype — **not used** by the running site. The live site is the Next.js app in `src/` + `public/`.

## Prerequisites (already present on this PC)
- Node.js v24 + npm (checked `node -v`)
- PostgreSQL 17 service `postgresql-x64-17` running on 127.0.0.1:5432
- `psql` at `C:\Program Files\PostgreSQL\17\bin\psql.exe`

## Fresh database (done once)
```powershell
$env:PGPASSWORD='postgres'; $env:PAGER='cat'
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -U postgres -P pager=off -c 'CREATE DATABASE sunrise_db;'
```

## Configure
`.env` (already set):
```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/sunrise_db
```
Optional email (only for Admin → "email invoice" button):
```
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="Sunrise Motel <you@domain>"
```

## Install + migrate (done once)
```powershell
cd c:\Users\datcom3\Documents\sunraisehotles
npm install
npx drizzle-kit generate   # creates ./drizzle/*.sql from src/db/schema.ts
npx drizzle-kit migrate    # creates the 7 tables in sunrise_db
```

## Run (every time)
```powershell
cd c:\Users\datcom3\Documents\sunraisehotles
npm run dev -- --port 3000 --hostname 127.0.0.1
# open http://localhost:3000
```
Health check: `http://localhost:3000/api/health` → `{"ok":true}`

## Verify booking end-to-end (PowerShell)
```powershell
Invoke-RestMethod 'http://localhost:3000/api/availability?checkIn=2026-10-01&checkOut=2026-10-03'
$b = @{ roomTypeId='standard'; checkIn='2026-10-10'; checkOut='2026-10-12'; guestName='Test Guest'; phone='+265991000000'; adults=2 } | ConvertTo-Json
$r = Invoke-RestMethod -Uri http://localhost:3000/api/bookings -Method POST -Body $b -ContentType 'application/json'
$t = @{ reference=$r.booking.reference; phone='+265991000000' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/track -Method POST -Body $t -ContentType 'application/json'
Invoke-WebRequest -Uri ("http://localhost:3000/api/invoices/" + $r.booking.reference)  # PDF
```

## Notes / gotchas fixed
- Your old `app_db` database holds a *different* project (students/colleges tables). This site now uses a fresh `sunrise_db` so migrations don't clash.
- `drizzle.config.json` points at `sunrise_db` and `out: ./drizzle`.
- `next.config.ts` sets `turbopack.root` to silence the "multiple lockfiles" workspace warning.
- Port 3000 must be free. Kill leftovers with:
```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```
- Stop the dev server with Ctrl+C in its terminal.
