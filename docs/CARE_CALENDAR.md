# Patient care calendar

A new **Calendar** tab for patients (month and week views) that puts doses, appointments and prescription dates on one page.

## What it shows

* **Doses** from `reminders`, coloured by outcome: Taken (green), Pending (purple), Skipped (amber), Missed (red).
* **Appointments** (requested, confirmed, completed; declined and cancelled ones are hidden from the grid).
* **Prescription courses**: the first and last day of each medicine ("Rx starts" / "Rx ends").
* Clicking a day opens its detail below the grid. Doses whose time has passed can be marked **Taken** or **Skipped** (a missed dose offers **I took it late**; an answered dose offers **Undo**). This uses the existing `PATCH /api/reminders/:id/status`.

## API

`GET /api/patients/me/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` (patients only)

Returns `{ from, to, reminders[], appointments[], courses[] }` for the signed-in patient. A range is at most 62 days (a month view with its leading and trailing days is 42). Only ACTIVE and DISPENSED prescriptions are included, the same rule as the existing reminder list. There are no new tables; nothing is written by this endpoint.

## Files

* `backend/src/services/calendarService.js`, route in `backend/src/routes/patientRoutes.js`
* `frontend/src/components/CareCalendar.jsx` and `CareCalendar.css`, tab added in `frontend/src/pages/Patient.jsx`

## Add to my phone calendar (.ics)

`GET /api/patients/me/calendar.ics[?from=&to=]` (patients only). Defaults to today plus 60 days. Contains only **upcoming pending doses** (15-minute events with an alert at the dose time) and **requested/confirmed appointments** (30 minutes, alert 1 hour before). Times are floating local times, so 08:00 stays 08:00 on any phone. Text is escaped and lines folded per RFC 5545; each event has a stable UID so re-importing updates rather than duplicates in most calendar apps. It is a snapshot, not a live subscription. Each export is audited as `CALENDAR_EXPORT`. Button: "Add to my phone calendar (.ics)" on the patient Calendar tab.

## Doctor schedule

`GET /api/doctors/me/calendar?from=&to=` (doctors only): the doctor's own appointments plus the last day of every active course they prescribed (`followups`, a natural follow-up point). The **Schedule** tab lets the doctor confirm, decline, reschedule or complete an appointment from the day panel, using the existing `/api/appointments/:id/...` endpoints.

## Pharmacy expiry calendar

`GET /api/pharmacies/:pharmacyId/stock-calendar?from=&to=` (pharmacy staff, own pharmacy only, otherwise 403): non-removed batches with stock left that expire in the range. The **Expiry calendar** tab colours days red (already expired), amber (within 30 days) or green (later).

All three share the 62-day range limit and the frontend frame `CalendarShell.jsx` (doctor and pharmacy views; the patient view keeps its own component). Extra files: `backend/src/utils/ics.js`, `DoctorCalendar.jsx`, `StockCalendar.jsx`, `CalendarShell.css`. No new tables or migrations.
