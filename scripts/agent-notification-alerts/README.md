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
node src/main.mjs notify "Hey, I finished the settings page. Can you take a look?"
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
  "message": "Hey, I finished the settings page. Can you take a look?"
}
```

`message` is the only argument. Any topic is welcome; there are no event
categories or task-specific fields. The exact message is spoken without an
automatic "Agent" prefix. Messages are limited to 280 characters, with one or
two short, natural sentences recommended. All alerts use the locally configured
color (amber by default). The tool delivers a message; it does not verify claims
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

For Claude Code, register an absolute path to this program (replace the example):

```powershell
claude mcp add --transport stdio --scope user agent-alerts -- node "C:/path/to/impower/scripts/agent-notification-alerts/src/main.mjs" mcp
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

## Machine settings

Copy `config.example.json` to ignored `config.local.json`, or set
`AGENT_ALERT_CONFIG` to an absolute JSON file outside the repo. Partial overrides
are supported. A private launcher can set that
environment variable and invoke the shared entry point.

- `keyboard` / `speech`: enable each channel independently.
- `zone`: `function-keys` or `all`.
- `durationMs`: 1000–30000; default 6000. Lighting flashes once per second.
- `volume`: Windows speech volume, 0–100; default 70.
- `rate`: Windows speech rate, -10–10.
- `color`: one RGB array, default `[255, 170, 0]`.

Earlier prototype settings used `colors` and calls used `reason`/`source`.
Replace `colors` with `color` in any private config, remove `reason`/`source`
from MCP calls, and drop the reason argument from CLI commands.

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
an existing notifier would currently still require the hardware adapter, so no
third-party notifier is installed.

## Verification

`npm test` exercises an actual MCP client/server exchange in dry-run mode,
invalid input rejection, independent device failure handling, and mutual
exclusion including release after an error. On the initial MSI GS75 Windows
machine, a live demo returned successful Engine and speech results; the user
confirmed seeing the amber keys and hearing the message. Other machines and
keyboard models have not been tested. There is no visual UI to render.
