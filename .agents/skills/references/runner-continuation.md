# Runner-specific originating-task continuation conformance (#546)

This is an incomplete feasibility record for #545, not an automatic review mode. Production migration in #547/#548 remains blocked until the host contracts below are demonstrated. The existing guarded launcher and reviewer reservations are unchanged. A scratch fixture is not live host evidence.

## Observed Codex desktop route

On native Windows, the installed `codex-app-tools` plugin 0.1.4 exposes a local pipe in `CODEX_APP_TOOLS_PIPE_PATH`. Inspection of its installed `server.mjs` established the four-byte little-endian JSON frame protocol and `tools/call` envelope. A separate Node process successfully enumerated the tool schema and read the originating task through this pipe. This is a version-specific private host integration, not a documented stable third-party API.

The parser follows that bridge's response envelope, which requires a numeric or string ID; ID-less notifications and null-ID errors are refused rather than treated as supported native responses. Unrelated response IDs are skipped. Only numeric `1` or canonical string `"1"` matches the probe's request; other numeric-looking strings are not coerced into its identity. The outer `tools/call` fields were verified against the installed bridge's request construction, while the committed fixture captures the dynamic tool argument schemas and read result.

`scripts/continuation-conformance.mjs codex-idle <absolute-plan.json>` is a bounded scratch probe. It targets only the task named by the inherited `CODEX_THREAD_ID`, waits at most ten minutes for the specified turn to complete, checks its destination directory and the experiment's Git head, and submits one fixed continuation message. A new user turn, interruption, failed turn, unknown state, missing pipe, or changed head blocks the probe. No model or permission override, new session, review launch, or daemon startup is performed.

The caller-authored JSON plan needs `threadId`, `turnId`, `continuationId`, `destinationCwd`, `worktree`, `head` (full SHA), and an absolute `journal` outside both the experiment worktree and the originating checkout, their shared Git directories and registered existing worktrees. The destination is the originating task's directory; the experiment worktree may be different. Run from the originating task's inherited environment. The journal uses exclusive creation and flushed append records. Keep the source files fixed while the probe runs. Existing journals are refused, including blocked experiments; inspect the retained evidence before authoring a new experiment. Failure after submission intent remains uncertain and is never retried.

Both plan directories must be in Git repositories whose checkout paths can be verified. A non-repository destination is refused with its directory named. Layouts where Git reports shared storage itself as a checkout, including the tested separate-Git-directory layout, are unsupported and refused before any journal or host call. The storage lookup is defensive in addition to the reported-worktree exclusions; in the verified ordinary layout those protections overlap.

### Live idle-turn evidence, 2026-09-13

The maintainer authorized the current Codex writer and Opus 5 review. The probe preserved the writer's current host model/effort and permission configuration by omitting overrides. The host tool did not expose exact runtime model/effort or a permission snapshot, so their preservation is request-shape evidence only.

| Milestone | Observed value |
| --- | --- |
| Originating and receiving task | `01a09c32-1b52-7a80-a4af-5a66d6b2b9aa` |
| Completed originating turn | `01a09c36-3b00-7360-9b49-19a867484bcc` |
| Continuation marker | `impower-546-idle-01a09c36-attempt1` |
| Original turn observed complete | `2026-09-13T19:26:17.904Z` |
| Submission response | `2026-09-13T19:26:18.167Z`, original task ID only |
| Accepted destination turn | `01a09c3c-13b9-70b0-8881-dc5e707c0009` |
| Accepted turn started | Unix seconds `1789327578` |
| Owned probe process | PID 31972, Windows start ticks `639249243672810129`; subsequently absent |

The writer ended its conversational turn; the separate probe sent the marker, and the same task began the receiving turn without another maintainer prompt. The first matcher incorrectly expected a `userMessage` item with `includeOutputs: false`. A subsequent read-only capture established that the continuation arrives as `functionCallOutput` from `codex_app.send_message_to_thread`, with its payload exposed by `includeOutputs: true`. The initial `delivery-uncertain` result therefore does not establish propagation delay. The journal was preserved and no submission was retried.

