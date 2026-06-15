# Builtin Method Set (design sketch)

> **Status**: design — none of this is implemented yet. This document is
> the agreed-upon shape that the eventual lowerer / runtime dispatch will
> conform to.

Sparkdown exposes builtin operations on strings and tables via Luau's
method-call syntax (`receiver:method(args)`). Internally each method is
a top-level helper that branches on `type(receiver)` at runtime — there
is no per-type method table, no metatables, no first-class function
values. The `obj:m(a, b)` form is purely a parse-level sugar that
lowers to `__method_m(obj, a, b)`.

This choice keeps the runtime simple while giving authors the familiar
"things have methods" mental model.

## Design principles

1. **Luau-flavored naming and semantics.** When Luau and JS differ,
   pick the Luau spelling — `:sub` (not `:slice`), `:rep` (not
   `:repeat`), `:find` (not `:indexof`), `:gsub` (not `:replace`),
   `:insert` (not `:add`), `:concat` (not `:join`), etc. Sparkdown is a
   Luau-flavored dialect; authors who already know Luau shouldn't have
   to relearn names *or* behavior. Return-value conventions also follow
   Luau — `:find` returns `nil` on miss (not `-1` or `0`); negative
   indices on `:sub` match `string.sub`; etc. JS conventions are only
   borrowed where Luau has no equivalent (`:at`, `:trim`, `:startswith`,
   `:padstart`, `:some`, `:every`). Intentional behavioral divergences
   from Luau are called out explicitly in the Decisions section.
2. **Lowercase, no separators.** `:startswith`, `:padstart`, `:sortby`.
   Matches the Luau stdlib convention (`math.randomseed`,
   `bit32.byteswap`, `bit32.countlz`, `utf8.nfcnormalize`,
   `utf8.charpattern`). camelCase and snake_case are *not* used —
   sparkdown stdlib names are one smashed lowercase token.
3. **Pure-return everywhere.** No method mutates its receiver — `:sort`,
   `:reverse`, `:insert`, `:remove` all return a new value. Diverges
   from Luau's `table.insert` / `table.sort` (which mutate) but avoids
   the footgun and keeps the expression-substitution model uniform.
4. **1-based indexing, inclusive ranges.** Matches Luau. `:at(1)` is the
   first element. `:sub(2, 4)` returns positions 2, 3, 4.
5. **Negative indices on `:at` and `:sub`.** `-1` is the last element.
   Matches Luau `string.sub` (which already accepts negative indices)
   and JS/Python conventions.
6. **No first-class functions yet.** Predicate-based methods (`:map`,
   `:filter`, `:findindex`, predicate `:sort`) are deferred until
   functions become first-class values. Their names are reserved so the
   future addition won't conflict.

---

## Strings

Where a method exists in Luau's `string` library, the spelling matches
the Luau name. Methods with no Luau equivalent use JS/Python naming.

| Method | Returns | Source | Notes |
| ------ | ------- | ------ | ----- |
| `s:len()` | number | Luau | Equivalent to `#s`. |
| `s:upper()` | string | Luau | |
| `s:lower()` | string | Luau | |
| `s:reverse()` | string | Luau | |
| `s:sub(i [, j])` | string | Luau | Inclusive range. Negative indices allowed. Omitted `j` → end of string. |
| `s:rep(n [, sep])` | string | Luau | Optional separator between copies (matches Luau `string.rep`). |
| `s:find(sub)` | number \| nil | Luau | 1-based position of first match; `nil` if not found. For "contains" tests: `if s:find(sub) then`. *Plain-text only initially; Luau pattern support deferred. Sparkdown returns just the start position; Luau returns `(start, end)` — forced by sparkdown's lack of multiple-return support.* |
| `s:gsub(old, new)` | string | Luau | Replace all occurrences. *Plain-text only initially; Luau pattern support deferred. Sparkdown returns just the new string; Luau returns `(newstring, count)` — forced by sparkdown's lack of multiple-return support.* |
| `s:split([sep])` | table | Luau | Returns array-table of pieces. Default separator `","` (matches Luau `string.split`). |
| `s:at(i)` | string | JS | Single-character substring. Negative `i` counts from end. Out-of-range → `nil`. Convenience for `s:sub(i, i)` with the nil-on-out-of-range behavior. |
| `s:trim()` | string | JS | No Luau equivalent. Both ends. |
| `s:trimstart()` | string | JS | |
| `s:trimend()` | string | JS | |
| `s:startswith(prefix)` | bool | JS/Python | No Luau equivalent. |
| `s:endswith(suffix)` | bool | JS/Python | |
| `s:padstart(len [, ch])` | string | JS | No Luau equivalent. Default fill `" "`. |
| `s:padend(len [, ch])` | string | JS | |

