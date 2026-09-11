# Agent notification alerts

A local MCP tool and command that briefly flashes a SteelSeries keyboard and
reads an agent's message aloud using Windows speech. No speech API or API key.
Notification text is passed to the speech process as JSON over stdin, never as
executable PowerShell. Device failures are reported independently.

## Run

Requires Node.js 20+, Windows for speech, and SteelSeries GG / Engine for lighting.
From this directory:

```powershell
npm ci
npm run demo
node src/main.mjs notify review_ready "The notification PR is ready for your review."
node src/main.mjs notify merge_ready "PR 123 has passed review and is ready for your merge."
node src/main.mjs notify input_needed "Please choose the next task." --dry-run
npm test
```

`npm start` runs the MCP server and waits silently for a client on stdin. It is
not an interactive terminal app. For a manual notification, use `notify` or `demo`.

## Agent interface

MCP is the standard protocol an agent uses to discover and call tools. This
program exposes a custom tool, `notify_user`; it is not a new standard MCP
notification event. The agent deliberately calls it with structured input:

```json
{
  "source": "Claude — notification task",
  "reason": "review_ready",
  "message": "The pull request is ready for your review."
}
```

| Reason | Default color |
| --- | --- |
| `input_needed` | Amber |
| `permission_needed` | Orange |
| `review_ready` | Purple |
| `merge_ready` | Green |
| `completed` | Blue |
| `error` | Red |

Messages are limited to 600 characters. Prefer one short sentence identifying
the task and what the user needs to do. The tool does not inspect GitHub or
verify readiness: the calling workflow must establish that before reporting it.
It never grants permission, approves a review, or merges a PR.

For Claude Code, register an absolute path to this program (replace the example):

```powershell
claude mcp add --transport stdio --scope user agent-alerts -- node "C:/path/to/impower/scripts/agent-notification-alerts/src/main.mjs" mcp
claude mcp get agent-alerts
```

Restart Claude Code and check `/mcp`. Ask: "Use notify_user when you need my
input, or when a PR is ready for my review or merge. Identify the task in the
message." An agent/subagent can call this only if its MCP tool permissions
allow it. Otherwise have the main agent send the alert. Explicit tool calls do
not automatically cover every idle/permission event. Lifecycle hook wiring is
not installed by this version.

Other MCP clients can launch the same program over stdio with command `node`
and arguments `["/absolute/path/to/src/main.mjs", "mcp"]`. Configure their tool
timeout to allow queued notifications if you run many agents.

## Machine settings

Copy `config.example.json` to ignored `config.local.json`, or set
`AGENT_ALERT_CONFIG` to an absolute JSON file outside the repo. Partial overrides
are supported, including individual colors. A private launcher can set that
environment variable and invoke the shared entry point.

- `keyboard` / `speech`: enable each channel independently.
- `zone`: `function-keys` or `all`.
- `durationMs`: 1000–30000; default 6000. Lighting flashes once per second.
- `volume`: Windows speech volume, 0–100; default 70.
- `rate`: Windows speech rate, -10–10.
- `colors`: RGB arrays for the reasons above.

Speech uses the default Windows audio output (headphones if selected). Lighting
discovers Engine's loopback address from ProgramData and releases its GameSense
effect when the alert ends. Engine's normal event timeout provides a fallback
if a process dies. Another active GameSense app can affect lighting priority.

Separate local invocations serialize through a loopback port lease (39761),
so speeches and keyboard effects do not overlap. The listener accepts no
commands and closes incoming sockets. The OS releases it when the process ends.
After two minutes waiting for the lease, the tool reports a busy error. A
different application using that port will also cause a busy error. Alerts are
brief, not persistent indicators, and there is no background PR polling or
automatic startup service. Remote/cloud agents require a separate secure bridge
to this computer; a remote process cannot directly control local devices.

## Existing projects considered

Research date: 2026-09-11. Reviewed documentation, not full security audits.

- [lucastononro/notify](https://github.com/lucastononro/notify): closest match for
  deliberate MCP speech notifications, supports Claude and Codex. Windows is
  described as best-effort/untested; no license file was present in the inspected
  tree. No code was copied. No documented SteelSeries support.
- [Gem-o-b/claude-code-notifier](https://github.com/Gem-o-b/claude-code-notifier):
  MIT, Windows-tested according to its README, extensible toast/sound/webhook
  channels and automatic Claude hook installation. A useful alternative if
  desktop banners and general notification channels become the priority. No
  documented speech or SteelSeries channel.
- [ashmitb95/claude-notifier](https://github.com/ashmitb95/claude-notifier): VS Code
  controls, sounds/popups, per-session suppression and remote audio support.
  Windows setup uses the extension. No documented spoken-message or SteelSeries
  integration.

This small adapter reuses the official MCP SDK, Windows speech, and the
[SteelSeries GameSense API](https://github.com/SteelSeries/gamesense-sdk). Adding
an existing notifier would currently still require the hardware adapter and
agent-selected readiness reasons, so no third-party notifier is installed.

## Verification

`npm test` exercises an actual MCP client/server exchange in dry-run mode,
invalid input rejection, independent device failure handling, and mutual
exclusion including release after an error. On the initial MSI GS75 Windows
machine, a live demo returned successful Engine and speech results; the user
confirmed seeing the amber keys and hearing the message. Other machines and
keyboard models have not been tested. There is no visual UI to render.
