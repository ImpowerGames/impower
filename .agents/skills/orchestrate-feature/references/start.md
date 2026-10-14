# Starting a run

The commands below are `node .agents/skills/orchestrate-feature/feature-run.mjs <command>`.

## Your session, mode and title

Run `init` with `--record <dir>/run.json --checkout <main checkout> --repo <owner/name> --feature <N> --harness <your runner> --coordinator <your own session id> --coordinator-model <model> --coordinator-effort <effort> --coordinator-mode <permission mode> --slug <words> --invocation "<request>" --merging coordinator|maintainer`, adding `--writer-model` and `--concurrency` when the request names them.

- `--coordinator` is the id your writers message, read as the [runner notes](../../RUNNERS.md) describe: a Claude desktop session's `local_<uuid>`, or a Codex thread's bare `<uuid>`. `init` refuses anything else, so a path, a directory name or a bare id where the runner expects its own form, none of which reaches a session, fails before any writer exists. The record keeps the id, and every brief and later message takes it from there.
- `--coordinator-mode` is the permission mode you run in now. The plan dispatches nothing until it is `bypassPermissions`, because writers launch in your own mode and writers on agent-launch tooling need bypass. Running `init` again in the same session records a switch.
- `--slug` is two to four lowercase words from the Feature's title, joined by hyphens, as a resolve-issue branch slug is. `init` records your session title `ORCH #<N>: <slug words>`, and the title hook then refuses shell commands until you rename the session to exactly that title, as the runner notes describe. A coordinator resumed on a session that already carries the title is not asked again, and a takeover keeps the title the record holds.

`init` resolves the writer model, sets the concurrency bound and refuses a second coordinator for the same Feature; continue in the one it names, or ask the maintainer. It prints `dispatchBlocked` while your recorded mode holds dispatch.

## The periodic check-in

The coordinator checks in every 30 minutes whether or not a writer messaged it. Writers message at every decision point; the check-in catches a message that was lost and a writer that died. The interval follows from the prompt cache, which lasts an hour: the scheduler fires a recurring job up to 10 percent late, so an hourly job can miss the cache and re-read the whole context at full price, which costs more than the two cheaper check-ins it replaces.

`schedule --record <run.json>` prints the job: its cron expression, its prompt (the wake routine in [writer reports](writer-reports.md) against this record) and the capability of your runner that creates it. Create it, then record it with `check-in --job <id>`; a runner with no scheduling capability records `check-in --none <reason>` and runs the wake routine at the start of every turn instead. The record keeps the job, its expiry and the `schedule` command, so a resuming coordinator recreates the job with that command. Each plan reports the job under `checkIn` as `missing`, `recreate` (after a takeover), `expired` or `scheduled`, with the next step for the first three. Every check-in ends by recording what it did with `checked-in --outcome "<what it did>"`, or `--outcome "no change"`.

## The session group

Where your runner groups sessions, as the runner notes describe, file your own session into the group `Orchestrate #<N>`, reusing the group when it exists, and record it with `group --id <id>`; elsewhere record `group --none <reason>`. The group keeps a Feature's sessions together in the session list. Each plan lists under `grouping` every writer session in the app that is not yet in the group; file it and record `filed --ticket <N> --group <id>`. A takeover keeps the recorded group, so new writers join the same one.
