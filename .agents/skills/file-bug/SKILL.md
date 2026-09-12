---
name: file-bug
description: File a Bug from a reported defect after reproducing it. Use for requests to log or ticket wrong behavior; fixing a specified issue belongs to resolve-issue.
---

# File a bug ticket

Produce one actionable Bug or add evidence to an existing open match. Reproduce before filing; do not silently turn an unverified claim into a confirmed defect.

## 1. Read and find context

Collect the surface, script/project, steps, exact symptom and available build information. Inspect supplied artifacts and search open and closed issues by concept before building a reproduction. Add evidence to an open match; cite relevant closed reports in a new ticket. Ask only for missing information that blocks reproduction.

If supported, name the session `FILE bug: <short behavior>`; leave a parent workflow's title unchanged.

## 2. Reproduce and diagnose

Before building a reproduction, read [reproduction and diagnosis](references/diagnosis.md). Use a neighboring passing fixture's syntax, minimize inputs and verify that the failure matches the user's symptom.

Select the existing seam: invoke write-regression-test in reproduction-only mode for compiler/engine tests, drive-web-editor for editor/preview, or drive-vscode-web for extension behavior. Assets require a whole project. Look at captured pixels for visual bugs; measure performance symptoms and nondeterministic failure rates. Before interpreting empty language surfaces or a failing baseline suite, read [surface caveats](references/surface-caveats.md).

Retain script/test, exact command, output, commit and screenshots. Once reproduced, investigate the cause within a bounded effort; label it confirmed only with confirming evidence, otherwise suspected or unknown. Do not implement the fix here.

## 3. If reproduction fails

Tell the user what was tried, where, and what happened instead; ask for the missing artifact/environment. Do not file unless the informed user still requests a ticket. In that case state “Not reproduced” and preserve attempted steps.

## 4. Publish

Before writing the ticket, read [Bug body requirements](references/publishing.md) and [shared publishing rules](../references/publishing.md). Use the Bug template in order, confirmed evidence, expected/actual behavior, environment, and bounded analysis with commit-specific source references. Create with type Bug and current area labels in one call; read the body and type back.

## 5. Hand off

Put the issue number in the session title when appropriate. Remove only your scratch test/repro artifacts and stop servers you started; preserve unrelated pre-existing changes. Tell the user the issue and finding. If fixing is requested, hand the number to resolve-issue rather than performing a partial fix in this workflow.

At completion, or when yielding for input or help, provide the normal chat handoff and invoke [notify-user](../notify-user/SKILL.md) for an optional companion alert identifying the work and next action. Use `done` when no action is needed, `user_input_needed` for a question or review/merge request, or `blocked` when progress requires help. Preserve this workflow's gates and include evidence, links and missing information in chat. If the notifier is unavailable, skip it silently.
