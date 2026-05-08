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

function envNumber(name, fallback) {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function configFromEnv() {
  return {
    baseUrl: Deno.env.get("BASE_URL") || "",
    idLength: envNumber("ID_LENGTH", 7),
    maxMarkdownBytes: envNumber(
      "MAX_MARKDOWN_BYTES",
      DEFAULT_MAX_MARKDOWN_BYTES,
    ),
    port: envNumber("PORT", 3000),
    rateLimitPosts: envNumber("RATE_LIMIT_POSTS", 20),
    rateLimitWindowSeconds: envNumber("RATE_LIMIT_WINDOW_SECONDS", 3600),
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

    if (byteLength(value) > maxMarkdownBytes) {
      throw makeHttpError(
        413,
        `Markdown is too large. Limit is ${maxMarkdownBytes} bytes.`,
      );
    }

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

    if (byteLength(value) > maxMarkdownBytes) {
      throw makeHttpError(
        413,
        `Markdown is too large. Limit is ${maxMarkdownBytes} bytes.`,
      );
    }

    return value;
  }

  const value = await request.text();

  if (byteLength(value) > maxMarkdownBytes) {
    throw makeHttpError(
      413,
      `Markdown is too large. Limit is ${maxMarkdownBytes} bytes.`,
    );
  }

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

  return `<nav>
    <a class="brand" href="/">tinypaste</a>
    ${about}
    ${extra}
  </nav>`;
}

function editorPage(error = "") {
  const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : "";

  return page(
    "tinypaste",
    `<main class="shell">
  ${navHtml("", { showAbout: true })}
  ${errorHtml}
  <form method="post" action="/">
    <textarea name="markdown" autofocus spellcheck="true" placeholder="# Paste Markdown"></textarea>
    <button type="submit">publish</button>
  </form>
</main>`,
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
    `<script type="module">
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

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip") || "unknown";
}

async function createPaste(request, kv, config) {
  const rate = await hitRate(
    kv,
    clientIp(request),
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
  return (request.headers.get("accept") || "").includes("application/json");
}

function handleError(error, request) {
  const status = error.status || 500;
  const message = status === 500 ? "Internal server error." : error.message;
  const headers = {};

  if (status === 429 && error.resetSeconds) {
    headers["retry-after"] = String(error.resetSeconds);
  }

  const url = new URL(request.url);

  if (url.pathname === "/api/pastes") {
    Object.assign(headers, corsHeaders());
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

  return async (request) => {
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
        const { id } = await createPaste(request, kv, config);
        return new Response(null, {
          status: 303,
          headers: { location: `/${id}` },
        });
      }

      if (request.method === "POST" && pathname === "/api/pastes") {
        const { id, rate } = await createPaste(request, kv, config);
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

textarea:focus,
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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

.error {
  margin: 0 0 18px;
  color: var(--accent);
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
  background: #ffffff;
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
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
  user-select: none;
}

.mermaid-content svg {
  display: block;
  max-width: none !important;
  height: auto;
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
`;

export const VIEW_SCRIPT = `
(() => {
  const MIN_SCALE = 0.35;
  const MAX_SCALE = 8;
  const diagrams = Array.from(document.querySelectorAll("[data-mermaid]"));
  let overlay = null;

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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function distance(first, second) {
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  }

  function midpoint(first, second) {
    return {
      clientX: (first.clientX + second.clientX) / 2,
      clientY: (first.clientY + second.clientY) / 2
    };
  }

  function applyTransform(content, state) {
    content.style.transform = "translate(" + state.x + "px, " + state.y + "px) scale(" + state.scale + ")";
  }

  function zoomAt(frame, content, state, clientX, clientY, factor) {
    const rect = frame.getBoundingClientRect();
    const pointX = clientX - rect.left;
    const pointY = clientY - rect.top;
    const contentX = (pointX - state.x) / state.scale;
    const contentY = (pointY - state.y) / state.scale;
    const nextScale = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);

    state.x = pointX - contentX * nextScale;
    state.y = pointY - contentY * nextScale;
    state.scale = nextScale;
    applyTransform(content, state);
  }

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

    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    if (viewBox && viewBox.width && viewBox.height) {
      svg.setAttribute("width", String(Math.ceil(viewBox.width)));
      svg.setAttribute("height", String(Math.ceil(viewBox.height)));
    }

    svg.removeAttribute("style");
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  }

  function resetView(frame, content, state, dynamicHeight) {
    const padding = 12;
    const { width, height } = contentSize(content);
    const fitScale = Math.min(1, (frame.clientWidth - padding * 2) / width);

    state.scale = clamp(fitScale, MIN_SCALE, MAX_SCALE);
    state.x = padding;
    state.y = padding;

    if (dynamicHeight) {
      frame.style.height = Math.round(Math.min(window.innerHeight * 0.72, Math.max(240, height * state.scale + padding * 2))) + "px";
    }

    applyTransform(content, state);
  }

  function attachGestures(frame, content, options) {
    const dynamicHeight = Boolean(options && options.dynamicHeight);
    const state = { scale: 1, x: 0, y: 0 };
    const pointers = new Map();
    let previousPinch = null;
    let previousPointer = null;
    let lastTapAt = 0;
    let movedSinceDown = false;

    frame.tabIndex = 0;
    frame.setAttribute("role", "img");
    frame.setAttribute("aria-label", "Mermaid diagram. Drag to pan. Wheel or pinch to zoom. Double-click or double-tap to reset.");

    requestAnimationFrame(() => resetView(frame, content, state, dynamicHeight));
    window.addEventListener("resize", () => resetView(frame, content, state, dynamicHeight));

    frame.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoomAt(frame, content, state, event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
    }, { passive: false });

    frame.addEventListener("dblclick", (event) => {
      event.preventDefault();
      resetView(frame, content, state, dynamicHeight);
    });

    frame.addEventListener("keydown", (event) => {
      if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault();
        const rect = frame.getBoundingClientRect();
        zoomAt(frame, content, state, rect.left + rect.width / 2, rect.top + rect.height / 2, event.key === "-" ? 1 / 1.2 : 1.2);
      }

      if (event.key === "0" || event.key === "Escape") {
        event.preventDefault();
        resetView(frame, content, state, dynamicHeight);
      }
    });

    frame.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      frame.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, event);
      previousPointer = event;
      previousPinch = null;
      movedSinceDown = false;
    });

    frame.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();
      pointers.set(event.pointerId, event);

      if (pointers.size >= 2) {
        const active = Array.from(pointers.values()).slice(0, 2);
        const center = midpoint(active[0], active[1]);
        const nextDistance = distance(active[0], active[1]);

        if (previousPinch) {
          zoomAt(frame, content, state, center.clientX, center.clientY, nextDistance / previousPinch.distance);
          state.x += center.clientX - previousPinch.center.clientX;
          state.y += center.clientY - previousPinch.center.clientY;
          applyTransform(content, state);
        }

        previousPinch = { distance: nextDistance, center };
        previousPointer = null;
        movedSinceDown = true;
        return;
      }

      if (previousPointer) {
        const dx = event.clientX - previousPointer.clientX;
        const dy = event.clientY - previousPointer.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 2) movedSinceDown = true;

        state.x += dx;
        state.y += dy;
        previousPointer = event;
        applyTransform(content, state);
      }
    });

    function finishPointer(event) {
      if (!pointers.has(event.pointerId)) return;

      pointers.delete(event.pointerId);
      previousPinch = null;
      previousPointer = pointers.size === 1 ? Array.from(pointers.values())[0] : null;

      if (!movedSinceDown && pointers.size === 0) {
        const now = Date.now();
        if (now - lastTapAt < 320) {
          resetView(frame, content, state, dynamicHeight);
          lastTapAt = 0;
        } else {
          lastTapAt = now;
        }
      }
    }

    frame.addEventListener("pointerup", finishPointer);
    frame.addEventListener("pointercancel", finishPointer);
    frame.addEventListener("lostpointercapture", finishPointer);
  }

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "mermaid-fullscreen";
    overlay.hidden = true;
    overlay.innerHTML = '<div class="mermaid-fullscreen-bar"><button class="mermaid-close" type="button">close</button></div><div class="mermaid-fullscreen-frame"></div>';
    document.body.append(overlay);

    overlay.querySelector(".mermaid-close").addEventListener("click", () => {
      overlay.hidden = true;
      overlay.querySelector(".mermaid-fullscreen-frame").replaceChildren();
    });

    document.addEventListener("keydown", (event) => {
      if (!overlay.hidden && event.key === "Escape") {
        overlay.hidden = true;
        overlay.querySelector(".mermaid-fullscreen-frame").replaceChildren();
      }
    });

    return overlay;
  }

  function openFullscreen(sourceContent) {
    const currentOverlay = ensureOverlay();
    const frame = currentOverlay.querySelector(".mermaid-fullscreen-frame");
    const content = sourceContent.cloneNode(true);

    content.style.transform = "";
    frame.replaceChildren(content);
    currentOverlay.hidden = false;
    attachGestures(frame, content, { dynamicHeight: false });
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
      content.innerHTML = result.svg;
      normalizeSvg(content);
      attachGestures(frame, content, { dynamicHeight: true });
      open.addEventListener("click", () => openFullscreen(content));
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

if (import.meta.main) {
  const kv = await Deno.openKv();
  const config = configFromEnv();
  const handler = createHandler({ kv, config });

  if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
    Deno.serve(handler);
  } else {
    Deno.serve({ port: config.port }, handler);
    console.log(`tinypaste listening on ${config.port}`);
  }
}
