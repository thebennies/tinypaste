import { configFromEnv } from "./lib/config.js";
import { createHandler } from "./lib/handler.js";

if (import.meta.main) {
  const kv = await Deno.openKv();
  const config = configFromEnv();

  const [style, viewScript, editorScript] = await Promise.all([
    Deno.readTextFile(new URL("./public/style.css", import.meta.url)),
    Deno.readTextFile(new URL("./public/view.js", import.meta.url)),
    Deno.readTextFile(new URL("./public/editor.js", import.meta.url)),
  ]);

  const handler = createHandler({ kv, config, style, viewScript, editorScript });

  if (Deno.env.get("DENO_DEPLOYMENT_ID")) {
    Deno.serve(handler);
  } else {
    Deno.serve({ hostname: "0.0.0.0", port: config.port }, handler);
    console.log(`tinypaste listening on http://0.0.0.0:${config.port}`);
  }
}
