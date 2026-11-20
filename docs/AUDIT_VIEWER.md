# Audit log viewer (admin)

Administrators can search the audit log in the browser: **Admin → Audit log**.

## What it shows
Time, who (name, role, email), action, record type and id, IP address. Newest first, 50 per page with "Load more".
The free-text `details` column is **never** returned (it can contain clinical wording, e.g. a doctor's reason for overriding an interaction warning). This matches the existing CSV export.

## Filters
- Search: name, email or IP address (`%` and `_` are literal characters, not wildcards)
- Action, record type (drop-downs filled from what is actually in the log)
- From / To dates (inclusive)
- "Download CSV" reuses the existing audit export (`/api/export/admin/audit`) for the same From/To (last 30 days if empty). Exports are themselves audited.

## API (ADMIN only; 401 anonymous, 403 other roles)
- `GET /api/admin/audit?q=&action=&entity_type=&user_id=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&limit=` (limit max 200)
  → `{ items: [{audit_id, created_at, user_id, user_name, user_email, user_role, action, entity_type, entity_id, ip_address}], page, limit, has_more }`
- `GET /api/admin/audit/facets` → `{ actions: [...], entity_types: [...] }`

Invalid dates, `from` after `to`, a non-numeric `user_id` or `limit` above 200 return 400.

## Tests
`audit log viewer: admin only, filters, paging, no free-text details` in `backend/test/api.test.js`.
