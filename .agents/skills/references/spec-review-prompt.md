# Spec reviewer prompt template

All commands run from the worktree root unless stated otherwise.

The prompt builder (`node scripts/build-review-prompt.mjs <absolute-context.json> <absolute-prompt.txt>`, with `target: "issue"` in the context) fills the template block below and inserts, where PROCEDURE stands, the lens block of every lens the context's `lens` names. It refuses a missing or edited snapshot, a snapshot of another issue or ticket set, an unknown lens, and a nonconcrete or identical model route before any reviewer launches. Token multiplicities of the template and of each lens block are pinned in the builder; change a block and its counts together, then run the prompt-builder and portability checks. Keep every other blockquote outside the markers, and keep a dollar sign followed by a digit out of this file.

## Template

<!-- spec-review-prompt:start -->
> The writer model is `WRITER`; the reviewer model is `REVIEWER`. Review using these configured models.
>
> You are reviewing the design of feature #N in the Impower monorepo before any of it is implemented: round ROUND on the parent ticket and its slice tickets (SLICES). The bodies under review are frozen in the snapshot file `SNAPSHOT`, whose digest is DIGEST; read the ticket bodies from that file, not from the live issues, which may have been edited since. The code the design relies on is the git worktree at `WORKTREE`, checked out at commit HEAD; read files from there, not from the main checkout, and cite them as `file:line` at that commit. Confirm that HEAD is still checked out before reviewing and before posting; a changed head aborts the attempt. Your lens is \<LENS\>. PROCEDURE
>
> A finding is accepted only when it states one of: (a) a fact about the existing code, with a `file:line` at the checked-out commit; (b) a concrete scenario the tickets do not cover or contradict themselves on, quoting the ticket text; (c) a documented comparison with a named peer system and its source. Anything else is rejected at adjudication with that reason, so anchor every finding before you write it down. A finding that adds capability is a proposed follow-up ticket with a title, never a change to the design, unless you show that the current design forecloses it later, in which case it is a blocking finding. PREVIOUS Record your complete independent first pass in a private file before reading any other current-round review report; prior-round reports remain available for checking corrections. For each finding give: blocking or non-blocking; the ticket number with the quoted text, or the `file:line`; the anchor kind (a, b or c); and the scenario or evidence. Separately label unverified concerns and gaps you could not anchor, stating what evidence is missing; do not present them as findings. Do not pad with non-findings. Do not edit, create, or delete any file inside the repo tree, and do not edit any issue. Put every file you write under your own subdirectory `REVDIR`, never the writer's private directory directly and never a directory that already has files in it; a destructive experiment runs in a scratch repository there, with `pwd` printed in the same command as any destructive call. Before running vitest as a probe, check for a vitest process already running and wait for it to exit; the machine allows only one run at a time.
>
> When your review is done, post it as a comment on issue #N: write the full findings to a markdown file under `REVDIR` (never inside the repo), using an editor tool rather than a heredoc, starting with the heading `### Spec review — <LENS> (<MODEL>)`, where MODEL is the configured reviewer model. Include round ROUND and snapshot digest DIGEST in the comment. Then run `gh issue comment N --body-file <that file>`. Never pass `--body @-` — gh takes it as a literal string and posts a broken comment. If you have no findings, still post the comment with the single line "No findings through this lens." so the coverage is recorded. Confirm the comment landed by listing the issue's comments with `gh api repos/ImpowerGames/impower/issues/N/comments --paginate --jq '.[] | [.id, (.body | split("\n")[0])] | @tsv'` and finding your heading among them.
>
> Whether or not the comment lands, return your full findings as your final report — the same markdown, in full. If you cannot post at all (no `gh` on this machine, an auth failure, a denied permission), do not try to work around it and do not summarise: say in one line that you could not post and why, then return the whole report. The writer will post it for you.
<!-- spec-review-prompt:end -->

## Lens procedures

The builder inserts one block per named lens, in the order named. `undirected` stands alone; every other lens may combine with the others its skill assigns.

