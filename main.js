import MarkdownIt from "npm:markdown-it@14.1.0";
import markdownItAbbr from "npm:markdown-it-abbr@2.0.0";
import markdownItDeflist from "npm:markdown-it-deflist@3.0.0";
import markdownItFootnote from "npm:markdown-it-footnote@4.0.0";
import markdownItIns from "npm:markdown-it-ins@4.0.0";
import markdownItKatex from "npm:markdown-it-katex@2.0.3";
import markdownItMark from "npm:markdown-it-mark@4.0.0";
import markdownItSub from "npm:markdown-it-sub@2.0.0";
import markdownItSup from "npm:markdown-it-sup@2.0.0";
import markdownItTaskLists from "npm:markdown-it-task-lists@2.1.1";

const ID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const RESERVED_IDS = new Set([
  "about",
  "api",
  "favicon",
  "health",
  "mermaid",
  "readme",
  "robots",
  "style",
  "view",
]);
const DEFAULT_MAX_MARKDOWN_BYTES = 128 * 1024;
const encoder = new TextEncoder();

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})
  .use(markdownItAbbr)
  .use(markdownItDeflist)
  .use(markdownItFootnote)
  .use(markdownItIns)
  .use(markdownItKatex)
  .use(markdownItMark)
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItTaskLists, { enabled: false });

const defaultFence = md.renderer.rules.fence;

md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0].toLowerCase();

  if (language === "mermaid" || language === "mmd") {
    return `<figure class="mermaid-diagram" data-mermaid><pre class="mermaid-source">${
      escapeHtml(token.content)
    }</pre></figure>`;
  }

  return defaultFence(tokens, index, options, env, self);
};

function envInteger(name, fallback) {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function configFromEnv() {
  return {
    baseUrl: Deno.env.get("BASE_URL")?.trim() || "",
    idLength: envInteger("ID_LENGTH", 7),
    maxMarkdownBytes: envInteger(
      "MAX_MARKDOWN_BYTES",
      DEFAULT_MAX_MARKDOWN_BYTES,
    ),
    port: envInteger("PORT", 3000),
    rateLimitPosts: envInteger("RATE_LIMIT_POSTS", 20),
    rateLimitWindowSeconds: envInteger("RATE_LIMIT_WINDOW_SECONDS", 3600),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function randomIndex(max) {
  const limit = Math.floor(256 / max) * max;
  const bytes = new Uint8Array(1);

  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= limit);

  return bytes[0] % max;
}

function makeId(length) {
  let id = "";

  for (let index = 0; index < length; index += 1) {
    id += ID_ALPHABET[randomIndex(ID_ALPHABET.length)];
  }

  return id;
}

function makeHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function titleFromMarkdown(markdown) {
  const line = markdown
    .split(/\r?\n/)
    .map((value) => value.replace(/^#+\s*/, "").trim())
    .find(Boolean);

  return line ? line.slice(0, 80) : "tinypaste";
}

function publicUrl(request, config, path) {
  const requestUrl = new URL(request.url);
  const baseUrl = config.baseUrl || requestUrl.origin;
  return new URL(path, baseUrl).toString();
}

export function renderMarkdown(markdown) {
  return md.render(markdown);
}

function byteLength(value) {
  return encoder.encode(value).byteLength;
}

function assertMarkdownSize(value, maxMarkdownBytes) {
  if (byteLength(value) <= maxMarkdownBytes) {
    return;
  }

  throw makeHttpError(
    413,
    `Markdown is too large. Limit is ${maxMarkdownBytes} bytes.`,
  );
}

async function extractMarkdown(request, maxMarkdownBytes) {
  const contentType = request.headers.get("content-type") || "";

  if (
    contentType.includes("application/json") || contentType.includes("+json")
  ) {
    const body = await request.text();
    let json;

    try {
      json = JSON.parse(body);
    } catch {
      throw makeHttpError(400, 'Expected JSON like {"markdown":"# text"}.');
    }

    const value = json.markdown ?? json.content ?? json.text;

    if (typeof value !== "string") {
      throw makeHttpError(400, 'Expected JSON like {"markdown":"# text"}.');
    }

    assertMarkdownSize(value, maxMarkdownBytes);

    return value;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    const value = form.get("markdown");

    if (typeof value !== "string") {
      throw makeHttpError(400, "Expected Markdown in the markdown form field.");
    }

    assertMarkdownSize(value, maxMarkdownBytes);

    return value;
  }

  const value = await request.text();

  assertMarkdownSize(value, maxMarkdownBytes);

  return value;
}

function response(
  body,
  status = 200,
  contentType = "text/plain; charset=utf-8",
  headers = {},
) {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      ...headers,
    },
  });
}

function corsHeaders(headers = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
    "access-control-max-age": "86400",
    ...headers,
  };
}

