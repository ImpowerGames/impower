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
node src/main.mjs notify "Hey, I finished the settings page. Can you take a look?" --category input_needed
node src/main.mjs notify "Your photos are organized. Everything is ready."
node src/main.mjs notify "I compared the flights. Can you choose a departure time?" --dry-run
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

The tool description instructs agents to send one brief handoff when work is
finished or needs the user's attention. For example: "Hey, I finished organizing
the photos. Can you pick a cover?" If nothing is needed, simply say what is ready.
Replace the long recap with that short handoff, and keep the final chat reply
short too. Necessary links, files and unresolved blockers still belong in chat.
If audio/lighting fails, deliver the handoff in chat rather than assuming it was
heard. These are agent instructions, not an automatic interception of final
responses: the agent must call the tool. No idle detector or Stop hook is installed.

The shared [notify-user skill](../../.agents/skills/notify-user/SKILL.md) is
invoked at user handoffs by `resolve-issue`, `file-bug`, and `file-feature`.
It retains each workflow's completion gates and falls back to chat when the
MCP tool is unavailable. Skills become available in checkouts containing this
change; a running session may need to restart to discover them.

For Claude Code, register an absolute path to this program (replace the example):

```powershell
claude mcp add --transport stdio --scope user agent-alerts --env AGENT_ALERT_APP=claude -- node "C:/path/to/impower/scripts/agent-notification-alerts/src/main.mjs" mcp
claude mcp get agent-alerts
```

Restart Claude Code and check `/mcp`. Ask: "When you finish work or need my
attention, call notify_user with a short, natural handoff saying what you finished
and what you need from me, if anything. Use that in place of a long recap. Keep
your final chat response short, with any necessary links or blockers."
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

## Machine settings

Copy `config.example.json` to ignored `config.local.json`, or set
`AGENT_ALERT_CONFIG` to an absolute JSON file outside the repo. Partial overrides
are supported. A private launcher can set that
environment variable and invoke the shared entry point.

- `keyboard` / `speech`: enable each channel independently.
- `zone`: `function-keys` or `all`, for manual calls without an app identity.
- `durationMs`: 1000–30000; default 6000. Lighting flashes once per second.
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

Separate local invocations serialize through a loopback port lease (39761),
so speeches and keyboard effects do not overlap. The listener accepts no
commands and closes incoming sockets. The OS releases it when the process ends.
After two minutes waiting for the lease, the tool reports a busy error. A
different application using that port will also cause a busy error. Alerts are
brief, not persistent indicators, and there is no background PR polling or
automatic startup service. Remote/cloud agents require a separate secure bridge
to this computer; a remote process cannot directly control local devices.

## Opening the notifying session

F1/F2 are lighting targets only; this version does not register keyboard shortcuts.
A future Ctrl+Alt+F1/F2 helper could open the latest notifying session for each
app if notifications carry a verified session link. Multiple sessions per app
would need a last-alert or cycling policy. Exact-session desktop link formats
have not been verified for both apps, so no guessed links are constructed.
Claude's documented `claude-cli://open` launches a new CLI session, not the
existing Desktop session. No global shortcuts or session routing are installed.

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

`npm test` exercises an actual MCP client/server exchange in dry-run mode,
invalid input rejection, independent device failure handling, and mutual
exclusion including release after an error. On the initial MSI GS75 Windows
machine, a live demo returned successful Engine and speech results; the user
confirmed seeing the amber keys and hearing the message. Other machines and
keyboard models have not been tested. There is no visual UI to render.

The later category/key test was also confirmed by the user on that machine:
only F1 green, then only F2 orange, then only F1 red, each with successful
speech and Engine responses. The automated suite additionally checks category
validation, message-only compatibility, per-app key routing, and CLI parsing.
