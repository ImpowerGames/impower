---
name: resolve-issue
description: Resolve a specified GitHub ticket through reproduction, an isolated fix, regression and live verification, a draft PR, independent review and readiness. Use when asked to implement or fix an issue by number.
---

# Resolve a GitHub issue

Run the steps below in order in a dedicated worktree. Commands are relative to the repository root. Load each step skill when reached; references are conditional.

## 0. Preflight

Run `node .agents/skills/drive-web-editor/driver.mjs preflight`. All checks must pass; an intentionally absent dependency install is allowed for tooling/docs-only work. On low disk, use [clean-worktrees](../clean-worktrees/SKILL.md), dry run first. Before creating or repairing a worktree, read [worktree setup](references/worktree.md).

## 1. Read the ticket

Read the full body, current labels and type with `gh issue view N --json number,title,body,labels` and the issue REST API. Verify cited code still supports the claim; investigate missing evidence yourself. Rename the session `FIX #N: <short behavior summary>` when the runner supports it; otherwise continue.

## 2. Create the worktree

Follow [worktree setup](references/worktree.md): never work on main or reuse another issue's worktree. Resolve paths from the main checkout and existing layout. Install dependencies only when required, with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, then repeat preflight. All later work runs in the new worktree.

## 3. Reproduce before you fix

Establish the reported failure before editing and retain before-evidence.

- Compiler/parser/engine: invoke `/write-regression-test` (skill name `write-regression-test`) in reproduction-only mode to write the failing case.
- Editor/preview/visual: invoke `/drive-web-editor` (skill name `drive-web-editor`) and inspect a screenshot of the broken state.
- Extension: invoke `/drive-vscode-web` (skill name `drive-vscode-web`) and inspect the served workbench.
- Tooling/docs with nothing to boot: exercise the pre-change behavior with the relevant standalone check. A newly written check must fail against the base, not merely pass after editing. For prose with no executable check, compare the relevant rules before and after and disclose that manual verification.

## 4. Fix it

Make the scoped change. Follow repository-wide artifact, generated-source and concurrency rules. For new standalone checks, stage them and confirm discovery by `node scripts/check-agent-tooling.mjs`; review its expected count, CI triggers and sparse-checkout inputs together.

## 5. Regression test

Invoke `/write-regression-test` now (skill name `write-regression-test`). Use full verification for fixes; for tooling, run the checks that exercise the change. Record the failing assertion, green result and verified suite counts.

## 6. See the change where it runs

Invoke `/drive-web-editor` now (skill name `drive-web-editor`) for changes under `impower-dev/` or `packages/`. Use the actual project for assets and installed-worker verification for service-worker changes. Inspect before/after pixels; use measured evidence for changes with no visual signature and still inspect for visual regressions.

For `vscode-sparkdown/` changes and the shared language server, invoke `/drive-vscode-web` (skill name `drive-vscode-web`); shared language-server changes use both drivers. Surfaces the served workbench cannot reach require a desktop development host or an explicit unverified disclosure in the PR. Tooling/docs-only work has nothing to boot: run its checks and say so.

## 7. Commit, push, and open a draft PR

Read [commit and publishing](references/publishing.md) before publishing. Stage deliberately by path, remove only your scratch files, read the commit back, push and create a draft using the template. Include `Closes #N`, actual test evidence, limitations and any known performance cost. Read the PR back.

## 8. Adversarial review

Check CI for the current head. For cancelled/timed-out runs, read [CI evidence](references/ci-evidence.md) and diagnose before rerunning or changing bounds; an unexplained cancellation is not a verified gate.

Invoke `/review-pr` now (skill name `review-pr`). It owns review, adjudication, correction rounds and readiness. Do not mark ready before its gates pass.

## The completion gate

A behavior test is red on the base and green on the fix (or the relevant tooling check proves the change); live or measured evidence is inspected and limitations disclosed; the PR contains `Closes #N` and verification; review marks it ready or the draft states exactly what remains.

At completion, or when yielding for input or help, provide the normal chat handoff and invoke [notify-user](../notify-user/SKILL.md) for an optional companion alert identifying the work and next action. Use `done` when no action is needed, `user_input_needed` for a question or review/merge request, or `blocked` when progress requires help. Preserve this workflow's gates and include evidence, links and missing information in chat. If the notifier is unavailable, skip it silently.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `git worktree remove` reports `Directory not empty` | Use clean-worktrees dry run and its recovery record. Preserve unmerged work and external targets; never bypass refusal with recursive deletion. |