function page(title, body, scripts = "") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
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

function editorPage(error = "") {
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

async function aboutPage() {
  const readme = await Deno.readTextFile(
    new URL("./README.md", import.meta.url),
  );

  return page(
    "tinypaste readme",
    `<main class="shell">
  ${navHtml()}
  <article class="markdown">${renderMarkdown(readme)}</article>
</main>`,
  );
}

function viewPage(id, paste) {
  const title = titleFromMarkdown(paste.markdown);

  return page(
    title,
    `<main class="shell">
  ${navHtml(`<a href="/${id}.md">raw</a>`)}
  <article class="markdown">${paste.html}</article>
</main>`,
    `<script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js"></script>
<script type="module">
import mermaid from "https://esm.sh/mermaid@11.14.0";
window.mermaid = mermaid;
await import("/view.js");
</script>`,
  );
}

async function getPaste(kv, id) {
  const entry = await kv.get(["paste", id]);
  return entry.value || null;
}

async function savePaste(kv, id, paste) {
  const result = await kv.atomic()
    .check({ key: ["paste", id], versionstamp: null })
    .set(["paste", id], paste)
    .commit();

  return result.ok;
}

async function hitRate(kv, ip, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const resetSeconds = windowStart + windowSeconds - now;
  const key = ["rate", ip, windowStart];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await kv.get(key);
    const count = (typeof entry.value === "number" ? entry.value : 0) + 1;
    const result = await kv.atomic()
      .check(entry)
      .set(key, count, { expireIn: (resetSeconds + 5) * 1000 })
      .commit();

    if (result.ok) {
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetSeconds,
      };
    }
  }

  throw makeHttpError(503, "Could not update rate limit.");
}

function clientIp(request, info) {
  if (info && info.remoteAddr) {
    return info.remoteAddr.hostname;
  }

  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip") || "unknown";
}

async function createPaste(request, kv, config, info) {
  const rate = await hitRate(
    kv,
    clientIp(request, info),
    config.rateLimitPosts,
    config.rateLimitWindowSeconds,
  );

  if (!rate.allowed) {
    const error = makeHttpError(
      429,
      `Rate limit exceeded. Retry in ${rate.resetSeconds} seconds.`,
    );
    error.resetSeconds = rate.resetSeconds;
    throw error;
  }

  const markdown = await extractMarkdown(request, config.maxMarkdownBytes);

  if (!markdown.trim()) {
    throw makeHttpError(400, "Markdown cannot be empty.");
  }

  const paste = {
    createdAt: new Date().toISOString(),
    html: renderMarkdown(markdown),
    markdown,
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = makeId(config.idLength);

    if (RESERVED_IDS.has(id.toLowerCase())) {
      continue;
    }

    if (await savePaste(kv, id, paste)) {
      return { id, paste, rate };
    }
  }

  throw makeHttpError(503, "Could not allocate a paste id.");
}

function acceptsJson(request) {
  const accept = request.headers.get("accept") || "";

  return accept.split(",").some((part) => {
    const type = part.split(";")[0].trim().toLowerCase();
    return type === "application/json" || type.endsWith("+json");
  });
}