<!-- spec-lens:undirected:start -->
> You have no assigned lens: examine the whole design however you see fit, against the code and against an author's use of it, and report anything wrong with it that you can anchor.
<!-- spec-lens:undirected:end -->

<!-- spec-lens:feasibility:start -->
> Trace every claim in the Implementation plan of the parent and of each slice to the code it relies on. Name each hook, seam, function or package the plan assumes that does not exist at this commit; each collision with an open ticket or branch (`gh issue list --state open`, `git branch -r`); and each step whose named package is wrong for the work it describes. A claim that names a `file:line` is checked at that line; a claim with no location is traced to where the code actually is, and reported when it is nowhere.
<!-- spec-lens:feasibility:end -->

<!-- spec-lens:slicing:start -->
> Check that every slice ships and is testable on its own: name each acceptance criterion a reviewer could not check without a later slice, and each pair of slices whose dependency order is wrong or missing. For every acceptance criterion of the parent and the slices, name the seam a reviewer would check it at (a test file and what it proves, a driver command and what it shows, a measurement and how it is taken) and report each criterion that names none or names one that cannot observe what it claims.
<!-- spec-lens:slicing:end -->

<!-- spec-lens:performance:start -->
> The design touches the compile, typing or render path. Check the plan against the measurements it cites: name each budget or number with no method to take it, each measurement the cited method cannot produce, and each step that adds work to a per-keystroke, per-frame or per-compile path without saying where its cost lands. The measurement method this repository uses is in `WORKTREE/.agents/skills/drive-web-editor/references/performance.md`; report a plan that cites no budget for a path that has one.
<!-- spec-lens:performance:end -->

<!-- spec-lens:language:start -->
> The design changes what an author types. Write eight to ten realistic scripts against the proposed syntax, in a file under `REVDIR`: the first thing a beginner would type, the everyday case, and the common mistakes (a missing keyword, a misspelled option, a value of the wrong kind, the old spelling of something the design renames). Ground each script in the current grammar under `WORKTREE/definitions/yaml/` and the guide chapters under `WORKTREE/packages/sparkdown/docs/guide/`, and compare the syntax with the peer systems named in `WORKTREE/.agents/skills/file-feature/references/prior-art.md`. Report every place the syntax is ambiguous, verbose, inconsistent with an existing Sparkdown convention, or leaves the author with no diagnostic or an unhelpful one, quoting the script and the ticket text that decides it or fails to.
<!-- spec-lens:language:end -->

<!-- spec-lens:interface:start -->
> The design adds or changes something in the web editor or the extension. Nothing is built yet, so walk through the tasks an author would perform using the flow the tickets describe. First run `node WORKTREE/.agents/skills/review-spec-experience/interface-exercise.mjs check SNAPSHOT`: it lists each declared interface element and the items it lacks among location, trigger, states (empty, loading, error, success) and failure view; for an element the tickets describe only in prose, add `--element "<name>"` for each and judge the four items yourself against the prose. An element missing any of the four makes the design not reviewable: report it as such, with that list, and stop the exercise there. Otherwise run `node WORKTREE/.agents/skills/review-spec-experience/interface-exercise.mjs record --element "<name>"` and fill the record for the four required tasks: first use, everyday repeated use, recovering from a mistake, and undoing or removing what the feature added. Each step holds what the author sees, what the author does, and what the tickets leave unspecified; every entry in the third column is a finding, and so is a step that conflicts with how the existing editor works, which you check by reading its source under `WORKTREE/impower-dev/` and, when your launch method permits, by opening the running editor. Post the filled record with your report.
<!-- spec-lens:interface:end -->

<!-- spec-lens:player:start -->
> The design changes what plays in the player or the preview. Enumerate the scenario table and report each scenario the tickets do not decide, quoting the text that comes closest: timing (when it starts, how long it lasts, what ends it); interruption by the next line, a choice or a scene change; scrub-driven preview versus timed play; a missing or failed asset; a script edit while the preview is showing it; checkpoint restore; save and load; and two instances running at once.
<!-- spec-lens:player:end -->
