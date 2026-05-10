# tinypaste

Tiny public Markdown pastebin.

Everything is public. There are no accounts and no API tokens. POST traffic is limited by IP.

There are many paste tools, but too many are cluttered, ad-heavy, or focused on editing workflows.
This one is focused on sharing: publish Markdown, get a short public URL, move on.
The API is just a POST endpoint, so agents and pipelines can use it without API tokens or account setup.
Fewer features means fewer decisions for the person using it.

Example: https://tnypst.xyz/Pk1orSZ

## Markdown

Supported:

- CommonMark-style Markdown
- fenced code blocks
- tables
- bullet and numbered lists
- task lists: `- [ ]` and `- [x]`
- strikethrough
- footnotes
- definition lists
- abbreviations
- subscript, superscript, mark, and insert syntax
- LaTeX math with inline `$...$` and block `$$...$$`
- Mermaid fences rendered as zoomable SVG images

Raw HTML inside Markdown is escaped.

## API

Responses are public. The default text response is the short URL.

```sh
curl -X POST https://tnypst.xyz/api/pastes \
  -H "Content-Type: text/plain" \
  --data-binary '# hello'
```

```sh
curl -X POST "https://tnypst.xyz/api/pastes" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"markdown":"# hello\n\n- one\n- two"}'
```

```sh
curl -X POST "https://tnypst.xyz/api/pastes" \
  -H "Content-Type: text/markdown" \
  --data-binary @README.md
```

Use `curl.exe`, not PowerShell's `curl` alias. Quote the `@README.md` argument.

```powershell
curl.exe -X POST "https://tnypst.xyz/api/pastes" `
  -H "Content-Type: text/markdown" `
  --data-binary "@README.md"
```

## Self-host

You can deploy for free on Deno in less than a minute:

1. Fork this repo and push it to GitHub.
2. Open https://console.deno.com.
3. Create an app from the GitHub repo.
4. Use this build config: no preset, dynamic runtime, entrypoint `main.js`, empty install and build command.
5. Provision a Deno KV database.
6. Assign that KV database to the app.
7. Set `BASE_URL` to the public origin if the generated API links use the wrong host.

## Legal

Do not paste secrets, private data, illegal material, or anything you do not
have the right to publish. Pastes are public. The operator does not review,
endorse, guarantee, or assume responsibility for user-submitted content.
