# #1306 — incomplete reproduction checkpoint

Paused at the maintainer's request on 2026-10-04. This branch contains reproduction tests only; it does not implement the fix and must not be merged as a resolution.

Branch: `codex/fix/1306-multiline-assignment-values`.
Implementation/test base: `d555d4335cf634781ea2e95a901cd8c2f899618a`.

## Preserved evidence

- `packages/sparkdown/src/tests/compiler/MultilineAssignment1306.test.ts` contains all 31 cases and the inline inputs. The complete `native_integer_spills.luau` input and official-parser CJS/WASM/manifest are already vendored in the repository.
- `before.sd` is the exact authored editor reproduction, copied from the inspected local fixture. It contains no credentials or private browser state.
- The last bounded test run on the base reported **26 passed, 5 failed**. The four historical examples work in both the current engine and actual ProgramStory execution. Four failures are false diagnostics in the eight-call LF/CRLF cases on both engines; values, call order and call count are correct. The fifth is the complete `native_integer_spills.luau` diagnostic mismatch. Missing-value, genuine-assignment and narrative-boundary controls passed.
- Baseline editor inspection displayed `Call values 12345678:12345678:8` while reporting a false diagnostic at the line-ending equals sign. The served VS Code hover reported the false `got 'read'` error. The web diagnostic-hover operation failed with an empty protocol response; its successful screenshot-only retry lost preview text, so that retry is not proof of the output. The VS Code build exited zero but included unrelated player declaration-generation failures. Initialization and filesystem console errors were also observed. No clean-console claim is made.

## Resume next week

First read issue #1404 and the dependency status of #1374, #879, #1304, #1305 and #1387. Do not merge dependencies or rerun tests merely to reconstruct this checkpoint. Re-establish one-writer ownership of `readLuauAst.ts` with #1387 before implementation. The next action is a source-only comparison against the actual merged prerequisite commits, followed by a newly agreed bounded reproduction refresh.

After that coordination, in a checkout of the pushed branch, install repository dependencies with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and `npm ci`, then run the repository preflight. The targeted reproduction command is:

```text
node scripts/test-suite.mjs run packages/sparkdown src/tests/compiler/MultilineAssignment1306.test.ts --wait 600
```

Expect the documented failures on this checkpoint. Do not weaken assertions, remove disagreement entries, or claim a green regression. Preserve `REASSIGNMENT_NAMES` boundaries; a global removal would consume genuine assignments or narrative. Add controls for an incomplete marked anonymous-function RHS, following prose, empty if arms, and genuine assignment boundaries when implementing after the dependencies land.

For later live verification, follow the committed `drive-web-editor` and `drive-vscode-web` skills using `repro/1306/before.sd`. Both editor/player services must be launched through the supported driver. No browser profile, installed dependencies, generated build, absolute machine path, local log, or screenshot is required to reconstruct the source inputs. Dependencies and browser/build prerequisites must be installed on the resuming machine. The old local logs and screenshots remain supplementary evidence, not a substitute for the missing corrected live verification.

## Remaining gates

No production fix, green regression, filtered typecheck for a fix, corrected live evidence, independent review, or integrated comparison run has completed for this ticket. Zero review rounds have run; the complete initial review and any correction rounds remain. The PR stays draft. #1404 still owns the final integrated syntax/tree/official-parser comparison and preservation of the two intentional #1309 integer limitations.
