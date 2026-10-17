# Takeover brief for Feature #1940

Checkpoint 150 (this commit), 2026-10-17T03:21:05.296Z, after a new plan. Coordinator local_185c1aeb-4ba5-4bab-8b8c-e42993c85a29 on DESKTOP-726EO47.

Resume with checkpoint.mjs resume in a new session; it takes over only by pushing a takeover checkpoint on top of this one. Then snapshot GitHub and plan: GitHub is the authority for issues, PR heads, review rounds and CI, and nothing below replaces that reading.

- Every writer, pending start and process below belongs to the host it names. A destination's local view of another host proves nothing: an absent PID, an unlisted session or a missing launch directory there is not an exit. Such a writer stays unknown until it is observed on its own host, by its coordinator there or by the maintainer, and recorded as an observation naming that host.
- A review continuation belongs to the writer session that submitted it. Never claim it from another session; once that writer is observed to have ended, cancel and release the job on its host as the review supervisor describes, and continue the PR with a new writer whose round count continues from the PR's posted rounds.
- The periodic check-in is session-scoped and ended with its coordinator; recreate it on your own runner with: node .agents/skills/orchestrate-feature/feature-run.mjs schedule --record 'C:\Users\Brode\AppData\Local\Temp\claude\C--Users-Brode-Documents-GitHub-impower\1d4a9778-62f6-41b0-be15-18cd8ed93212\scratchpad\writer-1940-73eEfR\run.json'.
- New and replacement writers use your harness's default writer model unless the invocation's explicit model override still applies; writers already running keep their recorded model and effort. Confirm each new route with its preflight before dispatch, and let review-pr select reviewers against the actual new writer.

## Feature verification

Feature verification 7547a31c on main `4ba580faf` at 2026-10-17T03:14:46.205Z: complete.
