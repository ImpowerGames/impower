# Agent notification alerts

A local MCP tool and command that flashes a SteelSeries keyboard until acknowledged and
reads an agent's message aloud using Windows speech. No speech API or API key.
Notification text is passed to the speech process as JSON over stdin, never as
executable PowerShell. Device failures are reported independently.

## Run

Requires Node.js 20+, Windows for speech, and SteelSeries GG / Engine for lighting.
From this directory:

```powershell
npm ci
npm run demo
node src/main.mjs notify "Hey, I finished the settings page. Can you take a look?" --category input_needed
node src/main.mjs notify "Your photos are organized. Everything is ready."
node src/main.mjs notify "I compared the flights. Can you choose a departure time?" --dry-run
npm test
```

`npm start` runs the MCP server and waits silently for a client on stdin. It is
not an interactive terminal app. For a manual notification, use `notify` or `demo`.

## Agent interface

MCP is the standard protocol an agent uses to discover and call tools. This
program exposes custom tools, `notify_user` and `acknowledge_notification`; these are not standard MCP
notification event. The agent deliberately calls it with structured input:

```json
{
  "message": "Hey, I finished the settings page. Can you take a look?",
  "category": "input_needed"
}
```

`message` is required; `category` defaults to `done`. Any topic is welcome.
The exact message is spoken without an
automatic "Agent" prefix. Messages are limited to 280 characters, with one or
two short, natural sentences recommended. Categories are `done` (green, no action
needed), `input_needed` (orange, normal question/decision/review), and `blocked`
(red, a problem requires user help). If work is done but needs review, use
`input_needed`. The tool delivers a message; it does not verify claims
or perform the action described in the message.

### End-of-turn behavior

Chat is always the default handoff: preserve the usual summary, questions,
links, evidence and limitations. For users with a connected notifier, agents
also send one short companion message, such as "Hey, I finished organizing the
photos. Can you pick a cover?" Its brevity does not constrain the chat response.
Respect explicit notification opt-outs. If no notifier is connected, skip the
event silently without setup prompts or warnings. Delivery failures do not
suppress chat or start a troubleshooting detour unless the user requested one.
These are agent instructions, not an automatic interception of final responses:
the agent must call the tool. No idle detector or Stop hook is installed.

The shared [notify-user skill](../../.agents/skills/notify-user/SKILL.md) is
invoked at user handoffs by `resolve-issue`, `file-bug`, and `file-feature`.
It retains each workflow's completion gates and always uses chat, whether or
not the optional tool is available. Skills become available in checkouts containing this
change; a running session may need to restart to discover them.

For Claude Code, register an absolute path to this program (replace the example):

```powershell
claude mcp add --transport stdio --scope user agent-alerts --env AGENT_ALERT_APP=claude -- node "C:/path/to/impower/scripts/agent-notification-alerts/src/main.mjs" mcp
claude mcp get agent-alerts
```

Restart Claude Code and check `/mcp`. Ask: "When you finish work or need my
attention, also call notify_user with a short, natural message saying what you
finished and what you need from me, if anything. Keep your normal handoff in chat."
An agent/subagent can call this only if its MCP tool permissions
allow it. Otherwise have the main agent send the alert. Explicit tool calls do
not automatically cover every idle/permission event. Lifecycle hook wiring is
not installed by this version.

Other MCP clients can launch the same program over stdio with command `node`
and arguments `["/absolute/path/to/src/main.mjs", "mcp"]`. Configure their tool
timeout to allow queued notifications if you run many agents.

For Codex (CLI and desktop share its MCP config):

```powershell
codex mcp add agent-alerts --env AGENT_ALERT_APP=codex -- node "C:/path/to/impower/scripts/agent-notification-alerts/src/main.mjs" mcp
codex mcp get agent-alerts
```

