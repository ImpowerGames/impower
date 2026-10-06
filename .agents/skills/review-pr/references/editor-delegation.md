# Delegated editor attempts

The coordinator can grant `{ "id": "author", "kind": "editor", "maxRequests": 20, "timeoutSeconds": 600 }` in a review step's `execution` array. This authorizes the supported web editor driver in the coordinator environment. It preserves the reviewer's sandbox and the frozen checkout. The driver starts both editor and player in a fresh session with its own server record and browser profile. The service stops that session after the reviewer exits, before releasing the review freeze. A failed shutdown blocks completion and retains its session record for recovery through the driver; never force another session's servers down.

Use the launcher-supplied execution client from your private directory, adding the operation ID and an absolute JSON request-file path. Write the file with your editor capability. For example:

```json
{
  "requestId": "find-first-attempt",
  "command": "ui",
  "script": "Hello author!\nHello again!\n",
  "steps": [
    { "action": "open", "value": "find" },
    { "action": "type", "field": "search", "text": "Hello" },
    { "action": "click", "value": "next" },
    { "action": "shot", "target": "find" }
  ]
}
```

Choose your own author task and text before reading implementation, as the [author-experience lens](author-experience.md) requires. The example demonstrates the protocol, not required review coverage. The first request starts the servers. Later requests keep the same session and edited document. Omit `script` to preserve the current document; supplying it loads that text as `main.sd`. An empty `steps` list reads current UI state and captures the page. Every request captures a page screenshot, including preview requests. A failed attempt can still return useful screenshots and a transcript; inspect `failed`, read-back fields, diagnostics, and the actual images before claiming coverage. See [editor UI](../../drive-web-editor/references/ui.md) for the driver's evidence fields.

The client returns the full driver log up to 4 MiB and saves returned PNGs as fresh files in your current directory. Open those files with your image-viewing capability. Paths in the driver log identify coordinator evidence; the client's `screenshots[].path` identifies the readable local copies. `outputTruncated` means the transcript is incomplete. Ask the coordinator for retained evidence rather than inventing missing results.

Each `requestId` is a lowercase letter followed by up to 63 lowercase letters, digits or hyphens. Repeating the same request returns the original result without typing again. Reusing an ID with different content is refused. Use a new ID for each new attempt, within the caller's `maxRequests` (1–100). Operations run serially with tests and benchmarks. A request while another operation is running is refused; await the active result before retrying. Startup, each attempt, and shutdown use the caller's timeout (1–1800 seconds, default 600); timeout requests termination and awaits actual driver-process exit. Driver-owned server shutdown still runs at service close.

Requests are limited to 128 KiB of JSON. `script` is at most 65,536 characters, and `ui` accepts up to 30 steps. The compact JSON serialization of the complete `steps` array is limited to 16,384 UTF-16 code units, including JSON escaping, so its command-line arguments fit Windows; split larger attempts into smaller requests. No filesystem paths, executable code probes, environment variables, arbitrary flags, projects or remote URLs are accepted as protocol fields. Script text is author input to the product, not a coordinator shell command. Grant editor execution only for a trusted checkout and its dependencies, as with delegated tests. Editor commands retain the coordinator's `PLAYWRIGHT_BROWSERS_PATH` when configured, so the driver's custom Chromium cache remains available.

Each request reopens the browser from the session's persistent profile. The edited document persists, but temporary panel state such as the find query may reset. Supply both search and replacement fields in the same request when replacing text.

| Action | Fields and accepted values |
| --- | --- |
| `open`, `close` | `value`: `find`, `goto` |
| `type` | `field`: `search`, `replace`, `line`; `text`: up to 4096 characters |
| `click` | `value`: `next`, `prev`, `select`, `replace`, `replaceAll`, `close`, `submit` |
| `toggle` | `value`: `case`, `re`, `word` |
| `screen` | `value`: `logic`, `assets`, `share`, `main`, `scripts`, `files`, `urls`, `game`, `screenplay` |
| `hover` | Positive `line` and `column`, each at most 100000 |
| `complete` | Positive `line` and `column`, plus nonempty `text` up to 4096 characters; types into the script and reads completion |
| `press` | `value`: `Escape`, `Enter`, `Tab`, `Backspace`, `Delete`, arrow keys, `Home`, `End`, `Control+Home`, `Control+End`, `Control+a`, `Control+s` (format on save), `Shift+Alt+f` (Format Document), `Control+z`, `Control+Shift+z`, or `Shift+` with an arrow key. The script editor is focused before the key; the step reports `version` (`before`, `after`) and `textChanged`, with the document `text` read back when it changed |
| `shot` | `target`: `page`, `editor`, `find`, `goto`, `hover`, `completion`; at most four extra screenshots |

For game-preview evidence use `{ "requestId": "preview-first", "command": "verify", "script": "Hello!\n", "line": 1 }`. `script` and the positive `line` are optional; `steps` is not accepted for `verify`. Selection is available by moving between find matches with `next` and `prev`, go-to-line's `line` field and `submit`, and the bounded movement keys. The underlying driver also names a `select` button, but the current find panel does not display it; requesting that button reports a failed attempt. Unsupported tasks remain coverage gaps; do not replace them with custom probes or direct sandbox execution.
