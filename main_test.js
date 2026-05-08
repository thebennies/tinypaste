import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { createHandler, renderMarkdown } from "./main.js";

async function withServer(run) {
  const kv = await Deno.openKv(":memory:");
  const handler = createHandler({
    kv,
    config: {
      baseUrl: "",
      idLength: 7,
      maxMarkdownBytes: 128 * 1024,
      port: 0,
      rateLimitPosts: 20,
      rateLimitWindowSeconds: 3600,
    },
  });
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    handler,
  );
  const { port } = server.addr;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await server.shutdown();
    kv.close();
  }
}

Deno.test("POST /api/pastes accepts raw Markdown and serves a read-only page", async () => {
  await withServer(async (baseUrl) => {
    const markdown = "# Hello\n\n<script>alert(1)</script>";
    const response = await fetch(`${baseUrl}/api/pastes`, {
      method: "POST",
      headers: {
        accept: "text/plain",
        "content-type": "text/plain",
      },
      body: markdown,
    });

    assertEquals(response.status, 201);

    const url = (await response.text()).trim();
    const pathname = new URL(url).pathname;
    const page = await fetch(`${baseUrl}${pathname}`);
    const html = await page.text();

    assertMatch(html, /<article class="markdown">/);
    assertMatch(html, /Hello/);
    assert(!html.includes("<textarea"));
    assert(!html.includes("<script>alert"));
    assertMatch(html, /&lt;script&gt;alert/);

    const raw = await fetch(`${baseUrl}${pathname}.md`);
    assertEquals(await raw.text(), markdown);
  });
});

Deno.test("Homepage shows about link and no recent list", async () => {
  await withServer(async (baseUrl) => {
    const home = await fetch(`${baseUrl}/`);
    const html = await home.text();

    assertMatch(html, /<a class="brand" href="\/">tinypaste<\/a>/);
    assertMatch(html, /<a class="about-link" href="\/about">about<\/a>/);
    assert(!html.includes('class="recents"'));
  });
});

Deno.test("About page renders the README", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/about`);
    const html = await response.text();

    assertEquals(response.status, 200);
    assertMatch(html, /<title>tinypaste readme<\/title>/);
    assertMatch(html, /<h1>tinypaste<\/h1>/);
    assertMatch(html, /Tiny public Markdown pastebin/);
  });
});

Deno.test("Markdown supports disabled task lists, Mermaid fences, and LaTeX", () => {
  const html = renderMarkdown(`# Features

- [ ] open task
- [x] closed task
- bullet

Inline $a^2 + b^2 = c^2$.

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

\`\`\`mermaid
graph TD
  A --> B
\`\`\`
`);

  assertMatch(html, /class="contains-task-list"/);
  assertMatch(
    html,
    /class="task-list-item-checkbox" disabled="" type="checkbox"/,
  );
  assertMatch(
    html,
    /class="task-list-item-checkbox" checked="" disabled="" type="checkbox"/,
  );
  assertMatch(html, /<li>bullet<\/li>/);
  assertMatch(html, /class="katex"/);
  assertMatch(html, /katex-display/);
  assertMatch(html, /<figure class="mermaid-diagram" data-mermaid>/);
});

Deno.test("Read-only page loads Mermaid renderer with fullscreen open control", async () => {
  await withServer(async (baseUrl) => {
    const markdown = "```mermaid\ngraph TD\n  A --> B\n```";
    const response = await fetch(`${baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: markdown,
    });

    const url = (await response.text()).trim();
    const pathname = new URL(url).pathname;
    const page = await fetch(`${baseUrl}${pathname}`);
    const html = await page.text();

    assertMatch(html, /https:\/\/esm\.sh\/mermaid@11\.14\.0/);
    assertMatch(html, /await import\("\/view\.js"\)/);
    assert(!html.includes('class="about-link"'));
    assert(!html.includes("mermaid-toolbar"));
    assert(!html.includes(`href="${pathname}.html"`));
  });
});

Deno.test("Mermaid viewer script supports pointer and wheel gestures", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/view.js`);
    const script = await response.text();

    assertMatch(script, /addEventListener\("wheel"/);
    assertMatch(script, /addEventListener\("pointerdown"/);
    assertMatch(script, /addEventListener\("pointermove"/);
    assertMatch(script, /addEventListener\("dblclick"/);
    assertMatch(script, /mermaid-fullscreen/);
    assertMatch(script, /Open Mermaid diagram fullscreen/);
    assertMatch(script, /Double-click or double-tap to reset/);
    assert(!script.includes("mermaid-toolbar"));
  });
});

Deno.test("POST /api/pastes accepts JSON and can return JSON", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pastes`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ markdown: "**stored**" }),
    });

    assertEquals(response.status, 201);

    const body = await response.json();
    assertMatch(body.id, /^[0-9a-zA-Z]{7}$/);
    assertEquals(body.url, `${baseUrl}/${body.id}`);
  });
});

Deno.test("POST /api/pastes defaults to a plain URL response", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "plain",
    });

    assertEquals(response.status, 201);
    assertEquals(
      response.headers.get("content-type").startsWith("text/plain"),
      true,
    );
    assertMatch(
      await response.text(),
      new RegExp(`^${baseUrl}/[0-9a-zA-Z]{7}\\n$`),
    );
  });
});

Deno.test("POST rate limit does not need an API token", async () => {
  const kv = await Deno.openKv(":memory:");
  const handler = createHandler({
    kv,
    config: {
      baseUrl: "",
      idLength: 7,
      maxMarkdownBytes: 128 * 1024,
      port: 0,
      rateLimitPosts: 1,
      rateLimitWindowSeconds: 60,
    },
  });
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    handler,
  );
  const { port } = server.addr;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const first = await fetch(`${baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "one",
    });

    const second = await fetch(`${baseUrl}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "two",
    });

    assertEquals(first.status, 201);
    assertEquals(second.status, 429);
    assert(Number(second.headers.get("retry-after")) > 0);
    await first.text();
    await second.text();
  } finally {
    await server.shutdown();
    kv.close();
  }
});