function handleError(error, request) {
  const status = error.status || 500;
  const message = status === 500 ? "Internal server error." : error.message;
  const headers = {};
  const url = new URL(request.url);
  const isApiRequest = url.pathname === "/api/pastes";

  if (status === 429 && error.resetSeconds) {
    headers["retry-after"] = String(error.resetSeconds);
  }

  if (isApiRequest) {
    Object.assign(headers, corsHeaders());
    if (acceptsJson(request)) {
      return response(
        JSON.stringify({ error: message }),
        status,
        "application/json; charset=utf-8",
        headers,
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/" && status < 500) {
    return response(
      editorPage(message),
      status,
      "text/html; charset=utf-8",
      headers,
    );
  }

  return response(`${message}\n`, status, "text/plain; charset=utf-8", headers);
}

export function createHandler(options = {}) {
  const kv = options.kv;
  const config = options.config || configFromEnv();

  if (!kv) {
    throw new Error("KV store is required.");
  }

  const secHeaders = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
  };

  async function route(request, info) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (request.method === "GET" && pathname === "/health") {
        return response("ok\n");
      }

      if (request.method === "GET" && pathname === "/style.css") {
        return response(STYLE, 200, "text/css; charset=utf-8");
      }

      if (request.method === "GET" && pathname === "/view.js") {
        return response(
          VIEW_SCRIPT,
          200,
          "application/javascript; charset=utf-8",
        );
      }

      if (request.method === "GET" && pathname === "/editor.js") {
        return response(
          EDITOR_SCRIPT,
          200,
          "application/javascript; charset=utf-8",
        );
      }

      if (request.method === "GET" && pathname === "/favicon.ico") {
        return new Response(null, { status: 204 });
      }

      if (request.method === "GET" && pathname === "/") {
        return response(editorPage(), 200, "text/html; charset=utf-8");
      }

      if (request.method === "GET" && pathname === "/about") {
        return response(await aboutPage(), 200, "text/html; charset=utf-8");
      }

      if (request.method === "POST" && pathname === "/") {
        const { id } = await createPaste(request, kv, config, info);
        return new Response(null, {
          status: 303,
          headers: { location: `/${id}` },
        });
      }

      if (request.method === "POST" && pathname === "/api/pastes") {
        const { id, rate } = await createPaste(request, kv, config, info);
        const url = publicUrl(request, config, `/${id}`);
        const headers = corsHeaders({
          "x-ratelimit-limit": String(config.rateLimitPosts),
          "x-ratelimit-remaining": String(rate.remaining),
          "x-ratelimit-reset": String(rate.resetSeconds),
        });

        if (acceptsJson(request)) {
          return response(
            JSON.stringify({ id, url }),
            201,
            "application/json; charset=utf-8",
            headers,
          );
        }

        return response(`${url}\n`, 201, "text/plain; charset=utf-8", headers);
      }

      if (request.method === "OPTIONS" && pathname === "/api/pastes") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(),
        });
      }

      const rawMatch = pathname.match(/^\/([0-9a-zA-Z]+)\.md$/);

      if (request.method === "GET" && rawMatch) {
        const paste = await getPaste(kv, rawMatch[1]);

        if (!paste) {
          throw makeHttpError(404, "Paste not found.");
        }

        return response(paste.markdown, 200, "text/markdown; charset=utf-8");
      }

      const htmlMatch = pathname.match(/^\/([0-9a-zA-Z]+)\.html$/);

      if (request.method === "GET" && htmlMatch) {
        const paste = await getPaste(kv, htmlMatch[1]);

        if (!paste) {
          throw makeHttpError(404, "Paste not found.");
        }

        return response(paste.html, 200, "text/html; charset=utf-8");
      }

      const viewMatch = pathname.match(/^\/([0-9a-zA-Z]+)$/);

      if (request.method === "GET" && viewMatch) {
        const id = viewMatch[1];
        const paste = await getPaste(kv, id);

        if (!paste) {
          throw makeHttpError(404, "Paste not found.");
        }

        return response(viewPage(id, paste), 200, "text/html; charset=utf-8");
      }

      return response("Not found.\n", 404);
    } catch (error) {
      if (!error.status || error.status >= 500) {
        console.error(error);
      }

      return handleError(error, request);
    }
  }

  return async (request, info) => {
    const res = await route(request, info);
    for (const [k, v] of Object.entries(secHeaders)) {
      res.headers.set(k, v);
    }
    return res;
  };
}