**Dropped vs earlier sketch:**
- `:slice` → use `:sub`
- `:repeat` → use `:rep`
- `:indexof` → use `:find`
- `:replace` → use `:gsub`
- `:includes` → use `:find` truthily (`if s:find(sub) then`)
- `:concat` → use `..` operator

---

## Tables

Sparkdown tables are inkjs `ObjectValue` maps. Methods treat tables as
either *arrays* (integer-keyed, dense) or *records* (string-keyed)
depending on the method — `:at` / `:sub` / `:sort` / `:reverse` /
`:ipairs` are array operations; `:keys` / `:values` / `:pairs` work
on any shape.

### Available (no predicates needed)

| Method | Returns | Source | Notes |
| ------ | ------- | ------ | ----- |
| `t:len()` | number | Luau (`s:len` parallel) | Equivalent to `#t`. |
| `t:find(value)` | number \| nil | Luau | 1-based position of first match; `nil` if not found. Matches Luau `table.find`. For "contains" tests: `if t:find(x) then`. |
| `t:concat([sep [, i [, j]]])` | string | Luau | String-join array elements from index `i` to `j`. Default sep `""`, default range whole array. Non-string elements coerced via `tostring`. Matches Luau `table.concat` arity. |
| `t:sort()` | table | Luau | Ascending. Numbers and strings only; mixed types error. Stable. (Pure-return; diverges from mutating `table.sort`.) |
| `t:insert([pos,] value)` | table | Luau | New table with `value` inserted. One-arg form appends; two-arg form inserts at `pos` (1-based). Matches Luau `table.insert` arity. (Pure; diverges from mutating `table.insert`.) |
| `t:remove([i])` | table | Luau | New table with element at index `i` removed; default last. (Pure; diverges from mutating `table.remove`, which returns the *removed element*. Sparkdown returns the new table — use `t:at(i)` first if you need the removed value.) |
| `t:clone()` | table | Luau | Shallow copy. |
| `t:at(i)` | any | JS | Element at 1-based index. Negative `i` counts from end. Out-of-range → `nil`. (Luau has only `t[i]`, which doesn't support negative indices.) |
| `t:sub(start [, end])` | table | Luau-flavored | Sub-array. Inclusive range, negative indices. Named for symmetry with `s:sub`. Luau has no direct equivalent (`table.move` is close but multi-arg). |
| `t:reverse()` | table | JS | No Luau equivalent. |
| `t:sortby(key)` | table | sparkdown | No-predicate convenience: sort array of records ascending by `record[key]`. Stable. Predicate-form `:sort(fn)` lands when functions become first-class. |
| `t:min()` | any | sparkdown | Smallest element by `<` comparison. Numbers and strings only; mixed types error. Empty table → `nil`. |
| `t:max()` | any | sparkdown | Largest element by `>` comparison. Same type/empty rules as `:min`. |
| `t:random()` | any | sparkdown | Random element from the array portion. Empty table → `nil`. **Currently does not honor `math.randomseed`** — uses unseeded `Math.random()`. Tracked as a follow-up; in practice, narrative saves happen between flow points and store the chosen value, not the call itself, so this rarely matters. |
| `t:some(other)` | bool | JS | Overlap test: `true` if any element of `other` is in `t`. (Predicate form deferred.) |
| `t:every(other)` | bool | JS | Superset test: `true` if every element of `other` is in `t`. (Predicate form deferred.) |
| `t:union(other)` | table | JS/Python | Set union. |
| `t:intersection(other)` | table | JS/Python | Set intersection. |
| `t:difference(other)` | table | JS/Python | Elements in `t` not in `other`. |
| `t:keys()` | table | sparkdown | Array of keys. Insertion order for record tables; 1..n for arrays. |
| `t:values()` | table | sparkdown | Array of values. Same ordering rule. |
| `t:pairs()` | table | Luau-flavored | Array of `[key, value]` two-element tables, walking *all* keys (record + array). Same ordering rule. Named after Luau's `pairs(t)` global, though semantics differ (sparkdown returns a materialized array; Luau returns an iterator function). |
| `t:ipairs()` | table | Luau-flavored | Array of `[index, value]` two-element tables, walking *integer keys only* from `1` upward, stopping at the first hole. Named after Luau's `ipairs(t)` global. Use this when you want the array portion only and don't care about record fields. |

> **Insertion order requirement.** `:keys()`, `:values()`, and `:pairs()`
> all depend on the underlying inkjs `ObjectValue` preserving insertion
> order. (`:ipairs()` only walks integer keys `1..n` and doesn't need
> the invariant.) This is a runtime invariant that the eventual
> implementation must guarantee — verify before shipping. (The inkjs
> `ObjectValue` uses an underlying JS `Map`, so it should fall out
> naturally.)

**Dropped vs earlier sketch:**
- `:join` → use `:concat` (Luau name for string-join)
- `:indexof` → use `:find`
- `:add` → use `:insert`
- `:includes` → use `:find` truthily
- `:slice` → use `:sub`
- `:intersect` → use `:intersection` (noun form, parity with `:union` / `:difference`)
- The old `:concat` (append-two-tables) — name now taken by string-join.
  Append-tables can be built from `:insert` in a loop; revisit if a
  named method is needed (likely `:append` or `:extend`).

### Deferred — needs first-class functions

These names are reserved. They'd be trivial to add the day functions
become passable as arguments.

| Method | Returns | Source | Notes |
| ------ | ------- | ------ | ----- |
| `t:map(fn)` | table | JS | |
| `t:filter(fn)` | table | JS | |
| `t:reduce(fn, init)` | any | JS | |
| `t:findindex(fn)` | number \| nil | JS | 1-based index where `fn(el)` is truthy; `nil` if none. (JS returns `-1`; sparkdown returns `nil` for symmetry with `:find`.) |
| `t:foreach(fn)` | nil | Luau (deprecated) / JS | Both Luau (deprecated `table.foreach`) and JS (`Array.prototype.forEach`) use this name. |
| `t:sort(fn)` | table | Luau | Predicate-form of `:sort`. Argument-less form ships first. |
| `t:find(fn)` | any | overload | Argument overload of value-search `:find`: function arg → predicate, non-function → value lookup. Only resolvable once functions are first-class. |
| `s:gsub(pat, fn)` | string | Luau | Predicate form (replacer function). |
| `s:some(fn)` / `s:every(fn)` | bool | JS | Per-character predicates. |

---

## Decisions

- **`:find` returns `nil` on miss.** Matches Luau `table.find` and
  Luau `string.find`. Authors write `if t:find(x) then ... end` —
  the standard Luau idiom. `:findindex` (deferred) follows the same
  convention.
- **`:sort` and `:sortby` are stable.** Equal-keyed elements preserve
  their original relative order (matches JS post-ES2019).
- **`:keys` / `:values` / `:pairs` preserve insertion order** for
  record-style tables. Runtime invariant on inkjs `ObjectValue` —
  verify before shipping.
- **Out-of-range `:at` returns `nil`.** Consistent with `t[i]` index
  access and `s:sub` empty-result behavior. No error thrown.
- **String `:at(i)` vs `s[i]`.** Sparkdown doesn't expose string-index
  syntax today, so `:at` is the only way to single-char-index. No
  conflict.
- **Pattern support deferred.** `s:find` and `s:gsub` ship with
  plain-text-only semantics. Full Luau pattern support is deferred —
  when it lands, an optional pattern-flag arg or a separate
  `:findpattern`/`:gsubpattern` pair can extend the API without renaming.
- **No multiple returns.** Luau `string.find` returns `(start, end)`
  and `string.gsub` returns `(newstring, count)`; sparkdown returns
  just the first value in each case. Forced by sparkdown's
  single-value expression model. Documented per-method; revisit if
  multiple-return support ever lands.
- **Pure-return diverges from Luau mutating semantics.** Authors coming
  from Luau will expect `table.insert(t, x)` to mutate `t`. Sparkdown's
  `t:insert(x)` returns a new table. This is the single biggest
  intentional deviation from Luau. A related divergence: Luau
  `table.remove` returns the *removed element*; sparkdown's `t:remove`
  returns the *new table* (so it composes with other pure-return
  methods). Use `t:at(i)` to grab the element first if needed. To be
  documented in DIVERGENCES.md when implemented.

---

## Lowering sketch

The synthetic dispatch names are user-invisible — they exist only
inside the lowerer/runtime, so the lowercase-no-separator convention
that applies to author-facing names doesn't apply here. The internal
form uses `__method_<name>` with an underscore separator so the
prefix and the method name remain visually distinct in stack traces
and dispatch tables:

```
foo:bar(a, b)   →   __method_bar(foo, a, b)
```

`__method_bar` is a runtime helper that branches on receiver type:

```ts
function __method_find(receiver, needle) {
  if (typeof receiver === "string") return stringFind(receiver, needle);
  if (receiver instanceof ObjectValue) return tableFind(receiver, needle);
  throw new RuntimeError(":find called on non-string non-table");
}
```

Compile-time: the lowerer translates `receiver:method(args...)` into a
`FunctionCall` to the synthetic name `__method_<method>` with
`receiver` prepended to the argument list. No grammar change beyond
recognizing the `:` method-call form (the grammar already tokenizes it
for the Luau-stdlib `s:upper()` cases).

Runtime: each `__method_*` registers in a new `METHOD_DISPATCH` table
parallel to `STDLIB` in
[`src/inkjs/engine/StdLib.ts`](src/inkjs/engine/StdLib.ts). Receiver
type-check is the helper's first line.
