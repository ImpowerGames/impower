# Phase C — Intra-Block Incremental Nested-Tree Reuse: Authoritative Design

**Branch:** `dev/parser-intra-scope-incremental`
**Package:** `packages/textmate-grammar-tree/` (no grammar-definition or lowerer changes)
**Status of prior work:** Phase A/B (line-at-a-time tokenizer + persistent restorable scope stack) and C5 (cross-chunk scope nesting) are committed and byte-identical. Phase C's first attempt is stashed and broken (`git stash@{0}`).

---

## 0. The problem, in one paragraph

Today the chunk stream splits **only at pure boundaries** (`Packet.add` mints a new chunk only when `current.endsPure`). Inside an `if/for/while/choose/then/function` block the scope stack is non-empty on every line, so `endsPure` is false until the block's `end` token — **the entire block is one chunk**. Editing one line in the middle of a 40-line block therefore reparses the whole block. The committed boundedness metric measures this at **58.2× the edited line**. This parser is foundational (LSP, highlighting, formatter, screenplay preview) and the engine's headline differentiator is blazing-fast live-preview/HMR, so this is the bug Phase C eliminates — while staying **byte-identical** to a from-scratch parse (the non-negotiable contract).

---

## 1. Recommended phased path (the decision)

We ship in **two phases**, with a third deferred. This is not a hedge — each phase is a complete, shippable artifact, and the later phases compose on top of the earlier ones rather than replacing them.

### Phase C1 (SHIP NOW) — **Tokenization-Memoization (was "P3")**

Memoize the expensive matcher per source line, keyed by `(line text, entry-scope-stack hash)`. Keep **one clean forward pass** that re-assembles the tree fresh every parse. On reparse, only lines whose text **or** entry-stack changed actually re-run `grammar.match`; every other line replays its cached `GrammarToken[]` and cached resulting stack.

**Why this is the near-term winner (grounded in the cost model + both adversarial lenses):**

- **It wins the dominant cost for *every* edit position.** Parse time is dominated by the matcher (~89 ms/10 KB); tree-assembly is ~1/10 of that. Memoization drops the matcher from ~B (whole block) to ~1 line **regardless of edit position** (top, middle, or tail of the block) — the 58×→~1× win on the only cost that's expensive.
- **It is byte-identical *by construction*, not by proof.** A cold parse has an empty memo ⇒ every line is a cache miss ⇒ every line runs the exact committed matcher in the exact committed order with the exact committed persistent stack. The 174 grammar snapshots and the vscode-textmate oracle are untouched. A warm parse replays the exact tokens + exact post-line stack a miss produced ⇒ indistinguishable from re-running.
- **It structurally avoids BOTH stash failures.** No mid-block matcher resume ⇒ **no cascade-close problem**. Always-fresh assembly ⇒ **no stale child-count problem**. The two failures that killed the stash cannot occur.
- **It is the smallest, most reversible change.** Additive around ONE call site (`TextmateGrammarParse.nextChunk`'s `grammar.match`); zero changes to `ScopedRule` dispatch, `Chunk`, `Compiler`, `Packet`. Gate-able to a literal no-op (empty memo).
- **Verified path:** the snapshot/full-parse path goes `getParser().parse(source)` → `TextmateGrammarParse.advance()` → `nextChunk()` → the same `grammar.match` we wrap. Confirmed in source. So the memo sits on the exact code path the safety nets exercise.

**The one real correctness hole (must fix, identified by the correctness lens):** the matcher's per-line output is **not** purely a function of `(lineText, entryStack)`. `ScopedRule.continueLine` (lines 220–224, confirmed in source) calls `state.advance()` at the line boundary and re-evaluates `end()` against the *next* line — the ubiquitous `(?=scene|branch)` end-arm and `$`/`(?=$)` assertions peek at the following line. A naive `(lineText, entryStack)` key would admit a wrong hit when line K+1 differs. **The key must account for this** (Section 3.4). This is mechanical to fix and the fix is the gate before flipping the memo authoritative.

### Phase C2 (NEXT, once C1 is de-risked) — **Full-1× via Count-Fixup (was "P2"), layered on C1**

For the rare case where C1's O(D) fresh-assembly bites (single files >~100 KB), add intra-block **ahead-reuse** so assembly is also sub-O(D): rewind to the scope-stable split just before the edit, reparse ~one line, splice the reused ahead chunks, and **repair the spanning scopes' baked child-counts** with a single uniform delta. This needs the **deterministic cascade-close** (Section 2) and the **count-fixup pass** (Section 5).

**Why C2 is count-fixup, not global-resolution:** count-fixup is ~60 LOC, leaves the assembler's byte-identity surface untouched, preserves `Reuse`/`TreeBuffer` opacity (the actual perf win), and the spanning delta `Δ` is provably a **single scalar** uniform across all spanning frames (`CompileStack.increment` touches every open frame equally). Global-resolution (P4) rewrites the entire assembler, re-opens all 174 cold-parse snapshots, and its own fallback ladder *collapses into count-fixup anyway*. We pick the cheaper mechanism that reaches the same place.

### Phase C-deferred — **Global Nesting Resolution (was "P4")**: do not build unless C2's count-fixup proves unmaintainable across many edit shapes. It is the "right" v2 architecture but the wrong move now (Section 7).

**Composition:** the **cascade-close design (Section 2) is shared infrastructure** — C1 does not need it, but C2 does, and so would any per-line ahead-reuse. Build it as a standalone, separately-verified step so C2 (and a hypothetical P4) drop onto it. C2 also reuses C1's `stackHash`/`snapshotStack`/`restoreStack`/`stackMatches` plumbing as its `canReuseAhead` guard.

---

## 2. The DEFINITIVE cascade-close design (prerequisite for any per-line reuse; used by C2)

> **C1 does not use this.** It is documented here in full because it is the load-bearing prerequisite for C2 and must be byte-identical. Build and verify it as its own step.

### 2.1 Why it's needed

Per-line dispatch closes only the *innermost* scope on the line that consumes a physical `end`. The legacy whole-block recursive matcher closed *several* scopes from that one keyword when an enclosing scope's **zero-width** end fires immediately after (e.g. `for … do … end`: `DoBlock` consumes `end`, then `ForLoop`'s `(?<=\bend)` lookbehind pops at the same position). The stash's naive cascade — "probe every enclosing parent's `end` at the close position; pop any that match" — **over-closed**, because `end()` runs the *whole* end alternation including the consuming `(WS*)(end)\b` arm, so `FunctionDefinition`/`DoBlock` spuriously matched and got detached, spanning the whole document (broke 9 snapshots).