export const STYLE = `
:root {
  color-scheme: light;
  --bg: #ffffff;
  --fg: #111111;
  --muted: #666666;
  --line: #dddddd;
  --accent: #111111;
  --danger: #9f1d20;
  --surface: #fafafa;
}

* { box-sizing: border-box; }

html { font-size: 18px; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  line-height: 1.55;
}

a {
  color: var(--accent);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.16em;
}

a:focus-visible,
textarea:focus-visible,
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  border: 0;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.shell {
  width: min(100% - 32px, 780px);
  margin: 0 auto;
  padding: 28px 0 56px;
}

nav {
  display: flex;
  gap: 18px;
  align-items: baseline;
  margin-bottom: 26px;
  font-size: 0.88rem;
}

.brand {
  color: var(--fg);
  font-weight: 700;
}

.about-link { color: var(--muted); }

form {
  display: grid;
  gap: 14px;
}

textarea {
  width: 100%;
  min-height: min(64vh, 680px);
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 0;
  background: #ffffff;
  color: var(--fg);
  padding: 16px;
  font: inherit;
  line-height: 1.45;
}

textarea::placeholder {
  color: var(--muted);
  opacity: 1;
}

button {
  justify-self: start;
  border: 1px solid var(--fg);
  border-radius: 0;
  background: var(--fg);
  color: var(--bg);
  padding: 8px 14px;
  font: inherit;
  cursor: pointer;
}

button:hover {
  background: var(--accent);
  border-color: var(--accent);
}

button:active {
  background: var(--muted);
  border-color: var(--muted);
}

.error {
  margin: 0 0 18px;
  color: var(--danger);
}

.markdown { overflow-wrap: break-word; }
.markdown > *:first-child { margin-top: 0; }

.markdown h1,
.markdown h2,
.markdown h3 {
  line-height: 1.15;
  margin: 1.7em 0 0.55em;
}

.markdown h1 { font-size: 2rem; }
.markdown h2 { font-size: 1.45rem; }
.markdown h3 { font-size: 1.15rem; }

.markdown pre,
.markdown code {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 0.88em;
}

.markdown pre {
  overflow: auto;
  border-left: 3px solid var(--line);
  background: var(--surface);
  padding: 12px 14px;
}

.markdown blockquote {
  margin-left: 0;
  padding-left: 18px;
  border-left: 3px solid var(--line);
  color: var(--muted);
}

.markdown img { max-width: 100%; }

.markdown ul,
.markdown ol { padding-left: 1.35em; }

.markdown li + li { margin-top: 0.18em; }
.markdown .contains-task-list { padding-left: 1.1em; }
.markdown .task-list-item { list-style: none; }

.markdown .task-list-item-checkbox {
  margin: 0 0.45em 0 -1.1em;
  accent-color: var(--fg);
  pointer-events: none;
}

.markdown table {
  width: 100%;
  border-collapse: collapse;
}

.markdown th,
.markdown td {
  border-bottom: 1px solid var(--line);
  padding: 6px 8px 6px 0;
  text-align: left;
}

.mermaid-diagram {
  position: relative;
  margin: 1.45rem 0;
  border: 1px solid var(--line);
  background: #ffffff;
}

.mermaid-source { margin: 0; }

.mermaid-frame {
  position: relative;
  height: clamp(260px, 56vh, 620px);
  overflow: hidden;
  background: #ffffff;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.mermaid-frame:active { cursor: grabbing; }
.mermaid-frame.is-grabbing { cursor: grabbing; }

.mermaid-frame:focus-visible {
  outline: 2px solid var(--fg);
  outline-offset: 2px;
}

.mermaid-open,
.mermaid-close {
  border: 1px solid var(--line);
  background: #ffffff;
  color: var(--muted);
  padding: 4px 8px;
  font: inherit;
  font-size: 0.78rem;
  line-height: 1.2;
  cursor: pointer;
}

.mermaid-open {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}

.mermaid-open:hover,
.mermaid-close:hover {
  color: var(--fg);
  border-color: var(--fg);
}

.mermaid-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  user-select: none;
}

.mermaid-content svg {
  display: block;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
}

.mermaid-error {
  padding: 12px 14px;
  color: var(--muted);
}

.mermaid-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  grid-template-rows: auto 1fr;
  background: #ffffff;
}

.mermaid-fullscreen[hidden] { display: none; }

.mermaid-fullscreen-bar {
  display: flex;
  justify-content: flex-end;
  border-bottom: 1px solid var(--line);
  padding: 8px;
}

.mermaid-fullscreen-frame {
  position: relative;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.mermaid-fullscreen-frame:active { cursor: grabbing; }
.mermaid-fullscreen-frame.is-grabbing { cursor: grabbing; }

@media (max-width: 520px) {
  html { font-size: 16px; }

  .shell {
    width: min(100% - 24px, 780px);
    padding-top: 18px;
  }

  textarea {
    min-height: 68vh;
    padding: 12px;
  }
}

/* ── Editor layout ──────────────────────────────── */

body:has(.editor-shell) {
  overflow: hidden;
  height: 100dvh;
}

.editor-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.editor-header {
  flex: 0 0 auto;
  padding: 16px 24px 0;
}

.editor-header nav {
  margin-bottom: 16px;
}

.editor-header .error {
  margin-bottom: 12px;
}

.editor-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid var(--line);
}

.editor-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--line);
}

.editor-pane form {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
  overflow: hidden;
}

#markdown {
  flex: 1;
  min-height: 0;
  resize: none;
  border: none;
  outline: none;
  padding: 20px 24px;
  font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;
  font-size: 0.875rem;
  line-height: 1.6;
}

.editor-actions {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding: 12px 24px;
  border-top: 1px solid var(--line);
}

.editor-preview {
  overflow-y: auto;
  padding: 20px 24px;
}

#preview:empty::before {
  content: "Preview will appear here";
  color: var(--muted);
  font-style: italic;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

button:disabled:hover {
  background: var(--fg);
  border-color: var(--fg);
}

#publish[data-state="confirming"] {
  background: transparent;
  color: var(--fg);
  border-color: var(--fg);
}

#publish[data-state="confirming"]:hover {
  background: var(--fg);
  color: var(--bg);
}

@media (max-width: 720px) {
  body:has(.editor-shell) {
    overflow: auto;
    height: auto;
  }

  .editor-shell {
    height: auto;
  }

  .editor-layout {
    grid-template-columns: 1fr;
    overflow: visible;
    border-top: none;
  }

  .editor-pane {
    border-right: none;
    border-bottom: 1px solid var(--line);
    overflow: visible;
  }

  .editor-pane form {
    overflow: visible;
    flex: none;
  }

  #markdown {
    min-height: 40vh;
    flex: none;
    resize: vertical;
  }

  .editor-preview {
    padding: 20px 16px;
    min-height: 200px;
  }
}

/* ── View page improvements ─────────────────────── */

.markdown :not(pre) > code {
  background: var(--surface);
  padding: 0.1em 0.35em;
  border-radius: 2px;
  font-size: 0.9em;
}

.markdown mark {
  background: #fff3b8;
  padding: 0 0.15em;
}

.markdown ins {
  text-decoration: underline;
  text-decoration-color: var(--muted);
  text-underline-offset: 0.2em;
}

.markdown del {
  opacity: 0.55;
}

.markdown sub,
.markdown sup {
  font-size: 0.78em;
  line-height: 0;
}

.markdown abbr[title] {
  text-decoration: underline dotted;
  cursor: help;
}
`;