After correction, read-only reconciliation at `2026-09-13T19:59:56.666Z` matched the original marker in the recorded receiving turn and wrote `impower-546-idle-attempt1.jsonl.acceptance.json` separately. It used the actual originating turn ID for host attribution. The other local audit files are `impower-546-idle-attempt1.jsonl`, `impower-546-idle-acceptance.json`, and `impower-546-idle-attempt1-process.json` in the originating user's temporary directory. This later evidence supersedes the initial timing inference in the manual acceptance note. The original dispatcher used a synthetic MCP turn label, following the bridge's fallback pattern; its production semantics were not established.

The committed [host fixture](../../../scripts/codex-app-tools.fixture.json) preserves the dynamically enumerated tool schemas and the observed read-result structure, with task IDs, paths, marker and unrelated conversation data removed or substituted. It records newest-first ordering and the untruncated tool-output payload needed for matching. The adapter now passes the actual originating turn ID and requests those outputs. A later host version requires renewed conformance; this snapshot is not a stable API guarantee.

Run `scripts/continuation-conformance.mjs codex-reconcile <absolute-plan.json>` to inspect an uncertain scratch submission without resending it. The command verifies the journal's original destination, turn, marker and submission intent, then searches at most ten newest-first pages of one turn each: ten turns total. It records a matching native delivery item in an exclusively created `.acceptance.json` sidecar. A repeated recording attempt refuses with `EEXIST`; inspect the retained sidecar rather than treating that refusal as evidence of non-delivery. Unknown ordering, mismatched identity, truncated content, missing evidence or an exhausted read bound remains unresolved. This is bounded experiment reconciliation, not a general delivery retry or duplicate-suppression service.

This demonstrates idle task wakeup, not the complete review-to-adjudication contract. No reviewer or report validation was part of the probe. A bounded read-only reconciliation command is available, but this does not establish a durable production acceptance API. In particular:

- The host send schema has no documented idempotency or conditional expected-turn argument. Inspection and submission are not atomic; a new turn or cancellation in that interval is an unresolved production race.
- The destination must now be inside a Git repository for journal containment checks, but that repository's identity, branch and head are not bound to the continuation. Only the destination directory is compared with the host, and the head guard covers the separate experiment worktree. Production needs an explicit binding between the continuation, its reviewed worktree and the state the receiving writer may act on.
- The immediate response returns a task ID, not an accepted turn ID. Delayed acceptance, disconnect, restart, pagination, duplicate and out-of-order delivery require further live host verification and reconciliation design.
- Marker reuse across separate journals is not rejected, and acceptance has no independent timestamp predicate. Reusing a marker can invalidate the evidence; production requires durable continuation identity and ordering. Reconciliation checks newest-first page metadata, while the idle probe relies on the ordering observed in this host version.
- Active-turn queue behavior is covered only by fixtures that wait for idle; native queueing is not demonstrated. Reconnect and host restart are untested.
- Pipe lifetime and authorization after host restart are unverified. The private protocol can change with an app update.

The installed standalone Codex CLI 0.154.0 also offers `app-server proxy` and `app-server daemon version`. Both failed to connect to the default control socket with Windows OS error 10050. That specific route was unavailable; it does not invalidate the separately demonstrated app-tools pipe route. The version of the app's internally bundled server was not established from this CLI version.

## Claude host observations

The installed native Windows Claude Code version is 2.1.220. Its help supports `--resume` and streaming input, but those do not establish delivery into the existing interactive host. No replacement headless writer was used as a substitute for the intended receiving host.

