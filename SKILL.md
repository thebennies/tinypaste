---
name: tinypaste-api
description: Publishes Markdown snippets to a public tinypaste-compatible HTTP API and returns the short URL. Use when the user asks to paste, publish, share, upload, or create a public Markdown snippet with tinypaste, tnypst.xyz, or another tinypaste base URL.
---

# Tinypaste API

## Endpoint

Default base URL:

```txt
https://tnypst.xyz
```

Override when the user provides a different base URL or when `TINYPASTE_URL` is set.

## Publish Markdown

Raw Markdown:

```sh
curl -sS -X POST "https://tnypst.xyz/api/pastes" \
  -H "Content-Type: text/plain" \
  --data-binary "# Title"
```

JSON:

```sh
curl -sS -X POST "https://tnypst.xyz/api/pastes" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"markdown":"# Title"}'
```

PowerShell:

```powershell
$body = @{ markdown = "# Title" } | ConvertTo-Json -Compress

Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "https://tnypst.xyz/api/pastes" `
  -Method Post `
  -ContentType "application/json" `
  -Headers @{ Accept = "application/json" } `
  -Body $body |
  Select-Object -ExpandProperty Content
```

PowerShell file upload:

```powershell
curl.exe -sS -X POST "https://tnypst.xyz/api/pastes" `
  -H "Content-Type: text/markdown" `
  --data-binary "@README.md"
```

## Handling Results

- Return the URL directly when the user wants a link.
- Fetch `<url>.md` only when the user asks to verify raw content.
- For `429`, report the `Retry-After` seconds and do not retry in a tight loop.
- Do not paste secrets, private data, credentials, or content the user did not ask to publish.
