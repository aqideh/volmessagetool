# Volunteer Message Tool

A local-first browser tool for managing volunteer event rosters, multiple shifts, and personalised WhatsApp message campaigns.

## Current scope

- Create and archive events
- Create multiple shifts per event
- Store shift-specific date, start/end time, reporting time, venue and notes
- Upload CSV/XLS/XLSX rosters
- Match roster rows to shifts using a `Shift` / `Shift Name` column, with a selectable fallback shift
- Add late sign-ups manually
- Assign one volunteer to multiple shifts without duplicating the person
- Store roles per shift assignment
- Normalize and validate phone numbers
- Preserve extra spreadsheet columns as message variables
- Create multiple message campaigns per event
- Target a message to all event volunteers or one specific shift
- Preview shift-aware variables such as `{{shift_name}}`, `{{reporting_time}}`, `{{shift_start}}`, `{{shift_end}}`, `{{shift_venue}}` and `{{role}}`
- Open a volunteer's WhatsApp chat with the message pre-filled
- Track Pending / Opened / Sent / Skipped / Error independently for every campaign
- Keep active campaigns dynamic so eligible late additions appear automatically
- Close campaigns to freeze their recipient list
- Search/filter rosters by shift
- Export and restore browser-local backups
- Restore legacy version 1 backups

## Data migration

The IndexedDB schema is version 2. Existing version 1 browser data is upgraded automatically and non-destructively:

- every existing event receives a `Main Shift`
- every existing volunteer is assigned to that shift
- the previous volunteer-level role is copied to the new shift assignment
- existing campaigns become event-wide active campaigns
- existing send history is retained

Existing events and rosters should not need to be recreated after deployment.

## Privacy model

The current application has no application backend, cloud database, authentication service, or WhatsApp API integration. Volunteer data is stored in the user's browser via IndexedDB. The deployed application serves static application code; event rosters and message logs are not intentionally uploaded to the application server.

Clearing browser site data can erase records. Use the built-in backup export regularly.

## WhatsApp handoff

The application uses standard WhatsApp click-to-chat links. It does not automate WhatsApp Web and cannot verify whether a message was delivered or read. `Opened` means the app launched the WhatsApp handoff; `Sent` is a staff-confirmed status.

## Development

```bash
npm install
npm run dev
```

Checks:

```bash
npm run typecheck
npm run build
```

## Roster format

The importer accepts CSV, XLS, and XLSX. It attempts to identify these columns automatically:

- Name / Full Name / Volunteer Name
- Phone / Mobile / Contact Number
- Shift / Shift Name / Time Slot / Slot (optional)
- Role / Volunteer Role / Assignment / Station (optional)

If `Shift` is omitted, imported rows are assigned to the fallback shift selected in the roster screen. If a supplied shift name does not match an event shift, that row is skipped and the unknown value is reported.

Other columns are retained and normalized for use as message variables.

Singapore 8-digit phone numbers are automatically interpreted as `+65` numbers. International numbers should include their country code.

## Architecture

- Next.js + TypeScript
- IndexedDB via Dexie
- PapaParse for CSV
- SheetJS for Excel roster import
- libphonenumber-js for phone validation
- GitHub Actions for typecheck and production build

Core local tables:

- `events`
- `shifts`
- `volunteers`
- `assignments`
- `campaigns`
- `sendRecords`

## Future roadmap

Versions 2-4 from the original product roadmap remain deferred and are documented in [`docs/ROADMAP.md`](docs/ROADMAP.md). The multiple-shift and multiple-campaign work described above is part of the current local-first scope and does not introduce cloud storage, automated sending, or the WhatsApp Business Platform.
