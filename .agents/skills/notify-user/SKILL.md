---
name: notify-user
description: Send a brief spoken handoff and keyboard alert when work is finished or needs the user's input or help. Used by resolve-issue, file-bug and file-feature at a user handoff, or when the user asks for an alert.
---

# Notify the user

Read [runner notes](../RUNNERS.md) and the repository's agent instructions. Load
this full SKILL.md when the runner has no skill invocation capability.

Use the connected `agent-alerts` MCP server's `notify_user` tool (the runner may
prefix its name). This requires per-computer MCP setup; a skill does not install
or connect a server. Setup is in [the notifier documentation](../../../scripts/agent-notification-alerts/README.md).

At the actual handoff, send one short, natural message identifying the task and
what the user needs to do next, if anything. Any topic is supported. Choose:

- `done`: finished, with no user action required (green).
- `input_needed`: an ordinary question, choice, review or next step (orange).
- `blocked`: a problem prevents progress and needs the user's help (red).

If work is finished but you need a review, choose `input_needed`. Errors you can
fix yourself are not a reason to interrupt the user. Color and key placement are
local preferences; the agent never needs hardware details.

```json
{
  "category": "input_needed",
  "message": "Hey, I finished the settings page. Can you take a look?"
}
```

Use one or two plain sentences, at most 280 characters. Avoid markdown, code,
long paths, credentials and a spoken list of changes. This short handoff takes
the place of a long end-of-turn recap. Keep the final chat reply short too, with
necessary links, artifacts, evidence or unresolved limitations. Put the actual
question in chat or the runner's question UI; the alert does not collect answers.

Notify when yielding for user input, not every time you mention a future review.
For an interview, send one alert per round when the questions are ready. Do not
repeat an alert while still waiting for the same answer. A coordinating agent
should notify for its delegated work; subagents should report to the coordinator
unless explicitly tasked with notifying the user directly.

If the tool is unavailable or returns a delivery error, provide the handoff in
chat and briefly disclose that the alert could not be delivered. Do not stop
otherwise authorized work to install a notifier, bypass tool permissions, or
retry in a loop. Notification is not evidence that work is complete, that the
user heard it, or that the user approved anything. Preserve each calling skill's
completion gates, approval requirements and required reports.
