---
name: Task
about: A specific piece of engineering work that is neither a user-facing bug nor a feature, such as a refactor, tooling, performance, documentation, or a follow-up split from another ticket. Filed as issue type Task.
title: ""
labels: ""
type: Task
assignees: ""
---

<!--
Title: one sentence naming the work and the mechanism it concerns. Example: "Route planner: replace the wall-clock budget with deterministic bounds + visited-state dedupe". No prefix and no ticket number.

Labels: apply every area the work touches. `system: sparkdown` (language, compiler, engine packages), `system: sparkle-ui` (Sparkle layout, components, styles, reactive engine, DOM renderer), `app: web-editor` (the impower-dev editor and web player), `app: vscode-extension` (vscode-sparkdown), `documentation`.

Keep every heading below, in this order. Write "Not yet known" under a heading rather than deleting it. Delete these comments before filing.
-->

## Problem

<!-- What is wrong or missing today, and the cost of leaving it. One or two paragraphs. -->

## Where it is

<!-- file:line references at a specific commit (a permalink is best), the relevant lines quoted, and how the code is reached. -->

## Evidence

<!-- Measurements, logs, or a reproduction that shows the problem. Give absolute numbers and say how each was taken. Write "Confirmed by reading the code" when that is all there is. -->

## Suggested direction

<!-- The change to make, alternatives considered and why they lost, and anything that must stay true afterwards. -->

## Done when

<!-- Conditions a reviewer can check: which tests exist, what a measurement reads, what the running app shows. -->

## Related

<!-- Issues and pull requests this depends on, was split from, or was found by, for example "Found by adversarial review on #383". -->
