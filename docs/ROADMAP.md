# Product Roadmap

This roadmap records future directions without expanding the current build scope. Phase 1 is the only active implementation target.

## Version 1 — Local-first messaging assistant (current)

Goal: remove repetitive roster/message preparation while keeping the final WhatsApp send under staff control.

Included:
- event creation and archive
- CSV/XLS/XLSX roster import
- roster maintenance and late sign-ups
- duplicate and phone validation
- message templates and variables
- personalised preview
- WhatsApp click-to-chat handoff
- manual send-status tracking
- roster search/filtering
- browser-local IndexedDB persistence
- JSON backup and restore

Explicitly excluded:
- automated WhatsApp sending
- delivery/read receipts
- cloud roster storage
- multi-user collaboration
- authentication
- scheduling
- server-side jobs

## Version 2 — Operational improvements (deferred)

Consider only after Phase 1 has been used in real operations and pain points are known.

Potential scope:
- reusable template library across events
- multiple campaigns per event (initial details, reminder, day-before, thank-you)
- richer import mapping UI for unusual roster formats
- bulk status actions and improved queue filters
- cross-event duplicate/contact history indicators
- configurable event fields and saved defaults
- exportable messaging/audit logs
- optional installable PWA enhancements
- accessibility and keyboard-navigation refinements

No cloud backend is implied by Version 2.

## Version 3 — Shared/cloud multi-user version (deferred)

Consider only if multiple staff need the same live roster and send history across devices.

Potential scope:
- staff authentication
- shared cloud database
- organisation/team workspaces
- role-based permissions
- shared events and rosters
- per-action staff attribution, e.g. "Sent by Aiman at 10:42"
- server-side audit history
- concurrency/conflict handling
- retention controls and administrative data deletion
- formal privacy/security review before production use

Architecture should be chosen at that time rather than assumed now. Possible options include Supabase/Postgres or another approved organisational platform.

## Version 4 — Official WhatsApp Business Platform integration (deferred)

Consider only if true automated sending, delivery tracking, or inbound-reply workflows justify the cost and governance overhead.

Potential scope:
- official WhatsApp Business Platform integration
- approved message-template management
- API-based sending
- sent/delivered/read status ingestion where available
- scheduled reminder campaigns
- inbound reply handling
- opt-out/suppression management
- rate-limit and failure handling
- credential and webhook security
- usage/cost monitoring

Do not implement unofficial WhatsApp Web automation, headless-browser auto-sending, or reverse-engineered WhatsApp protocols as a substitute for the official platform.

## Decision principle for future developers

Do not advance versions simply because the technical capability exists. Move beyond Phase 1 only when a demonstrated operational need outweighs the additional privacy, security, maintenance, and platform-compliance burden.
