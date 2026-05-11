import { configFromEnv } from "./config.js";
import { createPaste, getPaste, makeHttpError } from "./store.js";
import { editorPage, aboutPage, viewPage, expiredPage } from "./pages.js";

function response(
  body,
  status = 200,
  contentType = "text/plain; charset=utf-8",
  headers = {},
) {
  return new Response(body, {
    status,
    headers: { "content-type": contentType, ...headers },
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

function acceptsJson(request) {
  const accept = request.headers.get("accept") || "";
  return accept.split(",").some((part) => {
    const type = part.split(";")[0].trim().toLowerCase();
    return type === "application/json" || type.endsWith("+json");
  });
}

function publicUrl(request, config, path) {
  const requestUrl = new URL(request.url);
  const baseUrl = config.baseUrl || requestUrl.origin;
  return new URL(path, baseUrl).toString();
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
  const style = options.style || "";
  const viewScript = options.viewScript || "";
  const editorScript = options.editorScript || "";

  if (!kv) throw new Error("KV store is required.");

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
        return response(style, 200, "text/css; charset=utf-8");
      }

      if (request.method === "GET" && pathname === "/view.js") {
        return response(viewScript, 200, "application/javascript; charset=utf-8");
      }

      if (request.method === "GET" && pathname === "/editor.js") {
        return response(editorScript, 200, "application/javascript; charset=utf-8");
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
        const pasteUrl = publicUrl(request, config, `/${id}`);
        const headers = corsHeaders({
          "x-ratelimit-limit": String(config.rateLimitPosts),
          "x-ratelimit-remaining": String(rate.remaining),
          "x-ratelimit-reset": String(rate.resetSeconds),
        });

        if (acceptsJson(request)) {
          return response(
            JSON.stringify({ id, url: pasteUrl }),
            201,
            "application/json; charset=utf-8",
            headers,
          );
        }

        return response(`${pasteUrl}\n`, 201, "text/plain; charset=utf-8", headers);
      }

      if (request.method === "OPTIONS" && pathname === "/api/pastes") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      const rawMatch = pathname.match(/^\/([0-9a-zA-Z]+)\.md$/);

      if (request.method === "GET" && rawMatch) {
        const paste = await getPaste(kv, rawMatch[1]);
        if (!paste) throw makeHttpError(404, "Paste not found.");
        if (paste.expired) throw makeHttpError(410, "Paste has expired.");
        return response(paste.markdown, 200, "text/markdown; charset=utf-8");
      }

      const htmlMatch = pathname.match(/^\/([0-9a-zA-Z]+)\.html$/);

      if (request.method === "GET" && htmlMatch) {
        const paste = await getPaste(kv, htmlMatch[1]);
        if (!paste) throw makeHttpError(404, "Paste not found.");
        if (paste.expired) throw makeHttpError(410, "Paste has expired.");
        return response(paste.html, 200, "text/html; charset=utf-8");
      }

      const viewMatch = pathname.match(/^\/([0-9a-zA-Z]+)$/);

      if (request.method === "GET" && viewMatch) {
        const id = viewMatch[1];
        const paste = await getPaste(kv, id);
        if (!paste) throw makeHttpError(404, "Paste not found.");
        if (paste.expired) {
          return response(expiredPage(), 410, "text/html; charset=utf-8");
        }
        return response(viewPage(id, paste), 200, "text/html; charset=utf-8");
      }

      return response("Not found.\n", 404);
    } catch (error) {
      if (!error.status || error.status >= 500) console.error(error);
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
