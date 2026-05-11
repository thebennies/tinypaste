import { ID_ALPHABET, RESERVED_IDS } from "./config.js";
import { renderMarkdown } from "./markdown.js";

export const TTL_MAP = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

export function parseTtl(value) {
  return TTL_MAP[value] ?? null;
}

export function makeHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function randomIndex(max) {
  const limit = Math.floor(256 / max) * max;
  const bytes = new Uint8Array(1);
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= limit);
  return bytes[0] % max;
}

export function makeId(length) {
  let id = "";
  for (let index = 0; index < length; index += 1) {
    id += ID_ALPHABET[randomIndex(ID_ALPHABET.length)];
  }
  return id;
}

const encoder = new TextEncoder();

function byteLength(value) {
  return encoder.encode(value).byteLength;
}

function assertMarkdownSize(value, maxMarkdownBytes) {
  if (byteLength(value) <= maxMarkdownBytes) return;
  throw makeHttpError(
    413,
    `Markdown is too large. Limit is ${maxMarkdownBytes} bytes.`,
  );
}

export async function extractMarkdown(request, maxMarkdownBytes) {
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

export async function getPaste(kv, id) {
  const entry = await kv.get(["paste", id]);
  if (!entry.value) return null;
  if (entry.value.expiresAt && Date.now() > entry.value.expiresAt) {
    return { expired: true };
  }
  return entry.value;
}

export async function savePaste(kv, id, paste) {
  const result = await kv.atomic()
    .check({ key: ["paste", id], versionstamp: null })
    .set(["paste", id], paste)
    .commit();
  return result.ok;
}

export async function hitRate(kv, ip, limit, windowSeconds) {
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

export function clientIp(request, info) {
  if (info && info.remoteAddr) return info.remoteAddr.hostname;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export async function createPaste(request, kv, config, info) {
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

  const ttlMs = parseTtl(new URL(request.url).searchParams.get("ttl"));
  const paste = {
    createdAt: new Date().toISOString(),
    html: renderMarkdown(markdown),
    markdown,
    ...(ttlMs ? { expiresAt: Date.now() + ttlMs } : {}),
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = makeId(config.idLength);
    if (RESERVED_IDS.has(id.toLowerCase())) continue;
    if (await savePaste(kv, id, paste)) return { id, paste, rate };
  }

  throw makeHttpError(503, "Could not allocate a paste id.");
}