### 2.2 The two end-shape classes (the whole discriminator)

Every scope `end` in the grammar is exactly one of two shapes:

1. **CONSUMING end** — matches and advances past a physical token. Owners: **IfBlock, DoBlock, ChooseBlock, FunctionDefinition** (on `end`); **IfBlockCondition / ElseifBlockCondition** (on `then`); **FunctionParameters** (on `)`). **These NEVER cascade-close** — each waits for its own keyword on a later dispatch.

2. **ZERO-WIDTH end** — a lookahead `(?=…)`, lookbehind `(?<=…)`, or `$`, matching length 0. Owners: **ForLoop, WhileLoop** (`(?<=\bend)`/`$`), **RepeatLoop** (`(?=until)`), **Elseif/ElseBlock** (`(?=end|elseif|else)`), **FunctionBody** (`(?=end|scene|branch)`), **ChooseThenClause** (`(?=end)`), **all `*Condition` scopes** (`(?=do)`), **Scene/Branch** (`$`). **These cascade-close iff their zero-width end matches at the post-keyword position P.**

> Note the universal alternation shape: nearly every block end is `(?=(?:WS*\b(?:scene|branch)\b)) | ((?:WS*)(end)\b)` — a zero-width FIRST arm and a consuming SECOND arm. **A rule is consuming-classed iff ANY arm consumes.** This is the trap that broke the stash's string-shape classifier.

### 2.3 The discriminator (exact rule)

> After an inner scope closes at position `P` by a **CONSUMING** end, walk the still-open enclosing frames from innermost outward. Pop each enclosing frame whose **own end matches with length 0 at `P`** (zero-width), continuing outward, and **stop at the first enclosing frame whose end is consuming, or whose zero-width end does not match at `P`.**

This fixes both stash failures:
- **Over-close gone:** `FunctionDefinition.end` is consuming ⇒ never force-popped; it closes by consuming its own `end`. (`FunctionBody`, the genuine zero-width inner, closes *before* the keyword via the normal close path — not via cascade.)
- **Under-close gone:** `for … do … end` — `DoBlock` consumes `end` at `P`; `ForLoop`'s `(?<=\bend)` is satisfied at `P` ⇒ cascade-pop exactly once. `while` identical.

### 2.4 Implementation (deterministic, no regex re-probe of consuming arms)

Two source facts make the naive approach unsafe (both confirmed):
- **`end()` pops the stack as a side effect** (`ScopedRule.ts:312-317`) — probing must not commit a pop unless it's a real zero-width match.
- **The static gate is required** because running the full `end()` on a consuming parent can spuriously match its consuming arm at `P`.

The robust implementation uses a **static per-rule classification** plus a **non-mutating probe**:

```ts
// ScopedRule constructor — compute ONCE, statically.
// CONSUMING iff ANY top-level alternative of the end pattern consumes
// (contains a capturing group NOT inside a lookaround). Implement as the
// VERIFIED Table-1 rule-id allowlist (recommended) rather than a string-shape
// heuristic — the (?=scene|branch)|(end) alternation is exactly where a naive
// splitter misfires.
this.endIsZeroWidthOnly = ZERO_WIDTH_END_RULE_IDS.has(this.node.typeId);

// Non-mutating probe (extract the match half of end(), WITHOUT the pop):
endProbe(state, from): Matched | null {
  const top = state.stack.at(-1);
  if (top?.beginCaptures) this.endRule.matcher.backReferences = top.beginCaptures;
  const m = this.endRule.match(state, from);
  return m ? m.wrap(this.node, Wrapping.END) : null;   // NO state.stack.pop()
}
```

