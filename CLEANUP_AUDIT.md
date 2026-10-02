# Admin navigation status

**Default view:** `http://localhost:3112/admin?section=overview#hp-main`

The earlier overview-only restriction has been reversed. The admin pages and their navigation are available again.

## Kept and restored

- `src/app/admin/page.tsx` — manager overview and query-string sections: Overview, Bookings, Invoices, Pictures, Posts, Menu, Rooms, and Reports.
- `src/app/admin/layout.tsx` — admin metadata and normal nested route layout.
- `src/components/admin/admin-navigation.tsx` — desktop sidebar and mobile navigation, including management destinations.
- `src/app/admin/audit-logs/page.tsx`
- `src/app/admin/calendar/page.tsx`
- `src/app/admin/finance/page.tsx`
- `src/app/admin/guests/[id]/page.tsx`
- `src/app/admin/housekeeping/page.tsx`
- `src/app/admin/notifications/page.tsx`
- `src/app/admin/users/page.tsx`

The admin UI remains at port 3112. The Overview section is the default when `/admin` is opened without a `section` query parameter. Other admin pages now render normally; middleware continues to apply no-cache headers to API responses only.

No routes, APIs, database tables, Android applications, or other system areas were removed.
