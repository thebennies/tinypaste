# Fork/Remix + Paste Expiry Design

**Date:** 2026-05-11
**Branch:** dev/workflow-overhaul
**Scope:** Two independent features added on top of the workflow overhaul

---

## Feature 1: Fork/Remix

### Goal

Let any viewer remix an existing paste — open it pre-filled in the editor as a new draft, ready to edit and publish as a new paste. No server-side copy. No link between original and remix.

### Flow

1. View page nav gets a `remix` link: `raw · remix`
2. Clicking navigates to `/?remix=<id>`
3. Server returns the normal editor page (no server-side change — `GET /` ignores query params)
4. `EDITOR_SCRIPT` detects `?remix=<id>` via `URLSearchParams`:
   - Calls `history.replaceState(null, "", "/")` to clean the URL immediately
   - Fetches `/<id>.md` (raw Markdown endpoint, already exists)
   - On success: populates `#markdown`, saves to `localStorage` as draft, renders preview, enables publish button
   - On failure: shows inline error via `setError()`
5. If no remix param: normal draft restore flow (unchanged)

**Draft override:** Remix always overwrites any existing draft — user navigated here intentionally.

### Changes

- `viewPage()`: add `<a href="/?remix=${id}">remix</a>` to nav extra
- `EDITOR_SCRIPT`: replace unconditional draft restore with remix-or-restore branch

---

## Feature 2: Paste Expiry

### Goal

Allow pastes to have an optional TTL. Default is permanent (existing behavior unchanged). After expiry, the paste shows a custom "expired" page — not a generic 404.

### Data model

`expiresAt` (epoch ms) added as an optional field to the paste object:

```
{ createdAt, html, markdown, expiresAt? }
```

No KV TTL used — `expiresAt` is checked at read time. Storage overhead is negligible for a hobby project.

### API

`POST /api/pastes?ttl=1h|24h|7d|30d` — optional query param. Absent = permanent.

`parseTtl()` maps param string to milliseconds:
- `1h` → 3,600,000
- `24h` → 86,400,000
- `7d` → 604,800,000
- `30d` → 2,592,000,000

### Read-time expiry check

`getPaste()` returns `{ expired: true }` (not null) when `paste.expiresAt` is past. Callers distinguish "never existed" (null) from "expired" (`{ expired: true }`).

### HTTP status for expired pastes

- `GET /<id>` → 410 Gone, HTML expired page
- `GET /<id>.md` → 410 Gone, plain text error
- `GET /<id>.html` → 410 Gone, plain text error

### Expired page

`expiredPage()` — minimal page with "This paste has expired." and a "Create a new paste →" link to `/`.

### View page expiry notice

When `paste.expiresAt` is set, a `<span class="expiry-notice">` is injected into the nav showing relative time: `expires in 6h`, `expires in 3d`, etc. Computed by `formatExpiry(expiresAt)`.

### Editor UI

A `<select id="ttl">` in `.editor-actions` alongside the Publish button:

```
never | 1 hour | 24 hours | 7 days | 30 days
```

Default: `never`. When publishing, if a TTL is selected the fetch URL becomes `/api/pastes?ttl=<value>`.

### CSS additions

- `.expiry-notice` — small muted text in nav
- `.expired-notice` — muted paragraph on expired page
- `#ttl` — borderless select, muted color, matches aesthetic

---

## Constraints

- No server-side copy for remix — purely client-side
- Permanent is the default — zero behavior change for existing pastes
- No UI to update expiry after publishing
- No-JS fallback creates permanent pastes (no TTL select interaction)
