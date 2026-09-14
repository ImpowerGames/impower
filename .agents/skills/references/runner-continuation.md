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

The sender's peer listing omitted the destination directory. It selected the unique scratch name despite the requested directory check, so this model-driven route does not satisfy deterministic identity preflight. The receiving transcript independently establishes that the message reached the intended scratch session, but name matching cannot be shipped as an automatic adapter. The later authenticated native probe below replaces this discovery method and establishes native turn correlation for the private CLI candidate. No tokens or pipe addresses are included here.

[Channels](https://code.claude.com/docs/en/channels-reference) are another documented candidate for external events in a running CLI session. Custom channels require explicit development-channel consent and an applicable organization policy during the preview. That is not implicit authorization to change permissions or enable channels in the user's existing host. An intended Claude session with an authorized inbound route is required for the next live probe of that alternative. SDK resume alone is not evidence of that host integration.

### Authenticated native CLI candidate, 2026-09-14 UTC

A second private 2.1.270 interactive Windows probe removed model-driven peer discovery. A session-local `SessionStart` command hook captured its own exported messaging endpoint and token privately; no token was printed or committed. A separate Node sender authenticated with that token and sent a newline-delimited `user` frame with the exact `session_id`, fresh `uuid` and `msg_id`, fixed text in `message.content`, and `priority: "next"`. Authentication and own-child semantics are documented in the [inbox socket reference](https://code.claude.com/docs/en/cross-session-messaging#the-sessions-inbox-socket); the remaining frame fields were inspected in this private CLI build and are version-specific implementation evidence, not a published stable API. No sending model or name lookup was involved.

The caller selected `claude-opus-5`, high effort, `dontAsk`, an empty built-in tool set, and session-local command hooks. `SessionStart` recorded the model; normal `Stop` records reported `permission_mode: "dontAsk"` and `effort.level: "high"`. The interactive terminal independently displayed Opus 5/high and don't-ask mode. This is evidence for the task's configured model/effort and preserved permissions; incidental CLI housekeeping calls do not establish a substituted writer or reviewer. No fallback model was selected.

The documented [MessageDisplay hook](https://code.claude.com/docs/en/hooks#messagedisplay) provided native `turn_id` values, with the exact echoed marker and session identity. These are actual turn UUIDs, distinct from display-message UUIDs and API message IDs. The sender's socket close was never called acceptance; reconciliation used the separately flushed hook records.

| Milestone | Observed value |
| --- | --- |
| Originating and receiving session | `0baa2b4b-605b-4c38-bf1e-c2017c0c7c39` |
| Original ready turn | `0283cbbb-6f80-40c1-b2a4-6ccc8a1fa6c4` |
| Original normal Stop | `2026-09-14T01:38:05.395Z` |
| Idle submission identity | `a330355f-7968-4c10-b139-f86db398f421` |
| Accepted idle continuation turn | `2bde4112-7fed-420c-8472-ef28c712ef5a` |
| Exact `ACCEPTED-NATIVE-546` display | `2026-09-14T01:38:38.238Z` |
| Submission during active counting turn | `2026-09-14T01:39:47.283Z` |
| Counting turn completed | `9c1bef4b-0537-4780-8f12-55c173100346`, `2026-09-14T01:39:51.239Z` |
| Exact `QUEUED-NATIVE-546` next turn | `ff3e1043-aeef-4ba0-a292-9d9ec7e0d8f3`, `2026-09-14T01:39:52.860Z` |
| Native receiver process | PID 30816, created `2026-09-14T01:38:01Z` (display precision only) |
| SessionEnd and receiver exit | `2026-09-14T01:40:22.214Z`, `prompt_input_exit`; terminal process exited 0 and PID absent |

The active message did not interrupt the counting response: its normal Stop preceded the marker's distinct turn. This proves next-turn queueing for this no-tool live case, not every tool boundary. A frame with a deliberately different session ID produced no marker in the receiving transcript or hook log before the correctly addressed control succeeded; binary inspection independently found the identity rejection before enqueue. The sender had no session-creation or resume operation. After receiver exit its saved endpoint returned `ENOENT`; no new session was created. Private evidence is in `impower-546-native/hooks.jsonl`, per-attempt `send-*.json`, the session transcript, and the `impower-546-native-{hook,send}.mjs` scripts in the originating user's temporary directory. The endpoint capture contains a session token and is not a publication artifact.

A separate actual Escape interruption stopped an active counting response. The terminal displayed `Interrupted`; its transcript recorded `isAbortedMidStream: true` followed at `2026-09-14T01:39:14.934Z` by a generated user row containing `[Request interrupted by user]` and `interruptedMessageId` equal to the aborted assistant API message ID. No normal Stop hook fired for that turn. This gives a candidate correlated cancellation signal; absence of Stop alone is not a cancellation signal. Production still needs to prove its cancellation latch covers interruption before any assistant message, queued-message cancellation, and the dispatch race. A supervisor's own serialized cancel command does not by itself cover the terminal's Escape key.

A follow-up resumed exactly that exited scratch session by UUID to test queued cancellation, preserving its conversation and the same explicit route/settings. At `2026-09-14T01:42:10.889Z`, while another counting response was active, the sender queued identity `84d1229e-c7dd-47b7-9e69-495463635752`. Escape produced a native interrupted-user record at `01:42:21.588Z`. Nevertheless the queued marker ran automatically, with native turn `96bed27e-07f3-46bb-ae99-044e1f62e143` observed at `01:42:23.684Z`, without another terminal prompt. The transcript preserved that exact submission UUID in its next user row at `01:42:21.630Z`, parented to the interrupted-user record; attribution does not rely on the reused display marker alone. Thus this native queue survives an explicit user interruption; native queueing alone does not satisfy #545 cancellation. This is a live counterexample for the selected inbox route, not proof that every possible host integration is impossible. The resumed receiver PID 34252 subsequently exited 0 through `/exit` and was confirmed absent. The interruption transcript shape can also arise from remote cancellation or shutdown; this experiment's actual Escape input establishes its cause here.

The official peer-delivery documentation and private binary inspection also permit delivery between tool calls, so `priority: "next"` is not a universal promise of a distinct new turn. That may be serialized safely by the host, but a production receiving policy must validate cancellation, reviewed head and ownership before acting. Neither that policy nor removal of a queued message on terminal Stop was demonstrated here. Read-only inspection of 2.1.270's inbox control dispatcher found no interrupt, queued-cancel or retraction action; SDK `control_request` is not a handled inbox message type. The SDK's separate cancellation control is not evidence of attachment to this already-running interactive host.

This evidence advances the CLI candidate beyond the earlier name-based probe; it does not approve a global upgrade, claim Claude desktop support, or finish the two-host release gate. No reviewer report or correction loop ran in this probe. A durable outbox can submit once and reconcile uncertain acknowledgment without host idempotency, provided it never retries an ambiguous send. Native CLI execution may remain the reviewer transport if actual process ownership is proven; adopting acpx is not required merely because it was evaluated.

## Pinned acpx comparison

acpx 0.15.1 was installed in a private temporary prefix with install scripts disabled; the repository and user's global installation were unchanged. Its reported version was 0.15.1, and its local `codex status` returned `no-session` for this isolated worktree. No ACP reviewer or writer was started.

Package integrity: `sha512-8+5MS2QU+p7HV2KaEooNjUD/GaUfU43nPeO7iZJ1xngekCz5sA9+jxDGbHGAybMh6hjOXKKAm8GhU5N5dAK+Ew==`.

The pinned [session documentation](https://github.com/openclaw/acpx/blob/v0.15.1/docs/sessions.md) describes queue-owner helpers, a default 300-second idle lifetime, reconnect fallback to a new session, and separate strict behavior for imported sessions. The installed runtime exposes `processLifecycle` callbacks including `onBeforeSpawn`, `onSpawned`, and `onExit`. These are promising reviewer transport seams, but actual helper closure under failure has not been exercised here. No acpx-to-desktop attachment was established. Retain native reviewer execution until pinned transport conformance proves both strict resume and process accounting; do not adopt a second workflow engine from these observations.

## Verification and remaining gate

The sixteen standalone cases check real local pipe framing, fragmented and unrelated responses, string response IDs, refusal, timeout and disconnect; they also check ambiguous destination states, native marker matching, containment in both checkouts, flushed submission intent, bounded waiting, schema-conformant calls and read-only reconciliation. Successful and failed tests remove their own scratch repository after closing their local servers. They run under the existing Node tooling runner. The `scripts/**` triggers and `/scripts/` sparse input in `hook-tests.yml` already cover both new files; the conformance check is included in the 33-check inventory after integrating the parallel resumable-suite and filing-effort checks.

Native Windows has the live Codex and interactive Claude observations above. Linux and Claude desktop remain unverified. Automatic mode is not exposed by this scratch harness. Do not mark #546 or #545 complete on the basis of these results. The private Claude CLI candidate now has deterministic authenticated destination submission and native accepted-turn correlation. Next: select the intended Claude host/version, resolve the demonstrated queued-message cancellation failure and live tool-boundary policy, complete Codex cancellation/serialization and destination-state contracts, exercise each advertised platform, then prove reviewer lifetime and full bounded cross-provider acceptance before production adoption.
