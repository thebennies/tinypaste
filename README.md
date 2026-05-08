# tinypaste

Tiny public Markdown pastebin.

Everything is public. There are no accounts and no API tokens. POST traffic is
limited by IP.

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
curl -X POST http://localhost:3000/api/pastes \
  -H "Content-Type: text/plain" \
  --data-binary '# hello'
```

```sh
curl -X POST "$BASE_URL/api/pastes" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"markdown":"# hello\n\n- one\n- two"}'
```

```sh
curl -X POST "$BASE_URL/api/pastes" \
  -H "Content-Type: text/markdown" \
  --data-binary @README.md
```

Use `curl.exe`, not PowerShell's `curl` alias. Quote the `@README.md` argument.

```powershell
curl.exe -X POST "http://localhost:3000/api/pastes" `
  -H "Content-Type: text/markdown" `
  --data-binary "@README.md"
```

## Legal

Do not paste secrets, private data, illegal material, or anything you do not
have the right to publish. Pastes are public. The operator does not review,
endorse, guarantee, or assume responsibility for user-submitted content.
