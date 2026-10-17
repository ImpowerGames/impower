# Takeover brief for Feature #1961

Checkpoint 56 (this commit), 2026-10-17T00:23:50.019Z, after checked-in. Coordinator local_bf62b311-1fa1-4cfd-8ce2-974226c01d3c on DESKTOP-726EO47.

Resume with checkpoint.mjs resume in a new session; it takes over only by pushing a takeover checkpoint on top of this one. Then snapshot GitHub and plan: GitHub is the authority for issues, PR heads, review rounds and CI, and nothing below replaces that reading.

- Every writer, pending start and process below belongs to the host it names. A destination's local view of another host proves nothing: an absent PID, an unlisted session or a missing launch directory there is not an exit. Such a writer stays unknown until it is observed on its own host, by its coordinator there or by the maintainer, and recorded as an observation naming that host.
- A review continuation belongs to the writer session that submitted it. Never claim it from another session; once that writer is observed to have ended, cancel and release the job on its host as the review supervisor describes, and continue the PR with a new writer whose round count continues from the PR's posted rounds.
- The periodic check-in is session-scoped and ended with its coordinator; recreate it on your own runner with: node .agents/skills/orchestrate-feature/feature-run.mjs schedule --record 'C:/Users/Brode/AppData/Local/Temp/claude/C--Users-Brode-Documents-GitHub-impower/ef5ffdf2-69b9-48fe-8a73-c572cee971e0/scratchpad/writer-1961-lLqMQS/run.json'.
- New and replacement writers use your harness's default writer model unless the invocation's explicit model override still applies; writers already running keep their recorded model and effort. Confirm each new route with its preflight before dispatch, and let review-pr select reviewers against the actual new writer.

## #1963

- claude-cli claude-opus-5-5 at medium, process 51820 on DESKTOP-726EO47
- as of 2026-10-17T00:23:48.797Z, DESKTOP-726EO47 held unfinished files in C:/Users/Brode/Documents/GitHub/impower.worktrees/feat/1963-retarget-internal-tracker that may exist only there; recover those bytes there before restarting or overwriting this work
- review job pr-2009/round-1/launch-callers-1 on DESKTOP-726EO47: round 1 reviewed 5cbe91c55, completed {"callers":1} of planned ["callers","undirected"]; last launched reviewer callers attempt 1 of round 1 (planned ["callers","undirected"]), last event finished

## #1966

- claude-cli claude-opus-5-5 at high, process 11732 on DESKTOP-726EO47
- as of 2026-10-17T00:23:48.797Z, DESKTOP-726EO47 held unfinished files in C:/Users/Brode/Documents/GitHub/impower.worktrees/feat/1966-tracker-migration-tool that may exist only there; recover those bytes there before restarting or overwriting this work
- review job pr-2015/round-1/launch-data-1 on DESKTOP-726EO47: round 1 reviewed 8c7d5a1e1, completed {"data":1} of planned ["data","undirected"]; last launched reviewer data attempt 1 of round 1 (planned ["data","undirected"]), last event finished
