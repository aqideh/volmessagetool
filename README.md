# Volunteer Message Tool

A local-first browser tool for managing volunteer event rosters and preparing personalised WhatsApp messages.

## Phase 1 scope

- Create and archive events
- Upload CSV/XLS/XLSX rosters
- Add late sign-ups manually
- Normalize and validate phone numbers
- Detect duplicate phone numbers within an event
- Preserve extra spreadsheet columns as message variables
- Compose and preview personalised messages
- Open a volunteer's WhatsApp chat with the message pre-filled
- Track Pending / Opened / Sent / Skipped / Error statuses manually
- Search rosters
- Export and restore browser-local backups

## Privacy model

Phase 1 has no application backend, cloud database, authentication service, or WhatsApp API integration. Volunteer data is stored in the user's browser via IndexedDB. The deployed application serves static application code; event rosters and message logs are not intentionally uploaded to the application server.

Clearing browser site data can erase records. Use the built-in backup export regularly.

## WhatsApp handoff

The application uses standard WhatsApp click-to-chat links. It does not automate WhatsApp Web and cannot verify whether a message was delivered or read. "Opened" means the app launched the WhatsApp handoff; "Sent" is a staff-confirmed status.

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
- Role / Volunteer Role / Assignment / Station (optional)

Other columns are retained and normalized for use as message variables. For example, a `Shift Name` column can be referenced as `{{shiftname}}`.

Singapore 8-digit phone numbers are automatically interpreted as `+65` numbers. International numbers should include their country code.

## Architecture

- Next.js + TypeScript
- IndexedDB via Dexie
- PapaParse for CSV
- SheetJS for Excel roster import
- libphonenumber-js for phone validation
- GitHub Actions for typecheck and production build

## Future roadmap

Versions 2-4 are explicitly deferred. They are documented in [`docs/ROADMAP.md`](docs/ROADMAP.md) for future developers and should not be implemented as part of Phase 1 unless the project scope changes.