```ts
// ScopedRule.continueLine — cascade runs ONLY after a CONSUMING close at P.
if (endMatched && endMatched.length > 0) {
  const P = pos + endMatched.length;          // absolute, just past the consumed keyword
  while (state.stack.length > 1) {
    const parent = state.stack.at(-1)!;
    const parentRule = parent.scopedRule as ScopedRule | undefined;
    if (!parentRule || !parentRule.endIsZeroWidthOnly) break;   // consuming parent ⇒ STOP
    const probe = parentRule.endProbe(state, P);
    if (!probe || probe.length > 0) break;     // its zero-width assertion didn't hold at P
    // COMMIT: parent content-wrapper END (if open), then parent scope END, then pop.
    if (parent.contentOpened) {
      children.push(new Matched(parentRule.contentRule.node, P, 0, undefined, Wrapping.END));
    }
    children.push(probe);                      // length-0 END node
    state.stack.pop();
    // P does not advance (zero-width); continue outward.
  }
}
```

The emit order (content-wrapper END, then scope END, per cascaded frame) mirrors the single-close path exactly, so token order — and therefore suffix-buffer nesting — is identical to the legacy recursion.

### 2.5 `ZERO_WIDTH_END_RULE_IDS` (the verified allowlist)

From the grammar investigation (Table 1, both `Luau*` and `LuauSparkdown*` families): **ForLoop, WhileLoop, RepeatLoop, ElseifBlock, ElseBlock, FunctionBody, ChooseThenClause, all `*Condition` (IfBlock/Elseif/For/While conditions on their `do`/`then`-adjacent zero-width arm), Scene, Branch.** Everything else (IfBlock, DoBlock, ChooseBlock, FunctionDefinition, FunctionParameters, the `*Condition` ends that consume `then`) is consuming-classed.

> **Belt-and-suspenders (optional, recommended as a tripwire not a gate):** also set a begin-time `sharedEndGroupParent` marker on a frame opened directly inside a zero-width-end container that shares its closing keyword. Log a divergence if the runtime discriminator and the marker disagree. Promote to a hard gate only if a snapshot reveals an over-close the static gate misses. None exist in the current grammar.

---

## 3. Phase C1 — Tokenization-Memoization (the near-term build)

### 3.1 Files & the change at each

