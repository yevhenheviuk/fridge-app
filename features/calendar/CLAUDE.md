# Feature: calendar — 📅 Календар

Month grid (Mon-first) with dots for events and due todos; selected day list;
add an event with optional time.

**Own files:** `features/calendar/*`, `worker/tools/calendar.js`
**Owns table:** `events` (title, d, h 'HH:MM' | null) — app loads from 60 days ago
**Reads:** `todos` (owned by todo — read only here)
**MCP:** list_events, add_event, delete_event
