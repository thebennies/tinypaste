import { escapeHtml, renderMarkdown } from "./markdown.js";

function titleFromMarkdown(markdown) {
  const line = markdown
    .split(/\r?\n/)
    .map((value) => value.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  return line ? line.slice(0, 80) : "tinypaste";
}

export function page(title, body, scripts = "") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">
<link rel="stylesheet" href="/style.css">
${scripts}
</head>
<body>
${body}
</body>
</html>`;
}

function navHtml(extra = "", options = {}) {
  const about = options.showAbout
    ? '<a class="about-link" href="/about">about</a>'
    : "";

  return `<nav aria-label="Main">
    <a class="brand" href="/">tinypaste</a>
    ${about}
    ${extra}
  </nav>`;
}

export function editorPage(error = "") {
  const errorHtml = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : "";

  return page(
    "tinypaste",
    `<div class="editor-shell">
  <header class="editor-header">
    ${navHtml("", { showAbout: true })}
    ${errorHtml}
  </header>
  <div class="editor-layout">
    <div class="editor-pane">
      <form id="editor-form" method="post" action="/">
        <label class="visually-hidden" for="markdown">Markdown</label>
        <textarea id="markdown" name="markdown" autofocus spellcheck="true" placeholder="# Paste Markdown"></textarea>
        <div class="editor-actions">
          <select id="ttl" aria-label="Expiry">
            <option value="">never</option>
            <option value="1h">1 hour</option>
            <option value="24h">24 hours</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
          </select>
          <button id="publish" type="submit">Publish</button>
        </div>
      </form>
    </div>
    <div class="editor-preview" aria-label="Preview">
      <div id="preview" class="markdown"></div>
    </div>
  </div>
</div>`,
    `<script type="module" src="/editor.js"></script>`,
  );
}

export async function aboutPage() {
  const readme = await Deno.readTextFile(
    new URL("../README.md", import.meta.url),
  );

  return page(
    "tinypaste readme",
    `<main class="shell">
  ${navHtml()}
  <article class="markdown">${renderMarkdown(readme)}</article>
</main>`,
  );
}

export function formatExpiry(expiresAt) {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "expired";
  if (ms < 3_600_000) return `expires in ${Math.ceil(ms / 60_000)}m`;
  if (ms < 86_400_000) return `expires in ${Math.ceil(ms / 3_600_000)}h`;
  return `expires in ${Math.ceil(ms / 86_400_000)}d`;
}

export function expiredPage() {
  return page(
    "tinypaste — expired",
    `<main class="shell">
  ${navHtml()}
  <p class="expired-notice">This paste has expired.</p>
  <p><a href="/">Create a new paste →</a></p>
</main>`,
  );
}

export function viewPage(id, paste) {
  const title = titleFromMarkdown(paste.markdown);
  const expiryHtml = paste.expiresAt
    ? `<span class="expiry-notice">${formatExpiry(paste.expiresAt)}</span>`
    : "";

  return page(
    title,
    `<main class="shell">
  ${navHtml(`<a href="/${id}.md">raw</a> <a href="/?remix=${id}">remix</a>${expiryHtml}`)}
  <article class="markdown">${renderMarkdown(paste.markdown)}</article>
</main>`,
    `<script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js"></script>
<script type="module">
import mermaid from "https://esm.sh/mermaid@11.14.0";
window.mermaid = mermaid;
await import("/view.js");
</script>`,
  );
}
