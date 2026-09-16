# Default reviewer routes

Every launcher plan supplies `writer` and `writerEffort` read from the runner, not from the model's own description of itself; the launcher and the supervised route refuse a plan without a valid `writerEffort` (`low`, `medium`, `high`, `xhigh` or `max`, and also `ultra` for a Codex writer). When the plan omits `reviewer`, the launcher resolves it from the repository's defaults table.

## Discover the writer's model and effort

- Claude Code desktop: the session metadata tool (`get_session` with `self`) returns `model` (for example `claude-opus-5`) and `effort` (for example `medium`). Every shell command also receives `CLAUDE_EFFORT` with the session's effort; no variable carries the model. Whether `CLAUDE_EFFORT` follows an effort change made during the session is unverified, because a session cannot change its own effort; prefer the metadata tool.
- Claude Code CLI: the launch arguments `--model` and `--effort` or the settings they default from, plus `CLAUDE_EFFORT` in shell commands.
- Codex: each session writes a rollout file `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<timestamp>-<thread id>.jsonl`. Its `turn_context` rows carry `payload.model` (for example `gpt-6-astra`) and `payload.effort` (for example `max`); the latest row is current. `~/.codex/config.toml` holds only the defaults, as `model` and `model_reasoning_effort`, which a session's launch arguments can override. Codex exports no equivalent environment variable.

## Resolve the reviewer

`scripts/agent-handoff.mjs` resolves a missing `reviewer` from `.claude/reviewer-defaults.json`. Rows are keyed by writer route (a context-window suffix such as `[1m]` is ignored), writer effort and ticket tier; when one writer effort appears in two tiers, the plan must supply `ticketEffort` (`low`, `medium`, `high` or `correctness-critical`). Each row has a cross-vendor `primary` list and a same-vendor `fallback` list of serial reviewers. `reviewerFallback: true` selects the fallback list and `reviewerIndex` selects a later serial reviewer in the chosen list; a two-reviewer tier runs one plan per index.

Leave the review step's model and effort unset. The launcher appends `--agent <definition> --effort <effort>` for a Claude reviewer, and inserts `--model <route> -c model_reasoning_effort="<effort>"` after `exec` for a Codex reviewer on either the pinned native route or the awaited `codex exec` route. The `launching` journal row records the route as `model`, the effort as `reviewerEffort`, and the selection as `reviewerResolved`. A plan whose resolved step already selects a model or effort (separated, `--flag=value` or attached short forms, or a `model` or `model_reasoning_effort` config override in any `-c` or `--config` spelling, ignoring case and surrounding whitespace), or whose arguments have the other vendor's shape (a Codex step starts with `exec` or declares `nativeResult: "codex-jsonl"`), is refused before launch. The launcher does not identify the executable itself; the plan author supplies the matching Claude or Codex program.

Before launch, `node scripts/reviewer-defaults.mjs <absolute-plan.json>` prints the same selection as JSON; use its `reviewer` value in the reviewer prompt context.

An explicit `reviewer` bypasses the table and is used unchanged; combining it with `reviewerEffort`, `reviewerFallback`, `reviewerIndex` or `ticketEffort` is refused, since the explicit step's own arguments select the effort, and `reviewer: null` is refused rather than read as a request for the default. The caller may choose a stronger reviewer than the default when the change is riskier than its ticket label.

`node scripts/generate-reviewer-agents.mjs --check` validates the table: every reviewer is a registered definition in `.claude/reviewer-models.json` or a model in the table's `codexModels`; no row names its writer as a reviewer; primary reviewers use the other vendor and fallback reviewers share the writer's vendor; and each writer, effort and tier appears once. The distinct-route check still applies to the resolved reviewer.