export const VIEW_SCRIPT = `
(() => {
  const diagrams = Array.from(document.querySelectorAll("[data-mermaid]"));
  let overlay = null;
  let overlayController = null;
  let overlayPanZoom = null;

  if (!diagrams.length) return;

  if (!window.mermaid) {
    for (const diagram of diagrams) diagram.classList.add("mermaid-error");
    return;
  }

  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      background: "#ffffff",
      mainBkg: "#ffffff",
      primaryColor: "#ffffff",
      primaryTextColor: "#111111",
      primaryBorderColor: "#111111",
      lineColor: "#333333",
      secondaryColor: "#ffffff",
      tertiaryColor: "#ffffff"
    }
  });

  function contentSize(content) {
    const svg = content.querySelector("svg");
    if (!svg) return { width: 800, height: 480 };

    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    const width = viewBox && viewBox.width ? viewBox.width : Number.parseFloat(svg.getAttribute("width")) || 800;
    const height = viewBox && viewBox.height ? viewBox.height : Number.parseFloat(svg.getAttribute("height")) || 480;
    return { width, height };
  }

  function normalizeSvg(content) {
    const svg = content.querySelector("svg");
    if (!svg) return;

    svg.removeAttribute("style");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  function setFrameHeight(frame, content) {
    const padding = 12;
    const { width, height } = contentSize(content);
    const fitScale = Math.min(1, (frame.clientWidth - padding * 2) / width);

    frame.style.height = Math.round(Math.min(window.innerHeight * 0.72, Math.max(240, height * fitScale + padding * 2))) + "px";
  }

  function fitPanZoom(frame, content, panZoom, dynamicHeight) {
    if (dynamicHeight) setFrameHeight(frame, content);

    try {
      panZoom.resize();
      panZoom.fit();
      panZoom.center();
    } catch {}
  }

  function resetPanZoom(panZoom) {
    try {
      panZoom.resetZoom();
      panZoom.fit();
      panZoom.center();
    } catch {}
  }

  function destroyPanZoom(panZoom) {
    if (!panZoom) return;

    try {
      panZoom.destroy();
    } catch {}
  }

  function attachPanZoom(frame, content, options = {}) {
    const dynamicHeight = Boolean(options.dynamicHeight);
    const listenerOptions = options.signal
      ? { signal: options.signal }
      : undefined;
    const svg = content.querySelector("svg");

    frame.tabIndex = 0;
    frame.setAttribute("role", "img");
    frame.setAttribute("aria-label", "Mermaid diagram. Drag to pan. Wheel or pinch to zoom. Double-click or double-tap to reset.");

    if (dynamicHeight) setFrameHeight(frame, content);
    normalizeSvg(content);

    if (!svg || typeof window.svgPanZoom !== "function") {
      return null;
    }

    const panZoom = window.svgPanZoom(svg, {
      zoomEnabled: true,
      controlIconsEnabled: false,
      fit: true,
      center: true,
      contain: false,
      minZoom: 0.2,
      maxZoom: 12,
      zoomScaleSensitivity: 0.35,
      dblClickZoomEnabled: false,
      mouseWheelZoomEnabled: true,
    });

    const refit = () => fitPanZoom(frame, content, panZoom, dynamicHeight);
    const releaseGrab = () => frame.classList.remove("is-grabbing");

    requestAnimationFrame(refit);
    window.addEventListener("resize", refit, listenerOptions);
    frame.addEventListener("mousedown", () => frame.classList.add("is-grabbing"), listenerOptions);
    frame.addEventListener("mouseup", releaseGrab, listenerOptions);
    frame.addEventListener("mouseleave", releaseGrab, listenerOptions);
    svg.addEventListener("dblclick", (event) => {
      event.preventDefault();
      resetPanZoom(panZoom);
    }, listenerOptions);

    frame.addEventListener("keydown", (event) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        panZoom.zoomBy(1.2);
      }

      if (event.key === "-") {
        event.preventDefault();
        panZoom.zoomBy(1 / 1.2);
      }

      if (event.key === "0" || event.key === "Escape") {
        event.preventDefault();
        resetPanZoom(panZoom);
      }
    }, listenerOptions);

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        destroyPanZoom(panZoom);
      }, { once: true });
    }

    return panZoom;
  }

  function closeFullscreen() {
    if (!overlay) return;

    const panZoom = overlayPanZoom;
    overlayPanZoom = null;

    if (overlayController) {
      overlayController.abort();
      overlayController = null;
    } else {
      destroyPanZoom(panZoom);
    }

    overlay.hidden = true;
    overlay.querySelector(".mermaid-fullscreen-frame").replaceChildren();
  }

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "mermaid-fullscreen";
    overlay.hidden = true;
    overlay.innerHTML = '<div class="mermaid-fullscreen-bar"><button class="mermaid-close" type="button">close</button></div><div class="mermaid-fullscreen-frame"></div>';
    document.body.append(overlay);

    overlay.querySelector(".mermaid-close").addEventListener("click", closeFullscreen);

    document.addEventListener("keydown", (event) => {
      if (!overlay.hidden && event.key === "Escape") {
        closeFullscreen();
      }
    });

    return overlay;
  }

  function openFullscreen(svgHtml) {
    const currentOverlay = ensureOverlay();
    const frame = currentOverlay.querySelector(".mermaid-fullscreen-frame");
    const content = document.createElement("div");

    if (overlayController) {
      overlayController.abort();
      overlayController = null;
      overlayPanZoom = null;
    }

    overlayController = new AbortController();
    content.className = "mermaid-content";
    content.innerHTML = svgHtml;
    frame.replaceChildren(content);
    currentOverlay.hidden = false;
    overlayPanZoom = attachPanZoom(frame, content, {
      dynamicHeight: false,
      signal: overlayController.signal,
    });
    frame.focus();
  }

  async function renderDiagram(diagram, index) {
    const source = diagram.querySelector(".mermaid-source")?.textContent || "";
    const frame = document.createElement("div");
    const content = document.createElement("div");
    const open = document.createElement("button");

    frame.className = "mermaid-frame";
    content.className = "mermaid-content";
    open.className = "mermaid-open";
    open.type = "button";
    open.textContent = "open";
    open.setAttribute("aria-label", "Open Mermaid diagram fullscreen");
    frame.append(content);
    diagram.replaceChildren(open, frame);

    try {
      const result = await window.mermaid.render("mermaid-" + Date.now() + "-" + index, source);
      const svgHtml = result.svg;
      content.innerHTML = svgHtml;
      attachPanZoom(frame, content, { dynamicHeight: true });
      open.addEventListener("click", () => openFullscreen(svgHtml));
    } catch {
      const pre = document.createElement("pre");
      pre.className = "mermaid-error";
      pre.textContent = source;
      diagram.replaceChildren(pre);
    }
  }

  diagrams.forEach((diagram, index) => renderDiagram(diagram, index));
})();
`;