| File | Change |
|---|---|
| `grammar/classes/GrammarState.ts` | `stackHash()` (FNV-1a over each frame's `node.typeIndex` + `beginCaptures`); `snapshotStack()` / `restoreStack()` (clone for cache-value capture/replay); `stackMatches(other)` (exact compare for read-time verify). |
| `parser/LineMemo.ts` **(new)** | Per-document `Map<string, LineMemoEntry>` + the `RelToken` value shape + `rebaseTokens`/`toRelTokens` helpers + optional bounded eviction. |
| `tree/classes/TextmateGrammarParse.ts` | At the `nextChunk` matcher call site (line ~226): consult/populate the memo around `grammar.match`. Thread the shared `LineMemo` in. EOF / lookahead carve-out. |
| `tree/classes/TextmateGrammarParser.ts` | Own one `LineMemo` per parser; pass into `createParse`. (Model A — verify parser-per-document in `SparkdownDocumentRegistry`; if shared, fall back to Model B: ride the memo on the tree via a `NodeProp` like `cachedCompilerProp`.) |

**No changes to** `ScopedRule`, `Grammar.match` dispatch, `Chunk`, `Compiler`, `Packet`, `CompileStack`, grammar JSON, lowerer.

### 3.2 Data structures

```ts
// LineMemo.ts
type RelToken = [id: number, relFrom: number, relTo: number,
                 open?: number[], close?: number[]];   // from/to RELATIVE to line start

interface LineMemoEntry {
  matchLength: number;                 // length the match consumed
  tokens: RelToken[];                  // re-based on hit by adding the current pos
  exitStack: GrammarStackElement[];    // post-line stack, installed on a hit
  // (entry key carries entryHash + lineText; no need to store entryHash again)
}

class LineMemo {
  // key = `${entryHash}\u0000${lineText}`
  get(entryHash: number, lineText: string): LineMemoEntry | undefined;
  set(entryHash: number, lineText: string, e: LineMemoEntry): void;
  // optional: size cap (e.g. 4× line count) + LRU to bound a long session.
}
```

`from`/`to` are stored **relative to line start** so a hit only re-bases by adding the current `pos` — positions auto-correct after an edit shifts the line, with no explicit `slide`/`offset` of the memo. `open`/`close` arrays are **cloned on both store and rebase** (`Chunk.add`/`Compiler` may mutate them; never hand the cache's own arrays to the assembler).

### 3.3 The cache key

`key = (entryHash, lineText)`. `entryHash` is computed from the persistent `state.stack` **before** the line runs. It MUST include each frame's `beginCaptures` because `ScopedRule.end` back-references them (`endRule.matcher.backReferences = beginCaptures`), so two otherwise-identical stacks with different captures can match `end` differently.

```ts
// GrammarState.stackHash() — FNV-1a, order-sensitive, capture-sensitive
stackHash(): number {
  let h = 0x811c9dc5;
  for (const el of this.stack.stack) {
    h = fnv(h, el.node.typeIndex);
    for (const c of el.beginCaptures) h = fnvStr(h, c);
  }
  return h >>> 0;
}
```

This is well-founded because `GrammarState.reset()` clears only per-call scratch (`visited`, `_matchDepth`); `stack` persists. So the matcher's output depends only on `(state.str line, state.stack)` — **with the one exception in 3.4**.

### 3.4 Control flow at the matcher call site (with the mandatory lookahead carve-out)

```ts
// inside nextChunk(), replacing the grammar.match wrapping
const str = next(startCompensated);
const nl = str.indexOf("\n");
const lineText = nl === -1 ? str : str.slice(0, nl + 1);
const entryHash = this.state.stackHash();
const cached = this.memo.get(entryHash, lineText);

let matchTokens: GrammarToken[] | null;
let matchLength: number;

if (cached && this.state.stackMatches(cached /* its recorded entry stack */)) {
  // CACHE HIT — replay; skip the regex entirely.
  matchTokens = rebaseTokens(cached.tokens, pos);
  matchLength = cached.matchLength;
  this.state.restoreStack(cached.exitStack);     // install post-line stack
} else {
  // CACHE MISS — identical to today's committed path.
  const lenBefore = this.region.remaining();     // to detect lookahead consumption
  const match = this.grammar.match(this.state, str, next, pos - start, pos);
  if (match) { matchTokens = match.compile(); matchLength = match.length; }
  else { matchTokens = [[NodeID.unrecognized, pos, pos + 1]]; matchLength = 1; }

  // POPULATE — but NOT for context-sensitive lines (the two carve-outs):
  const reachedEof = pos + matchLength >= this.region.original.length;
  const consumedLookahead = touchedNextLine(this.state, lineText, matchLength); // see below
  if (!reachedEof && !consumedLookahead) {
    this.memo.set(entryHash, lineText, {
      matchLength,
      tokens: toRelTokens(matchTokens, pos),
      exitStack: this.state.snapshotStack(),
    });
  }
}
```

**Carve-out 1 — next-line lookahead (the FATAL-as-naive hole the correctness lens found).** `continueLine` calls `state.advance()` then re-evaluates `end()` at the line boundary (`ScopedRule.ts:220-224`, confirmed). So a line's tokenization can depend on the *next* line (the `(?=scene|branch)` end-arm, `$`). A `(lineText, entryStack)` key omits that. **Resolution: do not cache (and never serve a hit for) any line whose match consumed lookahead.** Detect it by flagging on `GrammarState` whether `advance()` was invoked during the match and whether `end()` then matched against the extended buffer (set a `state.consumedLookahead` flag in `continueLine`'s boundary block; read it after the match). These are exactly the scope-closing lines (a minority); suppressing their caching costs little.

**Carve-out 2 — EOF last line.** A line mid-document in one parse but at EOF in another keys identically but behaves differently (`closedAtEof` vs `end`-matched, no incomplete marker vs incomplete marker). **Resolution: never `memo.set` a match reaching `region.original.length`, AND force-miss the line currently at EOF on read.** One un-memoized re-match of the last line per parse — negligible.

**Read-time exact verify (belt-and-suspenders for hash collisions).** On a candidate hit, also confirm the live stack `stackMatches` the entry's recorded entry stack. A 32-bit collision then degrades to a miss (re-match), never a wrong tree. Default-on.

Everything *after* the match (the `matchLength === 0` guard, `consecutiveEmptyMatchCount`, `parsedPos = compensate(...)`, the token loop into `compiler.add`) is **unchanged**. Assembly runs over every line fresh, as today.

### 3.5 Invalidation after an edit (it's automatic)

The memo is keyed on `(entryHash, lineText)`, never on absolute position:
- Unchanged text + unchanged entry-stack ⇒ hit, wherever the edit shifted the line; relative tokens re-base correctly.
- Edited line ⇒ different `lineText` ⇒ miss ⇒ re-run + repopulate.
- Unchanged text but **changed entry-stack** (an edit above added/removed an `end`) ⇒ different `entryHash` ⇒ miss ⇒ re-run. **Depth-changing edits self-heal down the document via the entry-hash chain** — the first line whose entry-stack differs misses, produces a new exit-stack, which is the next line's entry-hash, etc. No special logic.

There are no stale entries (a dead key is simply never looked up). Optional bounded eviction caps memory; a 10 KB file is a few hundred entries.

### 3.6 Keeping assembly sub-O(D) — layer over committed pure-boundary reuse

Naively C1 re-assembles all D every keystroke (cheap coefficient, ~9 ms/10 KB — fine to ~50 KB). To stay sub-O(D) on larger files, **do not rebuild the `Compiler` from scratch** — keep the committed `cachedCompilerProp` reuse path (constructor lines 89–110 + `Compiler.reuse`), which rewinds to the behind *pure* split and stashes the ahead at the next *pure* split. That gives behind+pure-ahead chunk/tree-buffer reuse **for free and already byte-identical**. C1's memo then makes the re-tokenized middle cost ~1 line of matcher instead of ~B. This composes cleanly: the committed reuse splits only at pure boundaries (no intra-block splits, no cascade-close, no ahead-stale-counts), so C1 adds nothing that can break it.

### 3.7 Ordered implementation checklist (net after each step)

Run vitest one suite at a time, single fork, capped heap (`--pool=forks --poolOptions.forks.singleFork=true`, `NODE_OPTIONS=--max-old-space-size=2048`). "exit 0 + Worker exited unexpectedly" = OOM, not pass. `tsc` is not a gate.

| Step | Change | Net (must stay/return green) |
|---|---|---|
| **0. Baseline** | none | All nets green; record the boundedness log (~58×). `grammarSnapshot`, `vscodeGrammarSnapshot`, `incremental`, `crossChunkNesting`, `textmate-conformance`. |
| **1. State plumbing** | `GrammarState.stackHash` + `snapshotStack` + `restoreStack` + `stackMatches`. No call-site wiring. | `grammarSnapshot` byte-identical (pure addition). |
| **2. `LineMemo` + helpers** | `LineMemo.ts`, `RelToken`, `rebaseTokens`/`toRelTokens`. Unit test in isolation (store synthetic entry, rebase, assert positions + array cloning). | new `LineMemo` unit test only. |
| **3. Shadow mode** | Wire into `nextChunk`: on a would-be hit, compute cached tokens AND still run `grammar.match`, assert (debug flag) `cached === fresh` (tokens + exitStack), then use fresh. Add the lookahead flag in `continueLine`. | `grammarSnapshot` (all misses, byte-identical) + a shadow-consistency run over snapshot fixtures **and** the 14 incremental fixtures (drive `editAndReparse`, assert no shadow mismatch). This validates the key purity + the lookahead carve-out against the real grammar before trusting it. |
| **4. Authoritative** | Flip to use cached on hit, with read-time `stackMatches` verify + both carve-outs (lookahead, EOF). | full `incremental` correctness matrix (14 byte-identical) + `crossChunkNesting`. |
| **5. Own per-parser** | `LineMemo` persists across edits (Model A; or Model B via tree `NodeProp`). | re-run `incremental`; add a `missesThisParse` counter and **change the boundedness assertion to a matcher-miss count** (`misses <= 3` for the `bigThenBlock(40)` mid-line edit) — the char-span metric no longer measures the win. |
| **6. Sub-O(D) layer** | Keep the committed `cachedCompilerProp` pure-boundary reuse (don't rebuild `Compiler`). | full sweep: `grammarSnapshot`, `vscodeGrammarSnapshot`, `incremental`, `crossChunkNesting`, `textmate-conformance` — all byte-identical. |
| **7. Live verify** | none | Per memory `feedback_live_verify_after_feature`: edit a dialogue line inside a long block in the running editor (`window.__preview`), confirm correct highlighting + responsive HMR — not just vitest-green. |

**Suggested commits (user commits):**
1. `feat(textmate): GrammarState.stackHash + stack snapshot/restore/match (inert)`
2. `feat(textmate): LineMemo per-line matcher cache (struct + tests)`
3. `feat(textmate): shadow-mode memo consistency check at matcher call site`
4. `feat(textmate): authoritative per-line memoization with exact read-verify + lookahead/EOF carve-outs`
5. `perf(textmate): own LineMemo per parser; boundedness = matcher-miss count`
6. `perf(textmate): layer memo over committed pure-boundary reuse (sub-O(D) assembly)`

### 3.8 Phase C1 perf expectation

| Doc size | Matcher (memo) | Assembly | Total/keystroke |
|---|---|---|---|
| 10 KB | ~1 line (sub-ms) | ~9 ms (fresh) or O(rebuilt chunks) with step 6 | **~9–10 ms** (sub-frame) |
| 50 KB | ~1 line | ~45 ms naive / much less with step 6 | usable |
| 100 KB | ~1 line | ~90 ms naive / much less with step 6 | borderline naive; step 6 makes it fine |

The matcher cost is **flat at ~1 line regardless of D** — the whole point. This beats committed (A, ~B matcher = the 58× bug) for any VN file where the edited block is a meaningful fraction.

---

## 4. Phase C2 — Full-1× via Count-Fixup (the long-term build, deferred until C1 ships)

C2 adds intra-block **ahead-reuse** so assembly is also ~1 line, not O(D). It builds on the cascade-close (Section 2) and reuses the stash's *plumbing* (per-line `forceSplit`, snapshot/restore, `canReuseAhead`) — the stash's cascade and its missing fixup are what C2 replaces/adds.

### 4.1 Mechanism

1. **Mint a scope-stable split after every line** (`Packet.forceSplit(grammarStack, hash)`): an empty `isSplitPoint` chunk that `inherit`s the open scopes and carries the post-line `grammarStack` snapshot + `entryStackHash`. `Packet.add` starts a new chunk after any split. Because `inherit` sets `inheritedOpenScopes`, every intra-block chunk is emitted node-by-node (`canConvertToTreeBuffer` already excludes them) ⇒ close records stay addressable for fixup, never hidden in a `Reuse`.
2. **On reparse:** `findBehindSplitPoint` rewinds to the scope-stable split just before the edited line; `restoreStack(behind.grammarStack)` resumes the matcher mid-scope; reparse ~one line; `tryToReuseAhead` splices the ahead chunks when `parsedPos === ahead.first.from` **and** `canReuseAhead` confirms the live stack `stackMatches` the ahead chunk's recorded entry stack.
3. **Count-fixup at splice** (Section 5): the spliced ahead chunks' spanning-scope close records carry **baked** child-counts from the old parse. Repair them by adding a single uniform `Δ*4` to each spanning close's `size` field.

### 4.2 Why count-fixup is correct (the Δ-uniformity proof)

`CompileStack.increment()` bumps the `children` counter of **every** open frame by exactly 1 per emitted node (confirmed, `CompileStack.ts:37-41`). So for any two scopes S₁ ⊇ S₂ both spanning the reparsed region, the span contributes the **same** node count to each. Therefore `Δ = (new − old) span node count` is **identical for every spanning frame** — one scalar, added to every spanning close record. Exactly the spanning closes are stale; non-spanning nodes (opened & closed inside the ahead region) and `Reuse` placeholders are correct as-is.

---

## 5. Count-fixup — the chosen full-1× mechanism (detail to start C2)

### 5.1 Identifying spanning closes (with the `Uint32Array` hazard the correctness lens found)

A close record is *spanning* iff its scope opened before the chunk: `s[1] < chunk.from`. **Hazard (confirmed in source):** `CompileStack.positions` is a `Uint32Array` (`CompileStack.ts:15`), and `Chunk.offset`/`slide` adjusts `chunk.from` but **not** the stored open positions. So `s[1] < chunk.from` computed *post-slide* compares a slid `from` against an un-slid position and **misfires**.

> **MUST: populate `spanningCloseOffsets` at original-tokenize time (pre-slide), in the existing `Chunk.add` close branch. Never recompute it via `s[1] < from` on a slid chunk.**

```ts
// Chunk.add, close branch, right after emitNode(node, pos, to, children*4+4):
if (s[1]! < this.from) {                       // pre-slide; opened in an earlier chunk
  (this.spanningCloseOffsets ??= []).push((this.nodeCount - 1) * 4);
}
```

This distinguishes a spanning close from a same-rule scope opened *and* closed inside the ahead region (whose `s[1] >= chunk.from`) — the exact nested-same-rule trap (e.g. a `for` inside the ahead region nested in the edited block's `for`): inner not bumped, outer bumped.

### 5.2 The fixup

```ts
// Compiler.reuse — record the pre-reparse baseline
this.restoredStack   = splitBehind.chunk?.grammarStack;          // undefined ⇒ pure boundary
this.behindNodeCount = splitBehind.chunk?.compilerNodeCount ?? 0;
this.oldSpanNodeCount =
  (aheadSplit.chunk?.compilerNodeCount ?? totalOld) - this.behindNodeCount;

// At splice (before append):
const newSpanNodeCount = this.compiler.nodeCount - this.compiler.behindNodeCount;
const Δ = newSpanNodeCount - this.compiler.oldSpanNodeCount;
applySpanDelta(this.compiler.ahead, Δ);

function applySpanDelta(ahead, Δ) {
  if (Δ === 0) return;                          // common keystroke: same node count, no fixup
  for (const chunk of ahead.chunks) {
    for (const o of chunk.spanningCloseOffsets ?? []) {
      chunk.compiled[o + 3] += Δ * 4;          // bump subtree byte-span (size is field 4)
    }
    chunk.treeBuffer = undefined;              // invalidate (node-by-node anyway)
  }
}
```

### 5.3 The structural-change guard (why the proof's precondition holds)

The Δ-uniformity proof requires the **set of spanning scopes to be unchanged** by the edit. An edit that adds/removes an `end` changes the open-scope structure at the ahead boundary. **`canReuseAhead` must refuse the splice unless the live stack exactly `stackMatches` the ahead chunk's recorded entry stack** (use exact compare at the splice; the hash is only the fast-path bucket). On a mismatch, the reparse continues forward (degrading to behind-only / option-B for that edit — still byte-identical, just a larger reparse). This is load-bearing, not decoration: count-fixup is applied **only** when the open-scope context is structurally identical on both sides.

### 5.4 The riskiest unknown for C2

**The persist-write-through invariant across SEQUENTIAL edits.** `applySpanDelta` mutates `chunk.compiled[]` in place so the next edit inherits a correct baseline. The current 14-case matrix + boundedness test exercise **only single edits**, so this invariant is *unverified*. A sequence where edit A bumps a chunk's spanning-close `size`, then edit B rewinds before that chunk and recomputes the same scope's count fresh, could double-count or strand the persisted Δ. The invariant *should* hold (a chunk is either in `left` reused-verbatim = current-truth, or recomputed = fresh; a persisted size is retained only for chunks strictly before the edit), but it is the most fragile part of C2 and the likeliest silent regression.

> **Prerequisite net for C2 (MUST add before trusting it): a sequential multi-edit byte-identity test** (apply N edits in a row, assert the tree equals a from-scratch parse of the final text after each). This is the single highest-value missing safety net and must exist before C2 ships.

### 5.5 C2 ordered checklist (after the cascade-close step is independently green)

1. **Cascade-close (Section 2)** — its own step. Net: `grammarSnapshot` + `vscodeGrammarSnapshot` byte-identical (re-greens the 9 stash regressors), then `crossChunkNesting`. **Gate: do not proceed until both snapshot suites are byte-identical.**
2. **Per-line `forceSplit` + snapshot/restore plumbing** (from stash; cascade already in). Net: `incremental` 14 still green; boundedness still ~58× (no reuse landing yet).
3. **Behind-reuse + `restoreStack` + exact `canReuseAhead`**, ahead splice gated on `Δ===0` initially. Net: `incremental` 14 byte-identical + `crossChunkNesting`; boundedness drops toward ~B/2.
4. **Count-fixup** (`spanningCloseOffsets` pre-slide, `applySpanDelta`, drop the `Δ===0` restriction). Net: `incremental` all 15 + `crossChunkNesting`; **tighten boundedness to `spanLen < editLineLen * 4`** (the payoff gate). **Plus the new sequential multi-edit test.**
5. **Full sweep + live verify.**

Suggested commit after step 4 green: `feat(textmate): intra-block ahead-reuse via deterministic cascade-close + spanning-count fixup (Phase C2, 58x→~1x)`.

---

## 6. Rejected alternatives (why the losers lost)

- **Option A — committed whole-block reparse.** This is the 58× bug. Baseline, not a candidate.

- **Option B — behind-reuse + pure-ahead only.** Correct and safe (it never reuses a spanning close, so no stale counts; no cascade-close needed because it rewinds only to pure boundaries). But the win is **position-dependent**: ~1× only for tail edits, ~B/2 (≈2×) average, **0× for top-of-block edits**. Selling that as "58×→1×" is microbenchmark-flattering. We keep it as the **safe degradation target** that C2 falls back to on structural edits — but it is not the headline, because C1 beats it (full win for *every* position) at lower risk. (This was "P1".)

- **P4 — Global Nesting Resolution.** Architecturally the "right" end state: emit count-free events, resolve all counts in one global pass after splicing ⇒ stale counts structurally impossible, and relative event positions even dodge the `Uint32Array` slide hazard. **Rejected for now** because: (1) it rewrites the entire assembler (`Chunk.add` emit format, `Compiler.step`/`finish`, `tryForTreeBuffer`, `emitTreeBuffer`) and **re-opens all 174 cold-parse snapshots + the oracle + the TreeBuffer-opacity contract** that 5 commits stabilized — the largest blast radius of any option; (2) it has a concrete accounting bug as specified — incrementing the enclosing frame by **1** per `Reuse` placeholder instead of by the placeholder's **top-level child count** (a self-contained chunk can hold ≥2 sibling nodes) — fixable but emblematic of the from-scratch suffix-order re-derivation it requires; (3) it *still* needs the same cascade-close as C2; (4) its own fallback ladder collapses into C2's count-fixup. So P4 = "do C2's hard parts plus an assembler rewrite." Defer to a v2 architecture only if count-fixup proves unmaintainable across many edit shapes.

- **Grammar-scoping fallback (changing the grammar JSON / lowerer).** Explicitly disfavored and **not needed at any tier** of C1 or C2. Stays unused.

---

## 7. Explicit correctness checklist (the adversarial edge cases that MUST be tested)

Each must produce a **byte-identical** tree vs. a from-scratch parse of the edited text (the `incremental.ts` `printTree` equality). Items marked **(net gap)** are not in the current matrix and must be added.

**Cascade-close (C2 prerequisite; verify on full-parse snapshots first):**
1. `for i in items do … end` — body edit; the `end` must close `DoBlock` then cascade-close `ForLoop` (one physical `end`, two scopes). `while` identical.
2. `function name() … end` — `FunctionBody` (zero-width) closes before the keyword; `FunctionDefinition` (consuming) closes by consuming `end`; **FunctionDefinition is NEVER cascade-popped** (the exact stash over-close).
3. `choose … then … end` — `ChooseThenClause` (zero-width) closes before the `end`; `ChooseBlock` (consuming) consumes it.
4. `if … elseif … else … end` — `elseif`/`else` are **siblings** (not children of IfBlock; confirmed in grammar), closed by normal `matchLine` dispatch as the next keyword line opens; the trailing `end` is consumed by IfBlock only. No spurious cascade across the if-family.
5. `repeat … until` — `RepeatLoop` closes zero-width at `until` (a sibling, not consumed).
6. The universal `(?=scene|branch) | (end)` alternation must classify IfBlock/DoBlock/ChooseBlock/FunctionDefinition as **consuming** (any consuming arm ⇒ consuming-classed). Use the verified rule-id allowlist, not a string-shape heuristic.

**Reuse / nesting (C1 and C2):**
7. **Nested same-rule scopes**, edit in the OUTER body *after* a nested inner block (`choose/then ⊃ if ⊃ for`, edit the then-body line after the nested `if…end`) — the restored/entry stack must be exactly the outer set; a cascade error at the prior `end` line corrupts it (the precise stash failure).
8. **Nested same-rule scope inside the ahead region** (a `for` below the edit, fully inside ahead, nested in the edited block's `for`) — outer spanning close bumped by Δ, inner self-contained close untouched (C2).
9. **Edit at top of a huge block** (k=1) — C1 still ~1 line; C2/B degrade to whole-block (correctness preserved).

**Structural / boundary (all designs):**
10. **Depth-changing edit — add an `end`** mid-block (closes the block early; lines below dedent). C1: below-lines miss via changed entry-hash, self-heal. C2: `canReuseAhead` refuses the now-mismatched ahead splice.
11. **Depth-changing edit — remove an `end`** (block now spans further / to EOF). Same guards.
12. **EOF-truncated block** (document ends mid-`for`/`function`, no `end`) + edit the last body line — incomplete-marker path (`Compiler.finish`) vs `closedAtEof` (no marker) must match from-scratch. **(net gap — add an unterminated-block incremental case.)**
13. **Edit that removes the final newline** — a previously-mid-doc line becomes the EOF line; C1's EOF carve-out must force-miss it (don't serve a mid-doc cache entry at EOF).
14. **Next-line lookahead line** (the line *before* a `scene`/`branch`/`end`, whose match consumed `state.advance()`) — C1 must NOT cache/serve it (the `(?=scene|branch)` next-line dependence the correctness lens flagged).
15. **Blank/empty body line** inside a block — no scope change; tokens (Newline) byte-identical.

**Cross-cutting nets to ADD before trusting C2 (and C1's persistence):**
16. **(net gap) Sequential multi-edit byte-identity test** — apply N edits in a row; after each, assert equality to a from-scratch parse of the current text. Exercises C1's memo-across-edits and C2's `compiled[]` write-through persistence — both currently unverified (the matrix is single-edit only).
17. **(net gap) Post-slide spanning-detection** — confirm `spanningCloseOffsets` is populated pre-slide and never recomputed via `s[1] < from` on a slid chunk (the `Uint32Array` hazard) — assert via a C2 case where the ahead region is slid by a non-trivial offset.

**Standing nets (must stay byte-identical throughout both phases):**
- `packages/sparkdown/src/tests/compiler/grammarSnapshot.test.ts`
- `packages/sparkdown/src/tests/compiler/vscodeGrammarSnapshot.test.ts`
- `packages/sparkdown/src/tests/incremental/` (14 edit-vs-scratch cases + boundedness)
- `packages/sparkdown/src/tests/incremental/crossChunkNesting.test.ts`
- `packages/sparkdown/src/tests/textmate-conformance/conformance.test.ts` (1/95 baseline)

---

## 8. Key file references (absolute)

- Matcher call site to wrap (C1): `C:\Users\Lovelle\Documents\GitHub\impower.worktrees\dev-parser-intra-scope-incremental\packages\textmate-grammar-tree\src\tree\classes\TextmateGrammarParse.ts` — `nextChunk` ~212–302, `grammar.match` at ~226.
- State purity / key derivation (C1): `...\packages\textmate-grammar-tree\src\grammar\classes\GrammarState.ts` — `reset()` clears only per-call scratch; `stack` persists. Add `stackHash`/`snapshotStack`/`restoreStack`/`stackMatches`.
- The one context-sensitivity (C1 carve-out trigger): `...\src\grammar\classes\rules\ScopedRule.ts` — `continueLine` boundary `state.advance()` + `end()` at **lines 220–224** (confirmed). Cascade insertion (C2): the consuming-close path; split `end()` (312–319) into a non-mutating `endProbe`.
- Count model (C2): `...\src\compiler\classes\Chunk.ts` (`add` close branch → `spanningCloseOffsets` **pre-slide**); `...\CompileStack.ts` — `positions` is `Uint32Array` (the slide hazard), `increment` 37–41 (uniform child bump = the Δ-uniformity proof); `...\Compiler.ts` (`reuse` 84–101, `append` → `applySpanDelta`); `...\Packet.ts` (`forceSplit`, `findAheadSplitPoint`, `findBehindSplitPoint`).
- Sub-O(D) layer to keep (C1 step 6): `TextmateGrammarParse` constructor 89–110 + `Compiler.reuse` (the committed `cachedCompilerProp` pure-boundary path — already byte-identical).
- Stash to salvage C2 plumbing from (then replace its cascade, add fixup): `git stash@{0}` on `dev/parser-intra-scope-incremental` — reuse `GrammarState` snapshot/restore, `Chunk.grammarStack`, `Compiler.restoredStack`, `Packet.forceSplit`, parser snapshot/restore **as-is**; **discard** its naive cascade (replace with Section 2); **add** count-fixup (Section 5).
- Nets: `...\packages\sparkdown\src\tests\compiler\grammarSnapshot.test.ts`, `vscodeGrammarSnapshot.test.ts`, `...\src\tests\incremental\incremental.test.ts` (+ `incremental.ts` harness, boundedness ~140–169), `crossChunkNesting.test.ts`, `...\textmate-conformance\conformance.test.ts`.

---

## 9. One-line bottom line

**Ship C1 (per-line tokenization memoization keyed on `(line text, entry-stack hash)`, fresh assembly) now** — it wins the dominant matcher cost 58×→~1× for every edit position, is byte-identical by construction, and structurally avoids both stash failures; its only real hole (the `state.advance()` next-line lookahead) is closed by a mechanical don't-cache-lookahead-or-EOF-lines carve-out. **Then layer C2 (deterministic cascade-close + uniform-Δ spanning-count fixup) for sub-O(D) assembly on very large files**, gated behind an exact-`stackMatches` splice guard and a new sequential multi-edit test. **Reject global-resolution** (assembler rewrite, reopens the whole byte-identity surface, collapses into count-fixup anyway) and the grammar-scoping fallback (unneeded).
