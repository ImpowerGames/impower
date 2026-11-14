---
name: Maintainer decision
about: A choice an agent needs the maintainer to make, filed by the ask-maintainer tool, which refuses an incomplete request.
title: ""
labels: "maintainer: decision"
type: Task
assignees: ""
---

<!--
File this with `node .agents/skills/ask-maintainer/maintainer-request.mjs file <request.json>`, never by hand. The tool builds the body from a request file, refuses an incomplete request, uploads the pictures into place and links the request to each ticket it holds up.

Title: the question in one sentence, then the affected tickets in parentheses. Example: "What should mark a choice the preview picked by itself? (#2271)".

Labels: `maintainer: decision`. Assignee: the maintainer. No parent, no milestone and no project entry.

Above the first heading the tool writes the fallback line (or "This one waits for you" with the reason), then the recommendation, what is parked, what carries on meanwhile and who asked. "What you're looking at" appears only when the request has background. `<letter>` stands for the recommended option. After the answer line the tool writes who filed the request and one hidden data line starting `maintainer-request`, which is kept when the other comments are stripped.
-->

## The short version

## What you're looking at

## The options

## Side by side

## Why <letter>

---

**To answer:** close this issue with a comment, either a letter (`<letter>`) or your own words, which are recorded word for word. Close it with no comment to accept the recommendation. Comment without closing to ask a question or say what's missing; it stays open, and any fallback clock starts again when I reply.