`AGENT_ALERT_APP=codex` selects F1; `AGENT_ALERT_APP=claude` selects F2. Without
that variable, manual calls use the configured zone. The app identity is set by
the local registration, not supplied by the model. Restart the client after
registration and permit the notification tool if prompted. Claude Code's local
Desktop Code sessions share its CLI registration; ordinary Claude Chat has a
separate desktop configuration. See the [Codex MCP docs](https://learn.chatgpt.com/docs/extend/mcp)
and [Claude Desktop shared configuration](https://code.claude.com/docs/en/desktop#shared-configuration).

### Bring your own automation

Developers do not need to install this Windows adapter. They can connect their
own MCP server as `agent-alerts` with a `notify_user` tool accepting the same
input contract: required nonempty `message` (up to 280 characters) and optional
`category` (`done`, `input_needed`, `blocked`; default `done`). Return a standard
MCP tool result and mark delivery failures with `isError: true`. The server can
route that call to any automation the developer configures. Those destinations
and credentials stay in the developer's personal setup, not shared agent rules.

The message/category contract is independent of RGB colors, keys, speech and OS.
This repository provides one implementation; it does not broadcast MCP events
to disconnected listeners. With no connected receiver there is no tool call,
no queued event, and nothing to configure for developers who only want chat.

### Acknowledgement contract

`notify_user` returns `notificationId`, `status: "queued"`, and
`persistent: true`. Retain that ID in the task context. At the start of the next
user turn, acknowledge the alert their reply addresses:

```json
{ "notificationId": "the UUID returned by notify_user" }
```

Pass this to `acknowledge_notification`. Repeated acknowledgements are harmless.
An old ID cannot clear a newer alert or an alert from the other app. Acknowledging
receipt does not grant approval or establish that the underlying task is resolved.
The agent can issue a new alert at its next handoff if more input is needed.

Lighting persists; speech plays once. For several pending tasks in one app, the
latest determines the key's color and shortcut target. Clearing it reveals the
next pending task. This requires an agent tool call after the reply: no automatic
user-message hook is installed. Abandoned sessions can be cleared manually:

```powershell
node src/main.mjs status
# Use the same AGENT_ALERT_APP value as the original notification:
node src/main.mjs acknowledge NOTIFICATION_UUID
node src/main.mjs stop
```

`stop` releases lighting and shortcuts but retains pending alerts for restart.
Queued delivery is not proof that hardware or speech succeeded; `status` reports
channel state. Custom receivers should return an ID and expose the same
acknowledgement tool. They choose what acknowledgement does in their automations.

## Machine settings

Copy `config.example.json` to ignored `config.local.json`, or set
`AGENT_ALERT_CONFIG` to an absolute JSON file outside the repo. Partial overrides
are supported. A private launcher can set that
environment variable and invoke the shared entry point.

- `keyboard` / `speech`: enable each channel independently.
- `zone`: `function-keys` or `all`, for manual calls without an app identity.
- `durationMs`: retained for the legacy timed delivery helper; MCP/CLI alerts now persist until acknowledged. Lighting flashes once per second.
- `volume`: Windows speech volume, 0–100; default 70.
- `rate`: Windows speech rate, -10–10.
- `colors`: RGB arrays keyed by `done`, `input_needed`, and `blocked`.
- `keys`: HID key arrays keyed by `codex` (default `[58]`, F1) and `claude`
  (default `[59]`, F2). These are per-computer preferences.

The message-only prototype's singular `color` override still works by setting
all three categories to that color; remove it to use category colors. The older
PR-specific `reason`/`source` arguments are not supported.

Speech uses the default Windows audio output (headphones if selected). Lighting
discovers Engine's loopback address from ProgramData and releases its GameSense
effect when the alert ends. Engine's normal event timeout provides a fallback
if a process dies. Another active GameSense app can affect lighting priority.

Local invocations share an automatically launched background process over a
Windows named pipe. Speech is serialized; F1 and F2 can flash simultaneously.
Pending alerts are saved under `AGENT_ALERT_STATE_DIR` (default:
`~/.agent-notification-alerts`). State contains notification messages and optional
session IDs, not transcripts. Restarting the process restores lights without
replaying speech. There is no automatic login service or PR polling.
Remote/cloud agents require a separate secure bridge to this computer.

## Opening the notifying session

Set `AGENT_ALERT_PYTHON` to a Windows Python executable to enable Ctrl+Alt+F1
(Codex) and Ctrl+Alt+F2 (Claude). No Python packages are required. The helper runs
hidden and registers shortcuts while the background process runs. Conflicts are
reported by `status`. It does not read window contents or detect focus.

Include optional `session: { "id": "..." }` in `notify_user`, or
`--session ID` on the CLI, using verified desktop metadata. Codex accepts a
thread UUID; Claude accepts a Desktop `local_`, `session_`, or `cse_` ID.
Do not guess IDs or use a CLI session ID. Without desktop metadata the alert still
works, but its shortcut has no target. Opening a task does not clear its alert.

Link routes were checked against the installed Windows app code on 2026-09-11.
They are app internals and may change; actual navigation still needs a live
check with the installed app. No focus-detection dependency is required.

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
an existing notifier would currently still require the hardware adapter, so no
third-party notifier is installed.

## Verification

`npm test` exercises notification and acknowledgement through an actual MCP
client/server exchange in dry-run mode, persistent state across process restarts,
app isolation, idempotent acknowledgement, and retention of unrelated alerts.
It also covers
invalid input rejection, independent device failure handling, and mutual
exclusion including release after an error. On the initial MSI GS75 Windows
machine, a live demo returned successful Engine and speech results; the user
confirmed seeing the amber keys and hearing the message. Other machines and
keyboard models have not been tested. There is no visual UI to render.

The later category/key test was also confirmed by the user on that machine:
only F1 green, then only F2 orange, then only F1 red, each with successful
speech and Engine responses. The automated suite additionally checks category
validation, message-only compatibility, per-app key routing, and CLI parsing.
