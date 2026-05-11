# Workflow Overhaul Design

**Date:** 2026-05-11  
**Branch:** dev/workflow-overhaul  
**Scope:** Editor screenflow redesign, live preview, localStorage autosave, view page visual overhaul, security headers

---

## Goals

Turn tinypaste's editor into a dual-pane write/preview experience that matches how a tool-focused user actually works: see your output as you write, publish with one deliberate two-click action, and never lose a draft to an accidental close.

---

## Screenflow

### Editor states

| State | What the user sees |
|---|---|
| **Empty** | Full-width textarea, placeholder text, publish button disabled |
| **Writing** | Left: monospace textarea. Right: live rendered preview (debounced 300 ms). Publish enabled. |
| **Confirming** | First publish click → button text becomes `"Confirm — this will be public"`. Auto-resets after 3 s if no second click. |
| **Publishing** | Second click → `"Publishing…"`, button disabled, fetch in flight. |
| **Published** | `localStorage` draft cleared, redirect to `/<id>`. |

### Layout

- **Desktop (≥720 px):** CSS grid, two equal columns — editor left, preview right. Both always visible. Full-height viewport, no page scroll.
- **Mobile (<720 px):** Single column, stacked — textarea on top, preview below. Body scrolls naturally.

### Draft autosave

- Key: `tinypaste:draft` in `localStorage`
- Save: debounced 300 ms alongside preview render
- Restore: on page load, pre-populate textarea and render preview immediately
- Clear: after successful publish

---

## Architecture

### Approach: Fat editor client

The editor page loads markdown-it + all plugins from esm.sh as an ES module (`/editor.js`). Preview renders entirely client-side — zero network round-trips. On publish, a `fetch` POST hits the existing `/api/pastes`. The server still renders the authoritative HTML at save time; storage is unchanged.

The no-JS fallback remains: form `method="post" action="/"` still works without JavaScript.

### New route

`GET /editor.js` — serves `EDITOR_SCRIPT` as `application/javascript`, same pattern as existing `/view.js` and `/style.css`.

### Security headers

Applied to every response via a wrapper in `createHandler`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## Components

### `EDITOR_SCRIPT` (`/editor.js`)

ES module. Loads markdown-it + 9 plugins from esm.sh — same versions as the server, so preview matches published output exactly (KaTeX renders, Mermaid shows as source code block since mermaid.js is not initialized in the editor).

Responsibilities:
- Draft restore on load
- Debounced preview render + localStorage save (300 ms)
- Two-step publish confirmation (3 s auto-reset)
- Fetch POST → redirect on success, inline error on failure
- Publish button disabled state management

### `editorPage()` HTML

Replaces the old `.shell` layout. New structure:

```
div.editor-shell
  header.editor-header        ← nav + error messages
  div.editor-layout           ← CSS grid
    div.editor-pane           ← left column
      form#editor-form        ← method="post" action="/" (no-JS fallback)
        textarea#markdown
        div.editor-actions    ← publish button, right-aligned
    div.editor-preview        ← right column
      div#preview.markdown    ← rendered HTML
```

### CSS changes

**Editor layout:**
- `body:has(.editor-shell)` — locks viewport height and hides overflow on desktop
- `.editor-layout` — `display: grid; grid-template-columns: 1fr 1fr`
- `#markdown` — monospace font, `flex: 1`, no border, no resize
- `#preview:empty::before` — placeholder text when empty
- `button:disabled` — 0.45 opacity, `cursor: not-allowed`
- `#publish[data-state="confirming"]` — inverted colors (ghost button)
- Mobile breakpoint at 720 px: single column, `resize: vertical` on textarea

**View page improvements:**
- `.markdown :not(pre) > code` — `background: var(--surface)` + padding
- `.markdown mark` — highlight background
- `.markdown ins` — underline with muted color
- `.markdown del` — reduced opacity
- `.markdown sub, sup` — correct font size
- `.markdown abbr[title]` — dotted underline + help cursor

---

## Constraints

- No accounts, no dark mode, no CI changes — hobby project
- Single `main.js` file maintained — no module splitting
- Deno KV storage unchanged
- API contract unchanged (`POST /api/pastes` returns URL)
