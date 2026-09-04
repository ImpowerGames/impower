<!--
Title: conventional commit form with the package or area as scope and the issue number at the end. Example: "fix(compiler): accumulate all matching filtered_layers (#302)". Types: fix, feat, perf, refactor, test, docs, chore, build.

Open as a draft and mark it ready only after review. Keep every heading below, in this order; write "None" or "Not applicable" with a one-line reason under a heading rather than deleting it. A performance cost the change knowingly carries goes at the very top of the body, above the first heading. Delete these comments before opening.
-->

Closes #

## What broke and why

<!-- For a bug: the wrong behavior and its mechanism, with file:line references at the base commit. For a feature or task: the goal and the decision this implements, pointing at the issue. -->

## The fix

<!-- What changed and how it works now. Name each file touched and why. Mention any alternative rejected during the work and the reason, where a reviewer could reasonably ask. -->

## Regression test

<!-- Path of each test added or changed. For a bug: the assertion it fails with on the pre-fix source, and confirmation that it passes after. For a feature: what each test proves. -->

## Suite results

<!-- Which suites ran, with the command per package, and the actual Test Files and Tests counts. Name any pre-existing failure and confirm it also fails on origin/main. -->

## Verification

<!-- For anything visible: before and after screenshots of the running editor, extension, or player. Otherwise the before and after measurement that replaces them, with absolute numbers and how they were taken. For configuration or tooling changes: what was run to prove the change does what it claims. -->

## Review

<!-- Findings from adversarial or human review and what happened to each: fixed in which commit, or declined and why. Write "Not yet reviewed" when opening the draft. -->

## Follow-ups

<!-- Work deliberately left out, each with the issue that tracks it. -->
