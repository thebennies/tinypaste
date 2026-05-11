export const ID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const RESERVED_IDS = new Set([
  "about",
  "api",
  "editor",
  "favicon",
  "health",
  "mermaid",
  "readme",
  "robots",
  "style",
  "view",
]);

export const DEFAULT_MAX_MARKDOWN_BYTES = 128 * 1024;

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