export const EDITOR_SCRIPT = `
import MarkdownIt from "https://esm.sh/markdown-it@14.1.0";
import markdownItAbbr from "https://esm.sh/markdown-it-abbr@2.0.0";
import markdownItDeflist from "https://esm.sh/markdown-it-deflist@3.0.0";
import markdownItFootnote from "https://esm.sh/markdown-it-footnote@4.0.0";
import markdownItIns from "https://esm.sh/markdown-it-ins@4.0.0";
import markdownItKatex from "https://esm.sh/markdown-it-katex@2.0.3";
import markdownItMark from "https://esm.sh/markdown-it-mark@4.0.0";
import markdownItSub from "https://esm.sh/markdown-it-sub@2.0.0";
import markdownItSup from "https://esm.sh/markdown-it-sup@2.0.0";
import markdownItTaskLists from "https://esm.sh/markdown-it-task-lists@2.1.1";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(markdownItAbbr)
  .use(markdownItDeflist)
  .use(markdownItFootnote)
  .use(markdownItIns)
  .use(markdownItKatex)
  .use(markdownItMark)
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItTaskLists, { enabled: false });

const DRAFT_KEY = "tinypaste:draft";
const CONFIRM_MS = 3000;

const textarea = document.getElementById("markdown");
const preview = document.getElementById("preview");
const publishBtn = document.getElementById("publish");
const form = document.getElementById("editor-form");

function render(value) {
  preview.innerHTML = value.trim() ? md.render(value) : "";
}

const saved = localStorage.getItem(DRAFT_KEY);
if (saved) {
  textarea.value = saved;
  render(saved);
}

publishBtn.disabled = !textarea.value.trim();

let debounceTimer = null;
let confirmTimer = null;
let confirming = false;

textarea.addEventListener("input", () => {
  const value = textarea.value;
  publishBtn.disabled = !value.trim();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    localStorage.setItem(DRAFT_KEY, value);
    render(value);
  }, 300);
});

publishBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (!confirming) {
    confirming = true;
    publishBtn.textContent = "Confirm — this will be public";
    publishBtn.dataset.state = "confirming";
    confirmTimer = setTimeout(() => {
      confirming = false;
      publishBtn.textContent = "Publish";
      delete publishBtn.dataset.state;
    }, CONFIRM_MS);
  } else {
    clearTimeout(confirmTimer);
    confirming = false;
    publish();
  }
});

async function publish() {
  const markdown = textarea.value.trim();
  if (!markdown) return;
  publishBtn.textContent = "Publishing…";
  publishBtn.disabled = true;
  delete publishBtn.dataset.state;
  try {
    const res = await fetch("/api/pastes", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: markdown,
    });
    if (!res.ok) {
      const text = await res.text();
      let msg;
      try { msg = JSON.parse(text).error; } catch { msg = text.trim(); }
      throw new Error(msg || "HTTP " + res.status);
    }
    const id = (await res.text()).trim().split("/").pop();
    localStorage.removeItem(DRAFT_KEY);
    location.href = "/" + id;
  } catch (err) {
    setError(err.message);
    publishBtn.textContent = "Publish";
    publishBtn.disabled = false;
  }
}

function setError(msg) {
  let el = document.getElementById("editor-error");
  if (!el) {
    el = document.createElement("p");
    el.id = "editor-error";
    el.className = "error";
    el.setAttribute("role", "alert");
    form.prepend(el);
  }
  el.textContent = msg;
}
`;

if (import.meta.main) {
  const kv = await Deno.openKv();
  const config = configFromEnv();
  const handler = createHandler({ kv, config });

  if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
    Deno.serve(handler);
  } else {
    Deno.serve({ hostname: "0.0.0.0", port: config.port }, handler);
    console.log(`tinypaste listening on http://0.0.0.0:${config.port}`);
  }
}
