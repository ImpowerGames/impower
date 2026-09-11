---
name: notify-user
description: Supplement the normal chat handoff with a generic notification for users who connected an optional notifier. Used by resolve-issue, file-bug and file-feature when work finishes or needs user input or help.
---

# Notify the user

Read [runner notes](../RUNNERS.md) and the repository's agent instructions. Load
this full SKILL.md when the runner has no skill invocation capability.

Always provide the normal handoff in chat, including the summary, questions,
links, evidence and limitations required by the task and the user's preferences.
Notifications are an optional additional output, not a replacement for chat.

If the user connected an `agent-alerts` MCP server exposing `notify_user`, call
it once at the handoff (the runner may prefix its name). Respect an explicit
request to disable notifications. If no notifier is connected, skip this step
silently: do not prompt for setup, warn, or attempt to install one. A skill does
not create an MCP connection. Users can connect their own implementation of the
same tool for other automations. The provided keyboard/speech program is one
optional adapter; see [setup and the contract](../../../scripts/agent-notification-alerts/README.md).

At the actual handoff, send one short, natural message identifying the task and
what the user needs to do next, if anything. Any topic is supported. Choose:

- `done`: finished, with no user action required.
- `input_needed`: an ordinary question, choice, review or next step.
- `blocked`: a problem prevents progress and needs the user's help.

If work is finished but you need a review, choose `input_needed`. Errors you can
fix yourself are not a reason to interrupt the user. Each user's automation
chooses what these categories do; the agent never needs hardware details.

```json
{
  "category": "input_needed",
  "message": "Hey, I finished the settings page. Can you take a look?"
}
```

Use one or two plain sentences, at most 280 characters. Avoid markdown, code,
long paths, credentials and a spoken list of changes. This short message is a
companion to the normal chat handoff. Do not shorten or remove required chat
content because an event was sent. Put the actual question in chat or the runner's
question UI; the alert does not collect answers.

Notify when yielding for user input, not every time you mention a future review.
For an interview, send one alert per round when the questions are ready. Do not
repeat an alert while still waiting for the same answer. A coordinating agent
should notify for its delegated work; subagents should report to the coordinator
unless explicitly tasked with notifying the user directly.

If delivery fails, still provide the normal handoff in chat. Do not interrupt
the task with notifier troubleshooting unless the user asked to test or repair
it; in that case report the failure accurately. Do not stop otherwise authorized
work to install a notifier, bypass tool permissions, or retry in a loop.
Notification is not evidence that work is complete, that the
user heard it, or that the user approved anything. Preserve each calling skill's
completion gates, approval requirements and required reports.
