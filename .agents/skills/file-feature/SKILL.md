---
name: file-feature
description: Plan new functionality through research and a design interview, then file an agreed Feature ticket. Use before implementing new behavior; specified tickets belong to resolve-issue and defects to file-bug.
---

# Plan and file a feature

Settle the author's intended behavior and file the agreed plan; implementation follows through resolve-issue in a fresh session.

## 1. Find facts

Inspect the existing code, relevant Sparkdown guide chapters, nearest feature's pipeline and prior tracker discussion. Answer factual questions yourself. If substantial exploration benefits from a subagent, delegate that bounded exploration while asking independent design questions. Name the session `FILE feature: <short capability>` when supported.

Before recommending design choices, read [prior-art research](references/prior-art.md) and compare relevant peer systems. Ground specific claims in documentation; fit recommendations to this project's conventions.

## 2. Interview

Before the first round, read [interview format and decision checklist](references/interview.md). Ask currently unblocked decisions together, numbered with a recommended answer and reason. Wait for answers before asking dependent questions. Cover the author's problem, concrete surface, semantics/edge cases, preview versus play, shipping surfaces, reuse, tests and scope where applicable.

Do not file until the user confirms shared understanding. Delegated decisions are marked “decided by default.” If the session is unattended and decisions remain open, post the questions and stop. For uncertainty about facts or incomplete semantic coverage, consult [interview judgment](references/judgment.md).

## 3. Size and publish

If the plan needs multiple PRs, read [vertical slicing](references/slicing.md) before filing the parent and dependent Task slices.

Before drafting or publishing, read [Feature body requirements](references/publishing.md) and [shared publishing rules](../references/publishing.md). Use the template in order, preserve alternatives and decision reasons, specify verifiable acceptance criteria, and create the issue with type Feature and current area labels in one call. Read back its body and type. Rename with the issue number when supported.

## 4. Hand off

Give the user the issue number and a short plan. Implementation uses resolve-issue on that ticket in a fresh session; do not begin it here. Retain the design in the ticket, including any draft document as the design of record and the slice dependencies.

At completion, or when yielding for input or help, provide the normal chat handoff and invoke [notify-user](../notify-user/SKILL.md) for an optional companion alert identifying the work and next action. Use `done` when no action is needed, `user_input_needed` for a question or review/merge request, or `blocked` when progress requires help. Preserve this workflow's gates and include evidence, links and missing information in chat. If the notifier is unavailable, skip it silently.
