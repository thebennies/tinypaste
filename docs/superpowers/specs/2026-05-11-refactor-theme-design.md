# Refactor + Dribbble Theme Design

**Date:** 2026-05-11
**Branch:** dev/workflow-overhaul
**Scope:** Full module extraction and Dribbble-inspired visual theme

---

## Refactor

### Problem

`main.js` has grown to 1535 lines with server logic, CSS (503 lines), and two client JS bundles (VIEW_SCRIPT, EDITOR_SCRIPT) all inline as template literal constants. Every concern is interleaved, making each one harder to edit in isolation.

### Module structure

```
main.js              — entry point only (~20 lines)
lib/
  config.js          — ID_ALPHABET, RESERVED_IDS, configFromEnv
  markdown.js        — MarkdownIt setup, renderMarkdown, escapeHtml
  store.js           — all data + business logic: makeHttpError, makeId,
                       randomIndex, parseTtl, byteLength, assertMarkdownSize,
                       extractMarkdown, getPaste, savePaste, hitRate,
                       clientIp, createPaste
  pages.js           — page, navHtml, editorPage, aboutPage, viewPage,
                       expiredPage, formatExpiry, titleFromMarkdown
  handler.js         — response, corsHeaders, acceptsJson, publicUrl,
                       handleError, createHandler
public/
  style.css          — all CSS (replaces STYLE constant)
  view.js            — Mermaid/pan-zoom client script (replaces VIEW_SCRIPT)
  editor.js          — live-preview editor script (replaces EDITOR_SCRIPT)
```

### Dependency graph (no circular deps)

```
config.js   → (nothing)
markdown.js → (nothing)
store.js    → config.js, markdown.js
pages.js    → markdown.js
handler.js  → config.js, store.js, pages.js
main.js     → config.js, handler.js
```

### Static asset serving

`main.js` reads all three static assets at startup via `Deno.readTextFile` and passes them to `createHandler` as options (`style`, `viewScript`, `editorScript`). No per-request file I/O.

---

## Dribbble Theme

### Design principles

Dribbble's aesthetic: vibrant pink primary, clean geometric sans-serif, generous whitespace, rounded corners, polished micro-interactions.

### Color palette

| Token | Value | Use |
|---|---|---|
| `--accent` | `#ea4c89` | Buttons, links, focus rings, brand |
| `--accent-dark` | `#d63b78` | Hover states |
| `--accent-light` | `#fdf2f8` | Inline code background, blockquote tint |
| `--fg` | `#111827` | Body text |
| `--muted` | `#6b7280` | Secondary text, nav links |
| `--line` | `#e5e7eb` | Borders |
| `--surface` | `#f9fafb` | Code blocks, surfaces |
| `--danger` | `#ef4444` | Error text |

### Typography

Load Inter from Google Fonts (`weights 400 500 600 700`). Body: `"Inter", system-ui, -apple-system, sans-serif`. `-webkit-font-smoothing: antialiased`.

### Key component changes

**Buttons** — pill shape (`border-radius: 20px`), pink fill, `font-weight: 500`, scale-down on active.

**Inputs/select** — `border-radius: 10px` on textarea, `border-radius: 20px` on TTL select (pill), pink border on focus with soft glow (`box-shadow: 0 0 0 3px rgba(234,76,137,0.12)`).

**Nav** — brand in pink `#ea4c89`, other nav links in muted gray.

**Links** — pink `var(--accent)`.

**Code blocks** — `pre` gets rounded corners (`border-radius: 10px`), border instead of left-border only. Inline code gets pink tint (`var(--accent-light)`) with pink text (`var(--accent-dark)`).

**Blockquotes** — pink left border, light pink background tint.

**Expiry badge** — pill-shaped badge in nav (`border-radius: 20px`, surface background).

**Mermaid diagrams** — rounded frame (`border-radius: 12px`), pink-tinted theme variables (`primaryBorderColor: #ea4c89`, `mainBkg: #fdf2f8`).

**Confirm button** — outlined pink (`border: 2px solid var(--accent)`, transparent background) for the "confirming" state.
