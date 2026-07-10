# Clinic capacity dashboard

React/Vite/TypeScript dashboard that pulls appointment data from Cliniko and
reproduces the capacity spreadsheet: available hours, hours filled, capacity %,
new patients, follow-ups booked and conversion %, per week and per month, with
projections and RAG colour coding against targets.

## Setup

```bash
npm install
cp .env.example .env   # optional — only sets the proxy PORT
npm run dev            # runs Vite (5280) + API proxy (5281) together
```

Open http://localhost:5280. You'll be prompted for your Cliniko API key
(Cliniko → My Info → Manage API keys) on first load; it's stored only in your
browser's local storage.

## How the numbers are derived

| Metric | Source |
|---|---|
| Hours filled | Sum of `individual_appointments` durations (cancelled & DNA excluded) |
| Available hours | Per-clinician weekday roster set in **Settings** (Cliniko's API doesn't expose diaries), minus `unavailable_blocks` fetched from Cliniko |
| New patients | Appointments whose appointment-type name contains any of the configured patterns ("new patient", "initial", ...) |
| F/Up booked | New-patient appointments where the same patient has any later booking |
| Projection | Full rostered availability and all booked hours for the month, including future weeks |
| Actual | Completed weeks only |

## Colour coding

- Green: at/above target
- Amber: within 75% of target
- Red: well below target
- Purple: over 100% (over capacity)
- Grey: future weeks

Targets (business-wide and per clinician), roster hours, months shown and
new-patient patterns are all editable in Settings and persist in the browser.

## Security note

The Cliniko API key is entered in the browser and kept only in that browser's
local storage. It's sent with each request to the proxy (via the
`X-Cliniko-Api-Key` header), which relays to Cliniko — the proxy stores no
credentials. The proxy exists only because Cliniko's API has no CORS support.

Because the key lives in the browser, only run this on machines/browsers you
trust, and prefer a read-only Cliniko API key.
