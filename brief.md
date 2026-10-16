# Takeover brief for Feature #1895

Checkpoint 299 (this commit), 2026-10-16T16:34:11.915Z, after verify of #1951. Coordinator local_bede5658-a16d-4558-858b-9a8d10696a23 on DESKTOP-726EO47.

Resume with checkpoint.mjs resume in a new session; it takes over only by pushing a takeover checkpoint on top of this one. Then snapshot GitHub and plan: GitHub is the authority for issues, PR heads, review rounds and CI, and nothing below replaces that reading.

- Every writer, pending start and process below belongs to the host it names. A destination's local view of another host proves nothing: an absent PID, an unlisted session or a missing launch directory there is not an exit. Such a writer stays unknown until it is observed on its own host, by its coordinator there or by the maintainer, and recorded as an observation naming that host.
- A review continuation belongs to the writer session that submitted it. Never claim it from another session; once that writer is observed to have ended, cancel and release the job on its host as the review supervisor describes, and continue the PR with a new writer whose round count continues from the PR's posted rounds.
- The periodic check-in is session-scoped and ended with its coordinator; recreate it on your own runner with: node .agents/skills/orchestrate-feature/feature-run.mjs schedule --record 'C:/Users/Brode/AppData/Local/Temp/claude/C--Users-Brode-Documents-GitHub-impower/0210ef10-d559-4c5a-ab4b-33c82aca336d/scratchpad/writer-1895-UjKcSO/run.json'.
- New and replacement writers use your harness's default writer model unless the invocation's explicit model override still applies; writers already running keep their recorded model and effort. Confirm each new route with its preflight before dispatch, and let review-pr select reviewers against the actual new writer.

## #316

- claude-cli claude-opus-5-5 at medium, process 60204 on DESKTOP-726EO47
- as of 2026-10-16T16:34:10.220Z, DESKTOP-726EO47 held unfinished files and unpushed commits in C:/Users/Brode/Documents/GitHub/impower.worktrees/fix/316-silent-include-define-run that may exist only there; recover those bytes there before restarting or overwriting this work

## #1800

- claude-cli claude-opus-5-5 at low, process 41376 on DESKTOP-726EO47
- as of 2026-10-16T16:34:10.220Z, DESKTOP-726EO47 held unfinished files and unpushed commits in C:/Users/Brode/Documents/GitHub/impower.worktrees/fix/1800-valueless-global-diagnostic that may exist only there; recover those bytes there before restarting or overwriting this work

## #1951

- claude-cli claude-opus-5-5 at low, process 9444 on DESKTOP-726EO47
