# Commit and open the draft PR

All commands run from the worktree root unless stated otherwise.

## Private writer allocation

At resolve-issue preflight, before writing any artifacts, run:

```sh
node .agents/skills/resolve-issue/writer-artifacts.mjs --parent <existing-absolute-scratch-parent> --issue <N> --writer <writer-identity> --session <session-identity>
```

Keep the returned absolute `artifactDir`, `commitMessage` and `prBody` paths for the whole attempt. The allocator creates an exclusive directory, protects it for its owner and reads back `owner.json`; it refuses missing identities, linked ancestors and checkout parents. Each writer and retry allocates anew, even for the same issue and session. Use an editor to fill the returned files and put other artifacts under `artifactDir`. A shared parent scratch directory is allowed; its root filenames are not private artifacts. Allocation failure stops artifact creation. This directory already exists before a PR number is available.

Repository refusal covers Git discovery, ancestor `.git` entries and recognizable Git administration storage: Git core configuration with objects or refs, or the canonical objects/info, objects/pack, refs/heads and refs/tags layout. Generic config/objects/refs names with valid unrelated configuration remain allowed. A failed config read, including malformed ordinary config beside objects/refs, is unverifiable and stops allocation. Arbitrarily destroyed metadata cannot always be recognized; choose a scratch parent known to be outside repository storage.

## 7. Commit, push, and open a draft PR

The PR opens before the review so the reviewers have a PR to review; findings live on its [review thread](../../references/publishing.md#the-review-thread) (the PR itself while the cutover switch is off, the internal ticket once it is on), tracked next to the change they criticize, instead of dying in a session transcript. Open it as a draft and leave it a draft until `/review-pr` says otherwise.

Use the paths returned by the [initial writer allocation](../SKILL.md#0-preflight), which exists before a PR number: set `COMMIT_MESSAGE` to `commitMessage` and `PR_BODY` to `prBody`, preserving their absolute paths. Fill these files with an editor. Keep reproductions, screenshots and logs under the same `artifactDir`; remove only your own disposable files. Preserve this directory through publication and read-back. A fresh retry uses a new allocation rather than another writer's directory or a fixed per-issue name.

Look at what you are about to stage (`git status --short`). Stage deliberately, by path; `git add -A` will happily commit a screenshot, a scratch `.sd`, or a crash dump. Stage new files before running any index-based check or pushing: `git ls-files`, the check loops built on it, and CI see only what is tracked, so an unstaged new file passes locally and is absent from the pull request.

```bash
git add packages/sparkdown/src/compiler/utils/filterImage.ts packages/sparkdown/src/tests/compiler/FilterImageLayers.test.ts
git status --short
git commit -F "$COMMIT_MESSAGE"
git push -u origin fix/302-filterimage-layers
gh pr create --draft --title "fix(compiler): accumulate all matching filtered_layers (#302)" --body-file "$PR_BODY"
```

Read [shared publishing rules](../../references/publishing.md) before publication, including [the pull request body and the PR report](../../references/publishing.md#the-pull-request-body-and-the-pr-report): bodies go through `--body-file` (never `@-`), and you read every artifact back. `gh pr create` does not apply a template for you. Which body you write follows the cutover switch (`node .agents/repos.mjs tickets` prints the code repository while it is off):

- Switch off: the body follows `.github/PULL_REQUEST_TEMPLATE.md` (same headings, same order) and must contain the line `Closes #302`, the only thing that makes GitHub close the issue on merge; the `(#302)` in the title is a mention and closes nothing. Read it back with `gh pr view --json number,title,body,isDraft`, then `gh pr view --json body --jq .body | grep -i "closes #302"`.
- Switch on: the body follows `.agents/templates/public/PULL_REQUEST_TEMPLATE.md`, one summary paragraph and `Closes <tickets>#302` (with `Closes #<public>` too when the change also resolves an issue filed in the code repository), and the title ends `(I-302)`. Read it back the same way, grepping for `closes <tickets>#302`. Then post the PR report on the ticket, `gh issue comment 302 -R <tickets> --body-file "$PR_REPORT"`, with `PR_REPORT` an editor-written file under `artifactDir` that follows `.agents/templates/pr-report.md` and names the PR and its head; read it back by the id its printed URL ends in, `gh api repos/<tickets>/issues/comments/<id> --jq .body`. Post a new PR report, read back the same way, whenever you push a new head. A PR closing several tickets uses their umbrella in place of 302, as that section describes.

Where the material from the steps above goes: the summary carries the one-paragraph summary and the closing line; Motivation what broke and why, with `file:line`; Changes the fix and any alternative you rejected; Testing and verification the regression test's path with its red/green evidence, the Test Suite workflow run for the pushed head with its conclusion once it has finished (naming any failure you confirmed also fails on `origin/main`), and the before/after screenshots, embedded and uploaded as [attaching images](../../references/publishing.md#attach-images-and-videos) describes, or the measurement that replaces them; Notes for reviewers any performance cost the fix carries, repeated in the first line of the summary so it is the first thing a reviewer reads. While the switch is off those sections are the body's; once it is on they are the PR report's, and the body keeps only the summary.

---