The official [cross-session messaging documentation](https://code.claude.com/docs/en/cross-session-messaging) requires at least 2.1.234 for native Windows and 2.1.224 for Linux. It describes agent tools for messaging sessions; an external supervisor's submission, acknowledgment, and deduplication contracts still need proof. A newer package (2.1.270) was installed in a private temporary prefix, leaving the user's CLI unchanged, and exercised in an actual interactive terminal session.

### Live interactive-session evidence, 2026-09-13

The scratch receiver ran `claude-opus-5`, high effort, `dontAsk`, with no tools. After it answered `READY-546` and became idle, a separate bounded Opus 5 sender used only `ListAgents` and `SendMessage` to send a fixed marker. The same interactive receiver answered `ACCEPTED-546`, with no terminal input to start that second turn. Both processes subsequently exited. This was a harmless messaging probe, not a reviewer run or a validated review result.

| Milestone | Observed value |
| --- | --- |
| Original and receiving session | `1b56538f-76cd-43c3-a57b-1e42ce1ce4fb` |
| Initial ready response | `2026-09-13T19:32:33.011Z` |
| Sender session | `0212838e-142d-4fea-a708-9c375fdde2b7` |
| Host send receipt | `08a11871-2713-4e9b-88d8-edce90e945e1` |
| Received marker | `impower-546-claude-idle-attempt1` |
| Receiving user-message UUID | `2f9517b6-5e90-4cf4-91c8-cd711538bd0f` |
| Receiving response UUID | `eb09d20d-65a1-445b-bb2e-a0a8f2c994c9` |
| Receiving API message ID | `msg_011Cf1znmSDiPT8ptxdqBaA4` |
| Accepted response timestamp | `2026-09-13T19:33:15.845Z` |

These identifiers came from the two session transcripts, including the actual tool receipt, not just the sender's narrative. A distinct host turn ID was not exposed in those rows; message UUIDs are not presented as turn IDs. The terminal and transcript showed Opus 5/high for the receiver. The sender usage also reported a small CLI-internal Haiku 4.5 auxiliary call; no task model fallback was requested. Exact all-process model routing remains a conformance gap.

The sender's peer listing omitted the destination directory. It selected the unique scratch name despite the requested directory check, so this model-driven route does not satisfy deterministic identity preflight. The receiving transcript independently establishes that the message reached the intended scratch session, but name matching cannot be shipped as an automatic adapter. The native own-child socket route is documented, including per-session token authentication on Windows; deterministic submission and accepted-turn reconciliation through it remain untested. No tokens or pipe addresses are included here.

[Channels](https://code.claude.com/docs/en/channels-reference) are another documented candidate for external events in a running CLI session. Custom channels require explicit development-channel consent and an applicable organization policy during the preview. That is not implicit authorization to change permissions or enable channels in the user's existing host. An intended Claude session with an authorized inbound route is required for the next live probe of that alternative. SDK resume alone is not evidence of that host integration.

## Pinned acpx comparison

acpx 0.15.1 was installed in a private temporary prefix with install scripts disabled; the repository and user's global installation were unchanged. Its reported version was 0.15.1, and its local `codex status` returned `no-session` for this isolated worktree. No ACP reviewer or writer was started.

Package integrity: `sha512-8+5MS2QU+p7HV2KaEooNjUD/GaUfU43nPeO7iZJ1xngekCz5sA9+jxDGbHGAybMh6hjOXKKAm8GhU5N5dAK+Ew==`.

The pinned [session documentation](https://github.com/openclaw/acpx/blob/v0.15.1/docs/sessions.md) describes queue-owner helpers, a default 300-second idle lifetime, reconnect fallback to a new session, and separate strict behavior for imported sessions. The installed runtime exposes `processLifecycle` callbacks including `onBeforeSpawn`, `onSpawned`, and `onExit`. These are promising reviewer transport seams, but actual helper closure under failure has not been exercised here. No acpx-to-desktop attachment was established. Retain native reviewer execution until pinned transport conformance proves both strict resume and process accounting; do not adopt a second workflow engine from these observations.

## Verification and remaining gate

The sixteen standalone cases check real local pipe framing, fragmented and unrelated responses, string request IDs, refusal, timeout and disconnect; they also check ambiguous destination states, native marker matching, containment in both checkouts, flushed submission intent, bounded waiting, schema-conformant calls and read-only reconciliation. Successful and failed tests remove their own scratch repository after closing their local servers. They run under the existing Node tooling runner. The `scripts/**` triggers and `/scripts/` sparse input in `hook-tests.yml` already cover both new files; the expected inventory increases from 30 to 31.

Native Windows has the live Codex and interactive Claude observations above. Linux and Claude desktop remain unverified. Automatic mode is not exposed by this scratch harness. Do not mark #546 or #545 complete on the basis of these results. Next: establish deterministic Claude identity and acknowledgment, exercise each intended host/platform, resolve atomic cancellation and uncertain-acceptance contracts, then prove reviewer lifetime and full bounded cross-provider acceptance before building the production supervisor.
