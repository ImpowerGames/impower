# Tracker cutover runbook

This runbook moves the internal tickets and the pull request conversations from the public repository `ImpowerGames/impower` to the private repository `ImpowerGames/impower-internal`, and leaves the public repository in its final state (Feature ImpowerGames/impower#1961, Task ImpowerGames/impower#1967). The internal repository's README is the copy to run. `scripts/tracker-cutover-runbook.md` in the code repository holds the same text so it can be reviewed with the tools.

Run it line by line in Git Bash. Each step gives the commands, what they print when things are right, and where to stop. **Stop** means: do not run the next command; report what you saw to the maintainer and wait. Every tool here is resumable: after a crash, a refusal or Ctrl+C, rerun the same command and it carries on from its journal.

Rules for the whole window:

- Tickets are read through `gh issue -R` and REST (`gh api`), never through `gh api graphql`.
- The attempt directory holds snapshots, journals and reports with the text of every ticket. Keep it outside any Git work tree and never commit or upload it.
- Nothing in the window is posted on a public pull request.

## Settings for every shell

Open a new Git Bash shell for the window and set these first. `ATTEMPT` is a new, empty directory that no earlier attempt used.

```sh
CODE=C:/Users/Brode/Documents/GitHub/impower      # the main checkout
ATTEMPT=C:/Users/Brode/AppData/Local/Temp/claude/cutover-$(date -u +%Y%m%d)
INTERNAL="$ATTEMPT/internal-clone"
mkdir "$ATTEMPT" && echo "attempt directory: $ATTEMPT"
git -C "$CODE" fetch origin main && git -C "$CODE" status -sb | head -1
git -C "$CODE" rev-parse HEAD origin/main
git -C "$ATTEMPT" rev-parse --is-inside-work-tree 2>&1 | tail -1
```

Expected: the status line is `## main...origin/main` with nothing ahead or behind, both hashes are the same, and the last line is a `fatal: not a git repository` message. **Stop** if the checkout is not on an up-to-date main or the attempt directory is inside a work tree. Run `git -C "$CODE" pull --ff-only` if main is behind, and repeat.

`node .agents/repos.mjs tickets` (from `$CODE`) prints `ImpowerGames/impower` until step 6 and `ImpowerGames/impower-internal` after it.

## Durations

At the default pacing (4,500 requests an hour; writes at 60 a minute and 450 an hour), measured by the migration tool's dry runs on 2026-10-16 and 2026-10-17:

| Part | Work | Time |
| --- | --- | --- |
| Transfer | about 1,263 issues, 3 writes for a closed one and 2 for an open one | about 7.5 hours |
| Restore | the links and Project values the transfer dropped | up to 1.5 hours |
| Rewrite | about 5,600 gate renders, then the rewritten texts | about 0.8 hours of renders plus 3.8 hours of writes |
| Verify | about 3,700 renders | about 0.8 hours |
| Archive | 2,021 reads for 714 pull requests in the 2026-10-17 dry run | about 0.5 hours |
| Scrub | the same reads, then for each of about 7,000 comments (6,946 issue comments and 42 review comments on 2026-10-17) a read and a deletion | about 15.5 hours at 450 deletions an hour, or about 3.5 hours if deletions are not limited as writes (see step 4) |

The migration alone takes at least 11 to 13 hours unless `--writes-per-hour` is raised. Restore and rewrite each wait 120 seconds after the last transfer before they start. GitHub's secondary limit on the Markdown endpoint can pause a paced run; the tools wait and retry, and print a `rate limited, retrying` line when they do.

## 1. The internal repository

Most of this step was done before the window, under #1967's tooling pull request: `main` holds this README, `.gitattributes` and the internal templates and is the default branch; the 24 labels and 7 milestones exist by name; the `I-` autolink is configured. Check each, then turn off the Project automations.

```sh
gh api repos/ImpowerGames/impower-internal --jq '{private, has_issues, has_wiki, has_discussions, default_branch}'
```

Expected: `{"default_branch":"main","has_discussions":false,"has_issues":true,"has_wiki":false,"private":true}`.

```sh
diff <(gh api --paginate 'repos/ImpowerGames/impower/labels?per_page=100' --jq '.[] | [.name, .color, .description] | @tsv' | sort) \
     <(gh api --paginate 'repos/ImpowerGames/impower-internal/labels?per_page=100' --jq '.[] | [.name, .color, .description] | @tsv' | sort)
```

Expected: only lines starting `>`, for GitHub's default labels the internal repository was created with (`bug`, `duplicate`, `enhancement`, `good first issue`, `help wanted`). A line starting `<` is a public label missing or different on the internal repository: **stop**.

```sh
diff <(gh api 'repos/ImpowerGames/impower/milestones?state=all&per_page=100' --jq '.[] | [.title, .state, .description] | @tsv' | sort) \
     <(gh api 'repos/ImpowerGames/impower-internal/milestones?state=all&per_page=100' --jq '.[] | [.title, .state, .description] | @tsv' | sort)
```

Expected: no output. **Stop** on any difference.

```sh
cd "$CODE" && node .agents/templates/templates.test.mjs | tail -1
gh api repos/ImpowerGames/impower/autolinks --jq '.[] | "\(.key_prefix) \(.url_template) \(.is_alphanumeric)"'
```

Expected: `ok: ImpowerGames/impower-internal serves the same Bug, Feature and Task templates`, then `I- https://github.com/ImpowerGames/impower-internal/issues/<num> false`. **Stop** on a `SKIP` or a different autolink.

The migration's first new number follows the highest number the internal repository has used. Rehearsals and probes used 1 to 38 and those issues are deleted:

```sh
for n in 38 39 40; do printf '%s ' $n; gh api repos/ImpowerGames/impower-internal/issues/$n --jq .number 2>&1 | grep -o 'HTTP [0-9]*' ; done
```

Expected: `38 HTTP 410`, `39 HTTP 404`, `40 HTTP 404`, so the first migrated issue becomes number 39. If 39 answers anything other than 404, find the first 404 above it and use that number where this runbook says 39.

Turn off the Project automations, which would otherwise move or archive items as issues are reopened, transferred and closed. For each of Projects 1, 5, 6 and 8, open `https://github.com/orgs/ImpowerGames/projects/<N>/workflows`, write every workflow that is on into `$ATTEMPT/project-workflows.md` (one line per project and workflow), then turn each one off.

```sh
cat "$ATTEMPT/project-workflows.md"
```

Expected: one line for each workflow you turned off. Step 8 turns exactly these back on.

## 2. Quiet

The window starts only when nothing else writes to either repository.

1. One hour ahead, tell the coordinator of every running orchestration (at the time of writing, `ORCH #1904: luau grammar cannot read`) that the window starts, and ask it to hold its writers. At the start, confirm each one's writers are idle or finished.
2. No orchestration is in flight, including the one that filed this work: once the switch flips, a coordinator's commands on the public tracker are refused by design.
3. The live pull requests are merged or closed. The stale `codex/*` draft pull requests stay open; the migration rewrites their closing lines.

```sh
gh api --paginate 'repos/ImpowerGames/impower/pulls?state=open&per_page=100' --jq '.[] | "\(.number) draft=\(.draft) \(.head.ref)"' | grep -v ' draft=true codex/'
git ls-remote https://github.com/ImpowerGames/impower 'refs/heads/orchestrate-state/*' | tee "$ATTEMPT/state-branches-before.txt"
gh api rate_limit --jq '.resources.core | "\(.remaining) of \(.limit) left"'
```

Expected: the first command prints nothing; the second lists the public state branches of earlier runs, kept for step 8's comparison; the third shows at least 4,500 requests left. **Stop** if any pull request is listed, and merge or close it first.

## 3. Migration

Run from the main checkout. Each mode runs with `--dry-run` first; read its output before running it for real.

```sh
cd "$CODE"
node scripts/migrate-tracker.mjs --snapshot "$ATTEMPT/migration" --dry-run
```

Expected: JSON with `"keep": 35` and `keptNumbers` 25-27, 36-42, 44, 45, 55, 60, 65, 66, 69-71, 73, 76, 144-146, 152, 154, 155, 167-171 and 173-175 (the outsider-filed issues, which stay public); `migrate` about 1,263 plus whatever was filed since 2026-10-17; `labels` 24; `milestones` 7; and the transfer, rewrite and verify estimates. **Stop** if `keep` is not 35 or the kept numbers differ.

```sh
node scripts/migrate-tracker.mjs --snapshot "$ATTEMPT/migration"
node scripts/migrate-tracker.mjs --transfer --dir "$ATTEMPT/migration" --dry-run
```

Expected: the snapshot prints the same counts and names `$ATTEMPT/migration/snapshot.json`; the transfer dry run lists every issue as pending, `finished: 0`, and its first and last old numbers.

```sh
node scripts/migrate-tracker.mjs --transfer --dir "$ATTEMPT/migration" 2> "$ATTEMPT/transfer.log"
tail -3 "$ATTEMPT/transfer.log"
head -c 300 "$ATTEMPT/migration/journal.jsonl"
```

Expected: about 7.5 hours; the output ends with `"pending": 0`. The log's lines read `ImpowerGames/impower#<old> -> ImpowerGames/impower-internal#<new>`, and the journal's first `transferred` record has `"new": 39`. After any error, rerun the same command: it resumes at the issue that failed. **Stop** if the same issue fails twice.

```sh
node scripts/migrate-tracker.mjs --restore --dir "$ATTEMPT/migration" --dry-run
node scripts/migrate-tracker.mjs --restore --dir "$ATTEMPT/migration" 2> "$ATTEMPT/restore.log"
```

Expected: the dry run says what it would re-apply (types, sub-issue links, dependencies, Project items and field values); the run applies it and names anything it cannot restore. **Stop** if it names something it cannot restore, and decide with the maintainer.

```sh
node scripts/migrate-tracker.mjs --rewrite --dir "$ATTEMPT/migration" --dry-run
node scripts/migrate-tracker.mjs --rewrite --dir "$ATTEMPT/migration" 2> "$ATTEMPT/rewrite.log"
cat "$ATTEMPT/migration/left-as-transferred.json"
```

Expected: the rewrite sets each migrated text with references to its original with the references mapped, rewrites the closing lines of the open pull requests (the `codex/*` drafts), and writes `left-as-transferred.json`, the texts it could not read consistently and left as the transfer made them. It was empty on the 2026-10-17 corpus; texts filed or edited since may appear.

```sh
node scripts/migrate-tracker.mjs --map --dir "$ATTEMPT/migration" --dry-run
node scripts/migrate-tracker.mjs --map --dir "$ATTEMPT/migration"
```

Expected: `entries` equal to the snapshot's `migrate`, and `remote: "ImpowerGames/impower-internal:migration/issue-map.json"`, written and read back.

```sh
node scripts/migrate-tracker.mjs --verify --dir "$ATTEMPT/migration"; echo "exit $?"
node -e 'console.log(JSON.stringify(require(process.argv[1]).filter((d) => !String(d.field).startsWith("left as transferred"))))' "$ATTEMPT/migration/verify-report.json"
```

Expected: `"passed": true` and `exit 0`; or, when `left-as-transferred.json` is not empty, `exit 1` with only `left as transferred` differences, in which case the second command prints `[]`. The maintainer then reads each listed text on the internal repository by hand and records the result in `$ATTEMPT/left-as-transferred-read.md`. **Stop** on any other difference: verify also checks that the public issue list is exactly the 35 kept issues and that every open pull request's computed closing references point at the internal repository.

Read the new numbers this runbook needs from the map:

```sh
MAP="$ATTEMPT/migration/issue-map.json"
node -e "const m = require(process.argv[1]); for (const old of [510, 1961, 1967]) console.log(old, '->', m.issues.find((e) => e.old === old)?.new)" "$MAP"
```

Write them down: `INBOX` is the new number of 510, `FEATURE` of 1961 and `TASK` of 1967.

## 4. Archive and scrub the pull request conversations

The archive goes into a clone of the internal repository, whose `.gitattributes` stores `archive/**` byte for byte. The scrub deletes nothing on a pull request until its archive on the internal repository's default branch, as pushed, holds every comment still on it with the same text.

```sh
git clone --quiet https://github.com/ImpowerGames/impower-internal.git "$INTERNAL"
git -C "$INTERNAL" check-attr text -- archive/pull-requests/1.md
cd "$CODE"
node scripts/scrub-pull-requests.mjs --archive "$INTERNAL" --dir "$ATTEMPT/pull-requests" --dry-run 2> "$ATTEMPT/archive-dry-run.log"
```

Expected: `archive/pull-requests/1.md: text: unset`, then JSON with `pullRequests` (every pull request: 714 on 2026-10-17, plus those opened since), `written` equal to it, `failed: []`, `comments` about 7,000 (6,946 on 2026-10-17), `reviewComments` about 42 and `reviewsWithSummary` about 41.

```sh
node scripts/scrub-pull-requests.mjs --archive "$INTERNAL" --dir "$ATTEMPT/pull-requests" 2> "$ATTEMPT/archive.log"; echo "exit $?"
ls "$INTERNAL/archive/pull-requests" | wc -l
```

Expected: `exit 0`, `failed: []`, and as many files as `pullRequests`. A pull request in `failed` changed while it was read; rerun the command, which reads only what is new. **Stop** if the same pull request fails twice.

```sh
git -C "$INTERNAL" add archive/pull-requests
git -C "$INTERNAL" commit --quiet -m "Archive the pull request conversations of ImpowerGames/impower"
git -C "$INTERNAL" push --quiet origin HEAD:main
git -C "$INTERNAL" status -sb | head -1
node scripts/scrub-pull-requests.mjs --scrub "$INTERNAL" --dir "$ATTEMPT/pull-requests" --dry-run 2> "$ATTEMPT/scrub-dry-run.log"; echo "exit $?"
```

Expected: the status line is `## main...origin/main`; the dry run exits 0 with `refused: []`, `deleted.comments` and `deleted.reviewComments` equal to the archive's counts, `reviewsWithSummary` (see below) and `estimateHours`. **Stop** on any refusal: a refused pull request names why, and the fix is `--archive --only <numbers>`, commit, push and the dry run again. The same fix applies after the real scrub, when a pull request gained or changed a comment partway through. A rerun of `--archive` never drops a comment its earlier file holds: a comment no longer on the pull request is carried into the new file and listed under `Comments kept after deletion`, and the run reports the pull request under `carried`.

Pacing the deletions: GitHub limits content-creating requests to 80 a minute and 500 an hour and does not say whether a deletion is one. The default treats a deletion as a write (450 an hour, about 15.5 hours). To try the faster pace, start with `--writes-per-hour 3000`: if the log shows more than one `rate limited, retrying` line in ten minutes, press Ctrl+C and rerun without it.

```sh
node scripts/scrub-pull-requests.mjs --scrub "$INTERNAL" --dir "$ATTEMPT/pull-requests" 2> "$ATTEMPT/scrub.log"; echo "exit $?"
node scripts/scrub-pull-requests.mjs --scrub "$INTERNAL" --dir "$ATTEMPT/pull-requests" 2> "$ATTEMPT/scrub-check.log"; echo "exit $?"
```

Expected: the first run exits 0 with `refused: []` and `failed: []`; it reads each pull request back with zero comments and zero review comments before journaling it finished. The second run is the check: `exit 0`, `scrubbed: 0`, `alreadyEmpty` equal to `pullRequests` and `emptyWithoutArchive: []`. A pull request in `failed` did not read back empty; rerun. Before each deletion the scrub reads the comment again and stops that pull request if its text changed since the archive. After a rate limit it waits, then reads the comment again before retrying.

Submitted reviews cannot be deleted. `reviewsWithSummary` counts the reviews whose summary text stays on the public pull requests (the Codex connector's review summaries); their text is archived, and `$ATTEMPT/pull-requests/scrub-report.json` lists them by pull request and review id. Tell the maintainer the count; hiding them is the maintainer's call.

## 5. Public labels, milestones and templates

Run these and step 6 within the same hour. The public repository keeps only its product-area labels: `app: *`, `lsp: *`, `platform: *` and `system: *`.

```sh
gh api --paginate 'repos/ImpowerGames/impower/labels?per_page=100' --jq '.[].name' | grep -Ev '^(app|lsp|platform|system): ' | tee "$ATTEMPT/labels-to-delete.txt"
```

Expected: `documentation`, `invalid`, `investigation`, `question`, `wontfix`, `workflow: ci`, `workflow: skills`, `workflow: testing` and `workflow: tickets`. **Stop** and confirm the list with the maintainer before deleting.

```sh
while IFS= read -r name; do gh label delete "$name" -R ImpowerGames/impower --yes; done < "$ATTEMPT/labels-to-delete.txt"
for n in $(gh api 'repos/ImpowerGames/impower/milestones?state=all&per_page=100' --jq '.[].number'); do gh api -X DELETE repos/ImpowerGames/impower/milestones/$n; done
gh api --paginate 'repos/ImpowerGames/impower/labels?per_page=100' --jq '.[].name' | grep -Evc '^(app|lsp|platform|system): '
gh api 'repos/ImpowerGames/impower/milestones?state=all' --jq length
```

Expected: the last two commands print `0` and `0`.

The templates move in the same commit that flips the switch. In a worktree of a new branch from origin/main:

```sh
git -C "$CODE" worktree add -b feat/1967-cutover-switch ../impower.worktrees/feat/1967-cutover-switch origin/main
cd "$CODE/../impower.worktrees/feat/1967-cutover-switch"
git rm --quiet .github/ISSUE_TEMPLATE/task.md
for f in bug_report.md feature_request.md config.yml; do git mv -f .agents/templates/public/$f .github/ISSUE_TEMPLATE/$f; done
git mv -f .agents/templates/public/PULL_REQUEST_TEMPLATE.md .github/PULL_REQUEST_TEMPLATE.md
rmdir .agents/templates/public 2>/dev/null; ls .agents/templates .github/ISSUE_TEMPLATE
```

Expected: `.agents/templates` lists `issues`, `pr-report.md` and `templates.test.mjs` (no `public`), and `.github/ISSUE_TEMPLATE` lists `bug_report.md`, `config.yml` and `feature_request.md`. The template check reads `.agents/templates/public/` whenever it exists, so it must be gone.

With an editor, set `"cutover": true` and `"feedbackInbox": <INBOX>` in `.agents/repos.json`, and in `.agents/skills/references/feedback-reporting.md` remove ` (#510 on the code repository until the cutover)`. Then:

```sh
node .agents/templates/templates.test.mjs
node .claude/hooks/typed-issue-hook.test.mjs | tail -2
node .github/scripts/check-linked-issue.test.mjs | tail -2
node scripts/link-agent-skills.mjs && node scripts/check-agent-tooling.mjs --tier skills | tail -3
node .agents/skills/triage-skill-feedback/triage-skill-feedback.test.mjs | tail -1
git grep -n "#510" -- .agents AGENTS.md ':(exclude)*.test.mjs'; echo "grep exit $?"
node .agents/repos.mjs tickets; node .agents/repos.mjs inbox
```

Expected: each test ends with its pass line (`ok: ImpowerGames/impower-internal serves the same Bug, Feature and Task templates`, `all checks passed`, the linked-issue CLI line, `All 38 triage checks passed.` or the current count, and the tooling summary with 0 failed). The grep prints nothing and `grep exit 1`, then come `ImpowerGames/impower-internal` and `<INBOX>`. The grep leaves out test files because `triage-skill-feedback.test.mjs` pins inbox 510 as its fixture for the switch-off position on purpose; do not change it. This block was rehearsed on 2026-10-17 in a scratch clone at `37df96b0a` with the inbox set to a stand-in number, and every check passed. Commit, push and open the pull request with the shrunk body (one summary paragraph and `Part of ImpowerGames/impower-internal#<TASK>` with `No linked issue.`), titled `feat(github): flip the tracker cutover switch (I-<TASK>)`, as a draft; post its PR report on internal `<TASK>`. It is the only pull request of the window that changes the code repository, and the maintainer merges it.

## 6. The switch

The maintainer reviews and merges the pull request from step 5 within the hour of the label and milestone deletions. Then:

```sh
cd "$CODE" && git pull --ff-only --quiet && node .agents/repos.mjs tickets
```

Expected: `ImpowerGames/impower-internal`. From here on the hooks refuse every issue and comment command on the public repository, the review pipeline posts on the internal ticket, and orchestration runs on the internal repository.

## 7. References and memory notes

The inbox number went into the repos file in step 5, which is where `AGENTS.md` and the skills read it from. The maintainers' memory notes are outside the repository. Save this script as `$ATTEMPT/rewrite-notes.mjs` with an editor; it rewrites each bare reference to a migrated ticket as `I-<new>` and leaves pull request numbers alone.

```js
// node rewrite-notes.mjs <code checkout> <issue-map.json> <notes directory> [--write]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const [code, mapFile, notes, write] = process.argv.slice(2);
const { rewriteBareRefs } = await import(pathToFileURL(path.join(code, "scripts", "migrate-tracker.mjs")).href);
const map = new Map(JSON.parse(fs.readFileSync(mapFile, "utf8")).issues.map((e) => [e.old, e.new]));
for (const name of fs.readdirSync(notes).filter((n) => n.endsWith(".md"))) {
  const file = path.join(notes, name);
  const before = fs.readFileSync(file, "utf8");
  const after = rewriteBareRefs(before, (n) => (map.has(n) ? `I-${map.get(n)}` : null));
  if (after === before) continue;
  console.log(`${name}: ${before.split("\n").length} lines, ${[...before.matchAll(/#[0-9]+/g)].length} references before`);
  if (write === "--write") fs.writeFileSync(file, after);
}
```

```sh
NOTES=C:/Users/Brode/.claude/projects/C--Users-Brode-Documents-GitHub-impower/memory
node "$ATTEMPT/rewrite-notes.mjs" "$CODE" "$MAP" "$NOTES"
node "$ATTEMPT/rewrite-notes.mjs" "$CODE" "$MAP" "$NOTES" --write
```

Expected: the first run lists the notes it would change; read two or three of them against the map before the second run writes them. Then add one note recording that tickets now live in `ImpowerGames/impower-internal` and that `I-<N>` names internal issue N.

## 8. Project automations and acceptance

Turn back on each workflow listed in `$ATTEMPT/project-workflows.md`, on `https://github.com/orgs/ImpowerGames/projects/<N>/workflows`, and confirm against the list.

Then run the Feature's acceptance checks and post the results as a comment on internal `<FEATURE>`:

1. The internal repository, in its state after the cutover:

   ```sh
   gh api repos/ImpowerGames/impower-internal --jq '{private, has_issues, has_wiki, has_discussions, default_branch}'
   gh api --paginate 'repos/ImpowerGames/impower-internal/labels?per_page=100' --jq '.[].name' | grep -Ec '^(app|lsp|platform|system|workflow): |^(documentation|invalid|investigation|question|wontfix)$'
   gh api 'repos/ImpowerGames/impower-internal/milestones?state=all&per_page=100' --jq length
   cd "$CODE" && node .agents/templates/templates.test.mjs | tail -1
   gh api repos/ImpowerGames/impower/autolinks --jq '.[] | "\(.key_prefix) \(.url_template)"'
   gh api repos/ImpowerGames/impower-internal/contents/migration/issue-map.json --jq .size
   ```

   Expected: the same settings as in step 1; `24` (the public labels step 1 copied; the public repository no longer has most of them, so step 1's diff no longer applies); `7`; `ok: ImpowerGames/impower-internal serves the same Bug, Feature and Task templates`; `I- https://github.com/ImpowerGames/impower-internal/issues/<num>`; and the map's size in bytes. Internal issue 39 is now the first migrated issue, so step 1's number probe no longer applies either.
2. The guard: `node .claude/hooks/typed-issue-hook.test.mjs` passes on main.
3. The pull request contract: a resolve-issue run on a throwaway internal Task ends with a public pull request whose body is one paragraph and the closing line, `gh api repos/ImpowerGames/impower/pulls/<P> --jq '[.comments, .review_comments]'` prints `[0,0]`, and the PR report, round state, reviewer reports and adjudication are comments on the Task. Close the pull request unmerged and the Task as not planned afterwards.
4. Orchestration: an orchestrate-issues dry run on a throwaway internal Feature puts its status comment, checkpoint decision and final report on the Feature and its state branch on the internal repository, and `git ls-remote https://github.com/ImpowerGames/impower 'refs/heads/orchestrate-state/*' | diff "$ATTEMPT/state-branches-before.txt" -` prints nothing.
5. to 7. Step 3's verify: `passed: true`, or only `left as transferred` entries the maintainer has read; it covers every snapshotted issue and its fields, the 35 public issues, no bare reference to an old number, and the open pull requests' computed closing references.
8. Step 4's check run again, after item 3's pull request: `node scripts/scrub-pull-requests.mjs --scrub "$INTERNAL" --dir "$ATTEMPT/pull-requests"` exits 0 with `refused: []`, `failed: []`, `scrubbed: 0` and `alreadyEmpty` equal to `pullRequests`, so every pull request reads back with zero comments and zero review comments. `emptyWithoutArchive` lists only the pull requests opened after step 4 (step 5's and item 3's), which never had a comment to archive. `git -C "$INTERNAL" ls-tree --name-only origin/main archive/pull-requests/ | wc -l` equals step 4's archive `pullRequests`, one file per pull request that existed then.
9. Step 5's label and milestone counts are `0` and `0`, and `https://github.com/ImpowerGames/impower/issues/new/choose` offers only the bug report and feature request with no blank issue.
10. The references: `git -C "$CODE" grep -n "#510" -- .agents AGENTS.md ':(exclude)*.test.mjs'` prints nothing (step 5 says why test files are left out), `node .agents/repos.mjs inbox` prints `<INBOX>`, and `node .github/scripts/check-linked-issue.test.mjs` passes, covering a body with `Closes ImpowerGames/impower-internal#N` passing and one with only a bare `#N` failing.

When all ten pass, close internal `<TASK>` as completed with a comment naming the attempt directory's reports, and tell the coordinators the window is over.
