# sparkdown docs

Reference / design documentation for the `@impower/sparkdown` package.
Grouped to mirror the source-tree layout — `compiler/` docs cover
parsing + lowering, `runtime/` docs cover the inkjs-fork runtime +
sparkdown additions.

## Compiler — [`compiler/`](./compiler/)

Parser, grammar, and the lowerer (sparkdown source → inkjs runtime IR).

| Doc | What it covers |
| --- | --- |
| [`GRAMMAR.md`](./compiler/GRAMMAR.md) | TextMate-grammar conventions, scope/boundary rules, the encoding "Golden Rule" |
| [`LOWERING.md`](./compiler/LOWERING.md) | The lowerer's per-construct desugaring rules — how sparkdown source becomes inkjs runtime IR |

## Runtime — [`runtime/`](./runtime/)

The inkjs runtime fork and sparkdown-specific additions
(Luau primitives, multi-return, closures, stdlib, method dispatch),
plus the cross-cutting trackers for intentional divergences and
deferred work.

| Doc | What it covers |
| --- | --- |
| [`RUNTIME.md`](./runtime/RUNTIME.md) | The inkjs runtime fork + sparkdown-specific additions |
| [`STDLIB.md`](./runtime/STDLIB.md) | Luau stdlib coverage status table — what's implemented, what's deferred, what's intentionally not supported |
| [`METHODS.md`](./runtime/METHODS.md) | `obj:method(args)` builtin method-dispatch surface |
| [`FUNCTIONS.md`](./runtime/FUNCTIONS.md) | Luau function semantics — closures, upvalue capture, multi-return |
| [`DIVERGENCES.md`](./runtime/DIVERGENCES.md) | Known semantic differences from upstream Luau / inkjs (closed-by-design) |
| [`DEFERRED.md`](./runtime/DEFERRED.md) | Lowerer / runtime tasks deferred to a later pass |

## Convention for code-comment references

These docs are **in flux** — the architecture is still being laid
down. That means filenames, section headings, and structure can shift
between passes. Code comments that reference docs by specific section
anchor (`see GRAMMAR.md §3.2`, `documented in METHODS.md > "Pattern
support"`) rot quickly: anchors break, headings get reworded, sections
move.

**Convention:** in code comments, reference docs by name only
(`see docs/compiler/GRAMMAR.md`), not by section. Inline short
rationales directly in the code; only delegate to a doc when the
explanation is genuinely long-form. Reserve specific anchors for
truly stable references (license attributions, fixed external specs)
— not for our own design docs while they're settling.
