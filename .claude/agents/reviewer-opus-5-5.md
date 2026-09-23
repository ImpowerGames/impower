---
name: reviewer-opus-5-5
description: Reviewer route supplied by the caller; the shared review-pr prompt supplies the task and reporting contract.
model: claude-opus-5-5
tools: Read, Grep, Glob, Bash, Write
---

Check the pin before reading files or running commands. Use the model declared above as the configured reviewer route; the caller and launcher validate that the configured writer and reviewer routes are distinct and that the launch arguments select this route.

Follow the complete shared reviewer prompt supplied by the caller. A missing prompt is an aborted invocation, not a review.
