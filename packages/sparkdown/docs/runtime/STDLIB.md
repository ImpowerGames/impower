# Luau Standard Library Coverage

Sparkdown aims to eventually support the full Luau standard library so
authors can use the same functions they're familiar with from Luau /
Roblox / Lua 5.1. This document tracks what's implemented today and what
still needs to land.

**Source of truth**: [`src/inkjs/engine/StdLib.ts`](src/inkjs/engine/StdLib.ts).
The unified `STDLIB` table holds every Luau stdlib function keyed by its
dotted full name (`"math.abs"`, `"plural.category"`, `"assert"`, ...).
Each entry is `{arity, pure?, fn(story, args)}`. Pure entries
(`pure: true`) auto-mount on `NativeFunctionCall` for the type-coercion
fast path; non-pure entries route through the generic
`RunStdLibFunction` ControlCommand dispatcher.

Adding a new entry is one line. Examples:

```typescript
// pure numeric:
"math.atan2": { arity: 2, pure: true, fn: (_, [y, x]) => Math.atan2(y, x) },

// state-aware (returns a string, raises errors, reads `story.state`, etc.):
tostring: { arity: 1, fn: (_, [v]) => /* ... */ },
```

Coercion helpers (`coerceNumber`, `coerceString`, `isTruthy`,
`luauTypeOf`) live in the same file for state-aware fns that need to
unpack `IntValue` / `StringValue` / etc.

**Legend** (`Status` column):

✅ supported

⚠️ registered but blocked by a known bug (see notes)

⬜ not yet supported

⛔ structurally infeasible in this runtime (e.g. requires a JS GC
hook that doesn't exist). Not used for "we think it's low-priority"
— anything Luau ships should be supported eventually so authors can
import Luau libraries without surprises.

Deprecated entries are still ✅ — they dispatch normally at runtime
so imported Luau code keeps working. The Notes column flags them with
a leading **Deprecated** and suggests the modern replacement; the
lowerer also emits an Information-severity LSP diagnostic tagged
`Deprecated` so editors render the call strikethrough.

**Origin** (`Lua` and `Luau` columns):

✅ present and stable

`5.1`, `5.1–5.2`, `5.2+`, `5.3+` etc. — present in specific Lua versions only

❌ not present in that language

`—` not applicable (sparkdown-specific name)

---

## Constants

Identifier accesses that evaluate to a fixed value (e.g. `math.pi`,
`_VERSION`). Implemented via `STDLIB_CONSTANTS` in StdLib.ts — the
lowerer detects the dotted path and emits the value directly as a
literal expression at compile time (no runtime dispatch). Top-level
constants like `_G` / `_VERSION` are tagged by `LuauStdLibGlobals`
in the grammar.

| Name       | Lua | Luau | Status | Notes                                                                                                                                                                                                                                                                                                                           |
| ---------- | :-: | :--: | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_G`       | ✅  |  ✅  |   ⬜   | Global env table. Becomes load-bearing once `define`'s class-and-method runtime lands: instance method dispatch (`bird.fly()` resolving to the right override across inheritance) needs a runtime class registry, and `_G[ClassName]` is the natural place to keep it. Until then, sparkdown's flat declarations don't need it. |
| `_VERSION` | ✅  |  ✅  |   ✅   | Reports `"Luau"`.                                                                                                                                                                                                                                                                                                               |

Math constants (`math.pi`, `math.huge`) live in the `math` section
below for convenience.

---

## `math`

Reference: https://luau-lang.org/library#math-library

| Method                                      |   Lua   | Luau | Status | Notes                                                                                                                                                                             |
| ------------------------------------------- | :-----: | :--: | :----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----- |
| `math.abs(x)`                               |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.acos(x)`                              |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.asin(x)`                              |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.atan(x)` / `math.atan(y, x)`          |   ✅    |  ✅  |   ✅   | 2-arg form (Lua 5.3+ / Luau) is equivalent to `math.atan2(y, x)`.                                                                                                                 |
| `math.atan2(y, x)`                          | 5.1–5.2 |  ✅  |   ✅   | **Deprecated** — use 2-arg `math.atan(y, x)`. Removed in Lua 5.3; kept in Luau for compat.                                                                                        |
| `math.ceil(x)`                              |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.clamp(x, min, max)`                   |   ❌    |  ✅  |   ✅   | Luau-only.                                                                                                                                                                        |
| `math.cos(x)`                               |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.cosh(x)`                              | 5.1–5.2 |  ✅  |   ✅   | Removed in Lua 5.3; kept in Luau.                                                                                                                                                 |
| `math.deg(x)`                               |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.exp(x)`                               |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.floor(x)`                             |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.fmod(x, y)`                           |   ✅    |  ✅  |   ✅   | Truncate-toward-zero remainder (matches JS `%`).                                                                                                                                  |
| `math.frexp(x)`                             | 5.1–5.2 |  ✅  |   ✅   | Removed in Lua 5.3; kept in Luau. Multi-return: mantissa `m` and exponent `e` such that `x = m * 2^e`, with `0.5 <=                                                               | m   | < 1`. |
| `math.huge`                                 |   ✅    |  ✅  |   ✅   | Constant. Stored as `3.4e38` (Float32 max) — inkjs's JSON serializer clamps `Infinity` since JSON has no Infinity literal.                                                        |
| `math.ldexp(x, e)`                          | 5.1–5.2 |  ✅  |   ✅   | Removed in Lua 5.3; kept in Luau.                                                                                                                                                 |
| `math.log(x [, base])`                      |   ✅    |  ✅  |   ✅   | Optional `base` (Lua 5.2+ / Luau). With base: returns `log(x) / log(base)`.                                                                                                       |
| `math.lerp(a, b, t)`                        |   ❌    |  ✅  |   ✅   | Luau 0.6+. Linear interpolation; not clamped (extrapolates for `t` outside [0, 1]).                                                                                               |
| `math.log10(x)`                             |   5.1   |  ✅  |   ✅   | Removed in Lua 5.2 (use `math.log(x, 10)`); kept in Luau.                                                                                                                         |
| `math.map(x, inMin, inMax, outMin, outMax)` |   ❌    |  ✅  |   ✅   | Luau-only.                                                                                                                                                                        |
| `math.max(a, b, ...)`                       |   ✅    |  ✅  |   ✅   | Variadic.                                                                                                                                                                         |
| `math.min(a, b, ...)`                       |   ✅    |  ✅  |   ✅   | Variadic.                                                                                                                                                                         |
| `math.modf(x)`                              |   ✅    |  ✅  |   ✅   | Multi-return: integer part (same sign as x) + fractional part. Consumed via `local i, f = math.modf(x)` (full unpack) or `local x = math.modf(...)` (auto-unwrap to first value). |
| `math.noise(x [, y [, z]])`                 |   ❌    |  ✅  |   ✅   | Ken Perlin's improved 3D noise. Output roughly in `[-1, 1]`. Permutation table differs from Roblox's, so absolute values won't match Roblox exactly.                              |
| `math.pi`                                   |   ✅    |  ✅  |   ✅   | Constant.                                                                                                                                                                         |
| `math.pow(a, b)`                            | 5.1–5.2 |  ✅  |   ✅   | **Deprecated** — use the `^` exponentiation operator (`a ^ b`). Removed in Lua 5.3; kept in Luau for compat.                                                                      |
| `math.rad(x)`                               |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.random([m [, n]])`                    |   ✅    |  ✅  |   ✅   | All three forms: 0-arg → float in `[0, 1)`; 1-arg → integer in `[1, m]`; 2-arg → integer in `[m, n]`. Shared deterministic PRNG.                                                  |
| `math.randomseed([seed])`                   |   ✅    |  ✅  |   ✅   | 0-arg form (Luau) seeds from `Date.now()` (non-deterministic across saves). Always resets `previousRandom` to 0.                                                                  |
| `math.round(x)`                             |   ❌    |  ✅  |   ✅   | Luau-only.                                                                                                                                                                        |
| `math.sign(x)`                              |   ❌    |  ✅  |   ✅   | Luau-only.                                                                                                                                                                        |
| `math.sin(x)`                               |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.sinh(x)`                              | 5.1–5.2 |  ✅  |   ✅   | Removed in Lua 5.3; kept in Luau.                                                                                                                                                 |
| `math.sqrt(x)`                              |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.tan(x)`                               |   ✅    |  ✅  |   ✅   |                                                                                                                                                                                   |
| `math.tanh(x)`                              | 5.1–5.2 |  ✅  |   ✅   | Removed in Lua 5.3; kept in Luau.                                                                                                                                                 |
| `math.ult(a, b)`                            |   5.3   |  ✅  |   ✅   | Unsigned-int less-than. Both operands coerced to uint32 before compare. Returns boolean.                                                                                          |

---

## `string`

Reference: https://luau-lang.org/library#string-library

| Method                                       | Lua  | Luau | Status | Notes                                                                                                                                                                                                              |
| -------------------------------------------- | :--: | :--: | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `string.byte(s [, i [, j]])`                 |  ✅  |  ✅  |   ✅   | Multi-return: code-unit values for chars in `[i, j]` (1-indexed, negative counts from end). Uses `charCodeAt()` — matches Lua for ASCII; surrogate code units for higher planes.                                   |
| `string.char(...)`                           |  ✅  |  ✅  |   ✅   | Variadic; pure. Wraps `String.fromCharCode(...)`.                                                                                                                                                                  |
| `string.contains(s, sub)`                    |  ❌  |  ❌  |   ✅   | Sparkdown-only convenience (mirrors JS `String.includes`). Pure substring check, no patterns. Returns boolean.                                                                                                     |
| `string.endswith(s, suffix)`                 |  ❌  |  ❌  |   ✅   | Sparkdown-only (mirrors JS `String.endsWith`). Returns boolean.                                                                                                                                                    |
| `string.find(s, pattern [, init [, plain]])` |  ✅  |  ✅  |   ✅   | Multi-return `(start, end, …captures)`. Full Lua-pattern surface including `%b{}` balanced match, `%f[]` frontier, `()` position capture. Translated via `luaPatternToJs` → `executeLuaPattern`.                   |
| `string.format(fmt, ...)`                    |  ✅  |  ✅  |   ✅   | Variadic. Supports `d i u o x X e E f g G c s q %` conversions plus `[flags][width][.precision]` modifiers (`- + space 0 #`).                                                                                      |
| `string.gmatch(s, pattern)`                  |  ✅  |  ✅  |   ✅   | Generic-for iterator over every non-overlapping match. Yields captures (or whole match if no captures). Full Lua-pattern surface (including `%b{}` / `%f[]` / `()`).                                               |
| `string.gsub(s, pattern, repl [, n])`        |  ✅  |  ✅  |   ✅   | All three replacement forms supported: string template (`%0`–`%9`, `%%`), table lookup by first capture, and function called per match (return string/number to substitute, nil/false to keep the original match). |
| `string.len(s)`                              |  ✅  |  ✅  |   ✅   | Covered by `#s` length operator too.                                                                                                                                                                               |
| `string.lower(s)`                            |  ✅  |  ✅  |   ✅   |                                                                                                                                                                                                                    |
| `string.match(s, pattern [, init])`          |  ✅  |  ✅  |   ✅   | Returns the captures (or whole match if none). Same matcher as `string.find` — full Lua-pattern surface.                                                                                                           |
| `string.pack(fmt, ...)`                      | 5.3+ |  ✅  |   ✅   | Binary packing via DataView. Supports `< > = ! ( )`, `b B h H i[N] I[N] l L j J T f d n s[N] z c[N] x[N]`. Output is a byte string (each char ∈ [0, 255]) round-tripping with `string.byte` / `char`.              |
| `string.packsize(fmt)`                       | 5.3+ |  ✅  |   ✅   | Byte size of a fixed-width format. Errors on variable-width specs (`s`, `z`).                                                                                                                                      |
| `string.rep(s, n [, sep])`                   |  ✅  |  ✅  |   ✅   | Optional `sep` (Lua 5.3+) inserted between copies.                                                                                                                                                                 |
| `string.reverse(s)`                          |  ✅  |  ✅  |   ✅   |                                                                                                                                                                                                                    |
| `string.split(s, separator)`                 |  ❌  |  ✅  |   ✅   | Luau-only. 1-indexed array table. Empty separator splits into characters.                                                                                                                                          |
| `string.startswith(s, prefix)`               |  ❌  |  ❌  |   ✅   | Sparkdown-only (mirrors JS `String.startsWith`). Returns boolean.                                                                                                                                                  |
| `string.sub(s, i [, j])`                     |  ✅  |  ✅  |   ✅   | Lua 1-based inclusive indices; supports negative indices counting from end.                                                                                                                                        |
| `string.trim(s)`                             |  ❌  |  ❌  |   ✅   | Sparkdown-only (mirrors JS `String.trim`). Strips ASCII + Unicode whitespace both sides.                                                                                                                           |
| `string.trimstart(s)`                        |  ❌  |  ❌  |   ✅   | Sparkdown-only (mirrors JS `String.trimStart`).                                                                                                                                                                    |
| `string.trimend(s)`                          |  ❌  |  ❌  |   ✅   | Sparkdown-only (mirrors JS `String.trimEnd`).                                                                                                                                                                      |
| `string.unpack(fmt, s [, pos])`              | 5.3+ |  ✅  |   ✅   | Read values out of a byte string. Returns each value + the next 1-indexed position (multi-return). Optional `pos` resumes from a mid-buffer offset.                                                                |
| `string.upper(s)`                            |  ✅  |  ✅  |   ✅   |                                                                                                                                                                                                                    |

---

## `table`

Reference: https://luau-lang.org/library#table-library

| Method                                | Lua  | Luau | Status | Notes                                                                                                                                                           |
| ------------------------------------- | :--: | :--: | :----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table.clear(t)`                      |  ❌  |  ✅  |   ✅   | Luau-only. Mutates `t`. Refuses on a frozen table.                                                                                                              |
| `table.clone(t)`                      |  ❌  |  ✅  |   ✅   | Luau-only. Shallow copy. Result is unfrozen even if source was (matches Luau).                                                                                  |
| `table.concat(t [, sep [, i [, j]]])` |  ✅  |  ✅  |   ✅   | Reads array portion only. Numeric elements stringify; non-string/non-number errors.                                                                             |
| `table.create(count [, value])`       |  ❌  |  ✅  |   ✅   | Luau-only. Shares one reference across all slots (mutations to the value propagate).                                                                            |
| `table.find(t, value [, init])`       |  ❌  |  ✅  |   ✅   | Luau-only. Linear search of array portion; strict equality on unwrapped values.                                                                                 |
| `table.foreach(t, f)`                 | 5.1  |  ✅  |   ✅   | **Deprecated** — use `for k, v in pairs(t) do … end`. Calls `f(k, v)` for every entry; a non-nil return ends iteration and propagates.                          |
| `table.foreachi(t, f)`                | 5.1  |  ✅  |   ✅   | **Deprecated** — use `for i, v in ipairs(t) do … end`. Walks the array portion; calls `f(i, v)` for each.                                                       |
| `table.freeze(t)`                     |  ❌  |  ✅  |   ✅   | Luau-only. Marks `t` read-only; subsequent mutation calls error. Returns `t`.                                                                                   |
| `table.getn(t)`                       | 5.1  |  ✅  |   ✅   | **Deprecated** — use `#t`. Removed in Lua 5.2; kept in Luau for compat.                                                                                         |
| `table.insert(t, [pos,] value)`       |  ✅  |  ✅  |   ✅   | Mutates `t` (refuses if frozen). 2-arg appends; 3-arg inserts at `pos` shifting later elements right.                                                           |
| `table.isfrozen(t)`                   |  ❌  |  ✅  |   ✅   | Luau-only. Returns `false` for non-table args (matches Luau's tolerant behavior).                                                                               |
| `table.maxn(t)`                       | 5.1  |  ✅  |   ✅   | **Deprecated** — if you need sparse-int-key scan, write the loop explicitly with `pairs`. Largest positive integer key. Returns 0 for empty / non-numeric keys. |
| `table.move(a1, f, e, t [, a2])`      | 5.3+ |  ✅  |   ✅   | Added in Lua 5.3. Picks safe iteration direction for overlapping ranges. Refuses if destination is frozen.                                                      |
| `table.pack(...)`                     | 5.2+ |  ✅  |   ✅   | Added in Lua 5.2. Returns a table with args at "1".."N" plus an `n` field.                                                                                      |
| `table.remove(t [, pos])`             |  ✅  |  ✅  |   ✅   | Mutates `t` (refuses if frozen). Returns the removed value or nil.                                                                                              |
| `table.sort(t [, comp])`              |  ✅  |  ✅  |   ✅   | In-place stable sort of the array portion. Default comparator is `<`. User comparator (closure or bare-knot) runs via `story.CallLuauFunction`.                 |
| `table.unpack(t [, i [, j]])`         | 5.2+ |  ✅  |   ✅   | Added in Lua 5.2 (was global `unpack` in 5.1). Multi-return: `t[i], t[i+1], …, t[j]`. Missing slots in the range become nil.                                    |

---

## `bit32` ✅ fully supported

Reference: https://luau-lang.org/library#bit32-library

All bit32 functions are 32-bit integer operations; sparkdown treats numbers
as JS doubles, so each entry's result is coerced back to unsigned 32-bit
via `>>> 0` to keep Lua-style semantics.

The `bit32` library was added in Lua 5.2 and **removed in Lua 5.4** (replaced
by native integer bitwise operators `&`, `|`, `~`, `<<`, `>>`). Luau keeps
the library and adds Luau-only entries (`byteswap`, `countlz`, `countrz`).

| Method                                 |   Lua   | Luau | Status | Notes                                                |
| -------------------------------------- | :-----: | :--: | :----: | ---------------------------------------------------- |
| `bit32.arshift(x, disp)`               | 5.2–5.3 |  ✅  |   ✅   | Sign-extending right shift, unsigned-coerced result. |
| `bit32.band(...)`                      | 5.2–5.3 |  ✅  |   ✅   | Variadic.                                            |
| `bit32.bnot(x)`                        | 5.2–5.3 |  ✅  |   ✅   |                                                      |
| `bit32.bor(...)`                       | 5.2–5.3 |  ✅  |   ✅   | Variadic.                                            |
| `bit32.btest(...)`                     | 5.2–5.3 |  ✅  |   ✅   | Variadic; returns boolean (AND non-zero).            |
| `bit32.bxor(...)`                      | 5.2–5.3 |  ✅  |   ✅   | Variadic.                                            |
| `bit32.byteswap(x)`                    |   ❌    |  ✅  |   ✅   | Luau-only.                                           |
| `bit32.countlz(x)`                     |   ❌    |  ✅  |   ✅   | Luau-only. Uses `Math.clz32`.                        |
| `bit32.countrz(x)`                     |   ❌    |  ✅  |   ✅   | Luau-only.                                           |
| `bit32.extract(n, field [, width])`    | 5.2–5.3 |  ✅  |   ✅   | Width defaults to 1.                                 |
| `bit32.lrotate(x, disp)`               | 5.2–5.3 |  ✅  |   ✅   |                                                      |
| `bit32.lshift(x, disp)`                | 5.2–5.3 |  ✅  |   ✅   |                                                      |
| `bit32.replace(n, v, field [, width])` | 5.2–5.3 |  ✅  |   ✅   | Width defaults to 1.                                 |
| `bit32.rrotate(x, disp)`               | 5.2–5.3 |  ✅  |   ✅   |                                                      |
| `bit32.rshift(x, disp)`                | 5.2–5.3 |  ✅  |   ✅   | Logical (unsigned) right shift.                      |

---

## `os`

Reference: https://luau-lang.org/library#os-library

| Method                       | Lua | Luau | Status | Notes                                                                                                                                                                                                                                      |
| ---------------------------- | :-: | :--: | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `os.clock()`                 | ✅  |  ✅  |   ✅   | Uses `performance.now()` / 1000 when available, else `Date.now()` / 1000. Wall-clock, not CPU time.                                                                                                                                        |
| `os.date([format [, time]])` | ✅  |  ✅  |   ✅   | strftime-style formatting. Supports `%a %A %b %B %c %d %H %I %j %M %m %p %S %w %x %X %y %Y %Z %%`. `*t` returns a table with year/month/day/hour/min/sec/wday/yday/isdst fields. `!` prefix selects UTC. English-only month/weekday names. |
| `os.difftime(t2, t1)`        | ✅  |  ✅  |   ✅   |                                                                                                                                                                                                                                            |
| `os.time([t])`               | ✅  |  ✅  |   ✅   | No-arg form returns current Unix timestamp. Table form `{year, month, day [, hour, min, sec]}` treats fields as local time (matches Lua); month is 1-indexed. Accepts both `{year = ...}` and `{["year"] = ...}` table-key shapes.         |

---

## `utf8`

Reference: https://luau-lang.org/library#utf8-library

The `utf8` library was added in Lua 5.3 and Luau.

| Method                          | Lua  | Luau | Status | Notes                                                                                                                                                                                 |
| ------------------------------- | :--: | :--: | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utf8.char(...)`                | 5.3+ |  ✅  |   ✅   | Variadic. Wraps `String.fromCodePoint(...)`.                                                                                                                                          |
| `utf8.charpattern`              | 5.3+ |  ✅  |   ✅   | Constant. The Lua-pattern string itself; pattern matching is blocked on a Lua-pattern engine.                                                                                         |
| `utf8.codepoint(s [, i [, j]])` | 5.3+ |  ✅  |   ✅   | Multi-return: codepoints for chars whose starting byte lies in `[i, j]` (1-indexed bytes). JS strings are always valid Unicode, so the "invalid UTF-8" error path never triggers.     |
| `utf8.codes(s)`                 | 5.3+ |  ✅  |   ✅   | Generic-for iterator yielding `(byte_position, codepoint)` for each character in `s`. Byte positions are 1-indexed and match the convention used by `utf8.codepoint` / `utf8.offset`. |
| `utf8.len(s [, i [, j]])`       | 5.3+ |  ✅  |   ✅   | Counts code points across UTF-8 byte range `[i, j]`. Negative indices count from end. JS strings are always valid Unicode, so the "first invalid byte" error path never triggers.     |
| `utf8.nfcnormalize(s)`          |  ❌  |  ✅  |   ✅   | Luau-only. Wraps `String.prototype.normalize("NFC")`.                                                                                                                                 |
| `utf8.nfdnormalize(s)`          |  ❌  |  ✅  |   ✅   | Luau-only. Wraps `String.prototype.normalize("NFD")`.                                                                                                                                 |
| `utf8.offset(s, n [, i])`       | 5.3+ |  ✅  |   ✅   | Returns 1-based UTF-8 byte position. Supports `n=0` (char containing byte `i`) and negative `n` (count backward).                                                                     |

---

## `vector` _(Luau)_

Reference: https://luau-lang.org/library#vector-library

3D vector primitive. Needs a new `ValueType.Vector` runtime value
(three floats) plus per-op dispatch. Same shape as `buffer.*` —
mechanical once the value type and `NativeFunctionCall` registration
helpers are in place. All `vector.*` entries are Luau-only (Roblox
API).

| Method                        | Lua | Luau | Status |
| ----------------------------- | :-: | :--: | :----: |
| `vector.create(x, y, z)`      | ❌  |  ✅  |   ⬜   |
| `vector.magnitude(v)`         | ❌  |  ✅  |   ⬜   |
| `vector.normalize(v)`         | ❌  |  ✅  |   ⬜   |
| `vector.cross(a, b)`          | ❌  |  ✅  |   ⬜   |
| `vector.dot(a, b)`            | ❌  |  ✅  |   ⬜   |
| `vector.angle(a, b [, axis])` | ❌  |  ✅  |   ⬜   |
| `vector.floor(v)`             | ❌  |  ✅  |   ⬜   |
| `vector.ceil(v)`              | ❌  |  ✅  |   ⬜   |
| `vector.abs(v)`               | ❌  |  ✅  |   ⬜   |
| `vector.sign(v)`              | ❌  |  ✅  |   ⬜   |
| `vector.clamp(v, min, max)`   | ❌  |  ✅  |   ⬜   |
| `vector.max(...)`             | ❌  |  ✅  |   ⬜   |
| `vector.min(...)`             | ❌  |  ✅  |   ⬜   |

---

## `count` _(sparkdown-specific)_

Sparkdown-only namespace that exposes ink's narrative-flow runtime
builtins under Luau-style names. These methods read the inkjs `Story`
object's running state — turn counter, visit counts, choice count —
and return numeric _counts_, hence the `count.*` prefix.

`count` is registered as a stdlib namespace in the grammar, which
means it's **reserved as an identifier** — users can't declare a
variable named `count`. Syntax highlighting tags `count` with the
stdlib scope so the reserved status is visible at the source level.

`count.choices()` and `count.turns()` (0-arg form) live in the unified
`STDLIB` table as state-aware entries — they just read a field on
`story.state` (`generatedChoices.length`, `currentTurnIndex + 1`). The
1-arg forms `count.turns(-> target)` and `count.visits(-> target)`
stay on the legacy `INK_BUILTIN_ALIASES` → `TURNS_SINCE` / `READ_COUNT`
ControlCommand path because they need compile-time DivertTarget setup
(marking the target container for visit-counting in
`FunctionCall.ResolveReferences`). The arity-overloaded `count.turns`
falls through the alias function's `null` return for `argCount === 0`
to the STDLIB lookup.

| Method                    | Lua | Luau | Status | Path                                                                                                |
| ------------------------- | :-: | :--: | :----: | --------------------------------------------------------------------------------------------------- |
| `count.choices()`         |  —  |  —   |   ✅   | `STDLIB["count.choices"]` (state-aware). Sparkdown-specific alias of ink's `CHOICE_COUNT`.          |
| `count.turns()`           |  —  |  —   |   ✅   | `STDLIB["count.turns"]` (state-aware, 0-arg). Alias of ink's `TURNS`.                               |
| `count.turns(-> target)`  |  —  |  —   |   ✅   | `INK_BUILTIN_ALIASES.count.turns` → `TURNS_SINCE` (legacy ControlCommand, needs compile-time setup) |
| `count.visits(-> target)` |  —  |  —   |   ✅   | `INK_BUILTIN_ALIASES.count.visits` → `READ_COUNT` (legacy ControlCommand)                           |

---

## `coroutine`

⬜ Deferred. Sparkdown's runtime is single-threaded narrative-flow
on inkjs — coroutines would need either real fibers or a CPS
transform of all callable code. Possible to add, but a significant
runtime investment. Tracked here so imported Luau libraries that
touch `coroutine.*` get a clear "not yet" instead of a silent
not-found.

| Method                      | Lua | Luau | Status |
| --------------------------- | :-: | :--: | :----: |
| `coroutine.close(co)`       | ✅  |  ✅  |   ⬜   |
| `coroutine.create(f)`       | ✅  |  ✅  |   ⬜   |
| `coroutine.isyieldable()`   | ✅  |  ✅  |   ⬜   |
| `coroutine.resume(co, ...)` | ✅  |  ✅  |   ⬜   |
| `coroutine.running()`       | ✅  |  ✅  |   ⬜   |
| `coroutine.status(co)`      | ✅  |  ✅  |   ⬜   |
| `coroutine.wrap(f)`         | ✅  |  ✅  |   ⬜   |
| `coroutine.yield(...)`      | ✅  |  ✅  |   ⬜   |

---

## `debug` _(Luau)_

Reference: https://luau-lang.org/library#debug-library

Useful for game-author diagnostics — call-stack introspection, error
traces — but not narrative-flow-critical. Achievable since the inkjs
runtime already tracks a call stack.

| Method                                 | Lua | Luau | Status | Notes                                                                                                                                                    |
| -------------------------------------- | :-: | :--: | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug.info(level, options)`           | ❌  |  ✅  |   ✅   | Luau-only. Returns multi-value matching `options` codes: `s` (path), `l` (-1, no line info), `n` (leaf name), `a` (0), `f` (nil), `r` (-1, -1).          |
| `debug.traceback([message [, level]])` | ✅  |  ✅  |   ✅   | Returns the current call-stack dump (delegated to `CallStack.callStackTrace`). Optional `message` is prepended. `level` accepted for compat but ignored. |

---

## `task` _(Luau / Roblox)_

Reference: https://luau-lang.org/library#task-library

The Roblox task scheduler API. Depends on the coroutine scheduler
(above) and on the host providing a frame loop / delta-time. `task.wait`
could be modelled as story-time advance once that infra lands.

| Method                         | Lua | Luau | Status | Notes                                                               |
| ------------------------------ | :-: | :--: | :----: | ------------------------------------------------------------------- |
| `task.spawn(f, ...)`           | ❌  |  ✅  |   ⬜   | Schedules a coroutine. Blocked on `coroutine.*` infra.              |
| `task.defer(f, ...)`           | ❌  |  ✅  |   ⬜   | Resume-end-of-frame scheduling. Needs frame loop.                   |
| `task.delay(duration, f, ...)` | ❌  |  ✅  |   ⬜   | Schedule after wall-clock delay. Needs scheduler + wall-clock hook. |
| `task.wait([duration])`        | ❌  |  ✅  |   ⬜   | Yields the current coroutine. Blocked on `coroutine.*` infra.       |
| `task.cancel(thread)`          | ❌  |  ✅  |   ⬜   | Blocked on `coroutine.*` infra.                                     |

---

## `buffer` _(Luau)_

Reference: https://luau-lang.org/library#buffer-library

Mutable fixed-size byte arrays. Wraps `Uint8Array` underneath. Needs
a new `ValueType.Buffer` runtime value plus per-typed-op dispatch
(`readi8`, `readf64`, etc.). Mostly mechanical work — each read /
write op is a one-liner once the value type and a `DataView` helper
are in place.

| Method                                                                                             | Lua | Luau | Status |
| -------------------------------------------------------------------------------------------------- | :-: | :--: | :----: | ----------------------------------- |
| `buffer.create(size)`                                                                              | ❌  |  ✅  |   ⬜   |
| `buffer.fromstring(s)`                                                                             | ❌  |  ✅  |   ⬜   |
| `buffer.tostring(b)`                                                                               | ❌  |  ✅  |   ⬜   |
| `buffer.len(b)`                                                                                    | ❌  |  ✅  |   ⬜   |
| `buffer.copy(target, targetOff, src, srcOff?, count?)`                                             | ❌  |  ✅  |   ⬜   |
| `buffer.fill(b, off, value, count?)`                                                               | ❌  |  ✅  |   ⬜   |
| `buffer.readi8` / `readu8` / `readi16` / `readu16` / `readi32` / `readu32` / `readf32` / `readf64` | ❌  |  ✅  |   ⬜   | Byte / int / float reads at offset. |
| `buffer.writei8` / `writeu8` / ... `writef64`                                                      | ❌  |  ✅  |   ⬜   | Companion writes.                   |
| `buffer.readstring(b, off, count)`                                                                 | ❌  |  ✅  |   ⬜   |                                     |
| `buffer.writestring(b, off, s, count?)`                                                            | ❌  |  ✅  |   ⬜   |                                     |

---

## Globals (non-namespaced)

These are tagged by `LuauStdLibFunctions` in the grammar and registered
in `STDLIB` (StdLib.ts) as state-aware entries.

| Function                      | Lua | Luau | Status | Notes                                                                                                                                                                                                        |
| ----------------------------- | :-: | :--: | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assert(v [, message])`       | ✅  |  ✅  |   ✅   | Falsy `v` raises a runtime error via `story.AddError`. Lua truthiness: only `nil` and `false` are falsy (`0` and `""` pass).                                                                                 |
| `collectgarbage([opt])`       | ✅  |  ✅  |   ⛔   | No JS GC hook.                                                                                                                                                                                               |
| `error(message [, level])`    | ✅  |  ✅  |   ✅   | `level` arg ignored; force-ends the story. Sparkdown doesn't track call-frame depth.                                                                                                                         |
| `gcinfo()`                    | ❌  |  ✅  |   ⛔   | Luau-specific (Roblox GC stat). No JS equivalent.                                                                                                                                                            |
| `getfenv([f])`                | 5.1 |  ❌  |   ⛔   | Removed in Lua 5.2 and not in Luau. No first-class environments.                                                                                                                                             |
| `getmetatable(t)`             | ✅  |  ✅  |   ✅   | Returns `t`'s metatable, or its `__metatable` field if set (Luau metatable protection). Non-table args return nil.                                                                                           |
| `ipairs(t)`                   | ✅  |  ✅  |   ✅   | Generic-for iterator over consecutive integer keys starting at 1. Stops at first nil. Uses builtin-iterator dispatch (`__builtin_iter` marker).                                                              |
| `loadstring(s [, chunkname])` | 5.1 |  ✅  |   ⬜   | Removed in Lua 5.2 (use `load`); kept in Luau. Would need the sparkdown compiler embedded in the runtime to eval at runtime — large but tractable.                                                           |
| `newproxy([metatable])`       | 5.1 |  ✅  |   ✅   | Returns a fresh ObjectValue. `newproxy(true)` gives it an empty metatable; passing a table sets the new proxy's metatable to it.                                                                             |
| `next(t [, index])`           | ✅  |  ✅  |   ✅   | Returns the next key/value pair after `index` in insertion order, or nil when iteration ends.                                                                                                                |
| `pairs(t)`                    | ✅  |  ✅  |   ✅   | Generic-for iterator over every key in insertion order. Uses builtin-iterator dispatch (`__builtin_iter` marker).                                                                                            |
| `pcall(f, ...)`               | ✅  |  ✅  |   ✅   | Protected call. Catches `story.Error` thrown by stdlib (`assert`, `error`, etc.) and returns `(false, errMsg)`. Trapped errors don't surface to the host. Implementation: `Story.CallLuauFunctionProtected`. |
| `print(...)`                  | ✅  |  ✅  |   ✅   | Variadic; currently a no-op. Sparkdown's narrative runtime has no implicit stdout.                                                                                                                           |
| `rawequal(a, b)`              | ✅  |  ✅  |   ✅   | Strict `===` on underlying values; bypasses `__eq`.                                                                                                                                                          |
| `rawget(t, k)`                | ✅  |  ✅  |   ✅   | Bypasses `__index` — returns the field stored directly on `t`, or nil if absent.                                                                                                                             |
| `rawset(t, k, v)`             | ✅  |  ✅  |   ✅   | Bypasses `__newindex` — writes directly to `t`. Returns `t`.                                                                                                                                                 |
| `require(modname)`            | ✅  |  ✅  |   ⬜   | Sparkdown's `run "path"` covers .luau loading; `require` for module-return-values still TBD.                                                                                                                 |
| `select(n, ...)`              | ✅  |  ✅  |   ✅   | `select("#", ...)` → count (single int). `select(n, ...)` → multi-return tail starting at 1-indexed `n` (negative counts from end).                                                                          |
| `setfenv(f, table)`           | 5.1 |  ❌  |   ⛔   | Removed in Lua 5.2 and not in Luau.                                                                                                                                                                          |
| `setmetatable(t, mt)`         | ✅  |  ✅  |   ✅   | Attaches `mt` (or nil to clear) to `t`'s metatable slot. Errors if `t` is not a table, `mt` is neither nil nor a table, or `t`'s existing metatable carries `__metatable` (protection).                      |
| `tonumber(e [, base])`        | ✅  |  ✅  |   ✅   | Returns `nil` (null) on failure. Optional `base` arg for integer parsing.                                                                                                                                    |
| `tostring(v)`                 | ✅  |  ✅  |   ✅   |                                                                                                                                                                                                              |
| `type(v)`                     | ✅  |  ✅  |   ✅   | Returns `"nil"`/`"number"`/`"string"`/`"boolean"`/`"table"`/`"userdata"`.                                                                                                                                    |
| `typeof(v)`                   | ❌  |  ✅  |   ✅   | Luau-only. Currently identical to `type` (no userdata typeNames yet).                                                                                                                                        |
| `unpack(t [, i [, j]])`       | 5.1 |  ✅  |   ✅   | **Deprecated** — use `table.unpack(t, ...)`. Moved to `table.unpack` in Lua 5.2; the global is kept in Luau for compat.                                                                                      |
| `xpcall(f, msgh, ...)`        | ✅  |  ✅  |   ✅   | Protected call with custom message handler. On error, `msgh(errMsg)` runs (also via `CallLuauFunctionProtected` — if handler itself errors, the raw error is returned).                                      |

---

## Meta-methods

| Name                                                          | Lua  | Luau | Status | Notes                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | :--: | :--: | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__add`, `__sub`, `__mul`, `__div`, `__mod`, `__pow`, `__unm` |  ✅  |  ✅  |   ✅   | Arithmetic metamethods. Fire when either operand is a table; LHS metatable consulted first, then RHS. Function-form handlers dispatched via `story.CallLuauFunction`.                                                                                                     |
| `__idiv`                                                      | 5.3+ |  ✅  |   ⬜   | Floor-division metamethod (Lua 5.3+ / Luau). Sparkdown's grammar doesn't expose `//` yet.                                                                                                                                                                                 |
| `__concat`                                                    |  ✅  |  ✅  |   ⚠️   | Sparkdown maps `..` and `+` to the same runtime native (`Add`), so `__concat` and `__add` collapse — concat-style `t .. s` triggers `__add`. Acceptable trade-off until the lowerer keeps the ops distinct.                                                               |
| `__len`                                                       | 5.2+ |  ✅  |   ✅   | Unary `#t` consults the metatable before the built-in object-size path.                                                                                                                                                                                                   |
| `__eq`, `__lt`, `__le`                                        |  ✅  |  ✅  |   ✅   | `__eq` fires only when both operands are tables (Luau-fidelity). `>` / `>=` swap args and call `__lt` / `__le` respectively. `!=` inverts `__eq`.                                                                                                                         |
| `__index`, `__newindex`                                       |  ✅  |  ✅  |   ✅   | Table-form chains lookup (Lua-style class inheritance via `{__index = parent}`). Function-form calls `__index(t, key)` / `__newindex(t, key, val)`. Hooked at the `IndexValue` / `StoreIndex` bytecode ops and at the dotted-path variable-lookup fallback.               |
| `__call`                                                      |  ✅  |  ✅  |   ⚠️   | Closure-form handlers infer arg count from `__closure_user_arity`. Bare DivertTarget handlers default to "1 arg = self" — user args pushed at the call site stay on the eval stack. Authors needing multi-arg `__call` with a bare-knot handler should wrap as a closure. |
| `__tostring`                                                  |  ✅  |  ✅  |   ✅   | `tostring(t)` consults `__tostring` before the default representation. Non-string returns fall through to the default.                                                                                                                                                    |
| `__metatable`                                                 |  ✅  |  ✅  |   ✅   | When the metatable has `__metatable`, `getmetatable(t)` returns that field's value (instead of the real metatable) and `setmetatable(t, ...)` errors.                                                                                                                     |
| `__mode`                                                      |  ✅  |  ✅  |   ⛔   | Weak-table mode (`"k"`/`"v"`/`"kv"`). Needs GC hooks — no JS equivalent.                                                                                                                                                                                                  |
| `__iter`                                                      |  ❌  |  ✅  |   ⬜   | Luau-only. Would need generic-for to detect table-typed iter-expression and substitute with `__iter(t)`. Deferred.                                                                                                                                                        |

---

## Special cases (blocked on infra)

Categories that need infrastructure work before their remaining entries
can land in `STDLIB`:

- **Lua patterns — all phases (1–5) landed.** `string.find`,
  `string.match`, `string.gmatch`, `string.gsub` (string + table +
  function replacement forms) cover the full Lua-pattern surface
  including `%f[]` frontier, `()` position capture, and `%b{xy}`
  balanced match. Patterns translate via `luaPatternToJs` →
  `executeLuaPattern` (`inkjs/engine/LuaPatterns.ts`). Function-form
  `gsub` calls the user fn via `story.CallLuauFunction` per match.

- **Protected call (LANDED)** — `pcall` / `xpcall` use
  `Story.CallLuauFunctionProtected`: the Step loop runs in a
  try/catch over StoryException, AND watches `state.currentErrors`
  for any errors added without throwing. Trapped errors are
  truncated from the host's error list so they don't escape the
  protected block. **One caveat:** stdlib entries that use
  `story.AddError` (no throw) instead of `story.Error` (throws)
  trigger `state.ForceEnd()` which wipes the call stack — protection
  doesn't survive that. The fix is to use `story.Error` everywhere
  errors should be trappable; `assert` does this correctly today.

- **Callback dispatch from stdlib (LANDED)** —
  `Story.CallLuauFunction` lets a stdlib `fn(story, args)` invoke a
  sparkdown function value synchronously. Used by `table.sort`,
  `table.foreach`, `table.foreachi`, `string.gsub` (function form),
  and `xpcall`'s message handler.

- **Metatables (LANDED)** — `setmetatable` / `getmetatable` /
  `newproxy` plus `__index` / `__newindex` / `__add` / `__sub` /
  `__mul` / `__div` / `__mod` / `__pow` / `__unm` / `__len` / `__eq`
  / `__lt` / `__le` / `__call` / `__tostring` / `__metatable` all
  dispatch via the new `ObjectValue._metatable` slot. Known
  divergences flagged inline above: `__concat` collapses into
  `__add` because sparkdown maps `..` and `+` to the same runtime
  op; `__call` with bare-DivertTarget handlers can't infer arg
  count; `__iter` deferred until generic-for learns to substitute
  `__iter(t)` for a table-typed iter-expression.

- **Pure stdlib call-arg spread** — `math.max(math.modf(x))`
  doesn't spread modf's tuple because pure entries auto-mount on
  `NativeFunctionCall` (which takes a fixed arg count). Variadic
  pure fns would benefit from the same spread logic that the
  state-aware `RunStdLibFunction` dispatcher now applies. Marginal
  value — most pure fns are fixed-arity numerics.

- **DivertTarget-arg ink-builtins** (`count.turns(-> t)`,
  `count.visits(-> t)`) — stay on the legacy per-function
  `ControlCommand` path because they need compile-time setup in
  `FunctionCall.ResolveReferences` (marking the target container
  for visit-counting) that the generic dispatcher can't do.

---

## How to add a new entry

The single source of truth is the `STDLIB` table in
[`src/inkjs/engine/StdLib.ts`](src/inkjs/engine/StdLib.ts). Every
entry has `{arity, pure?, fn(story, args)}`.

### Pure (auto-mounted on `NativeFunctionCall`)

`pure` controls which `NativeFunctionCall` operand-type slots the
entry gets registered under. Names match Lua's `type()` return
values:

- `pure: true` — shorthand for `pure: ["number"]` (the classic
  numeric fast path used by `math.*`).
- `pure: ["string"]` — registered under `ValueType.String`. Used by
  substring predicates like `string.contains` / `string.trim`.
- `pure: ["number", "string"]` — registered under both.

```typescript
// numeric unary / binary:
"math.atan2": { arity: 2, pure: true, fn: (_, [y, x]) => Math.atan2(y, x) },

// arity 3+:
"math.clamp": { arity: 3, pure: true, fn: (_, [v, min, max]) => Math.min(Math.max(v, min), max) },

// variadic (`arity: -1`):
"math.max": {
  arity: -1,
  pure: true,
  fn: (_, args: number[]) => {
    let m = -Infinity;
    for (const n of args) if (n > m) m = n;
    return m;
  },
},

// pure string predicate:
"string.contains": {
  arity: 2,
  pure: ["string"],
  fn: (_, [s, sub]) => (coerceString(s) ?? "").includes(coerceString(sub) ?? ""),
},
```

Pure entries auto-mount at engine init, gaining the type-coercion
fast path. The fn takes raw JS values (auto-coerced by
NativeFunctionCall) and returns a JS value; the runtime handles
boxing the result via `Value.Create`. Arity rules:

- `arity` 1 or 2 → registered as 1- or 2-ary ops for each type slot.
- `arity` 3 or more → registered as n-ary ops; `CallType` spreads
  coerced values into the op.
- `arity: -1` (VARIADIC_ARITY) → registered with `VARIADIC_ARITY`;
  the FunctionCall call-site captures the actual arg count via the
  `@N` JSON suffix.

### State-aware / non-numeric

```typescript
tostring: { arity: 1, fn: (_, [v]) => stringify(v) },
assert: {
  arity: 2,
  fn: (story, [cond, msg]) => {
    if (!isTruthy(cond)) story.AddError(coerceString(msg) ?? "assertion failed");
  },
},
print: { arity: -1, fn: (_, _args) => { /* variadic, host-defined */ } },
```

State-aware entries (`pure` omitted/false) route through the generic
`RunStdLibFunction` ControlCommand dispatcher. The fn receives popped
eval-stack values (`IntValue` / `StringValue` / etc.); use the
coercion helpers `coerceNumber` / `coerceString` / `isTruthy` /
`luauTypeOf` to extract primitives. The dispatcher auto-wraps a
returned JS primitive via `Value.Create`.

### Marking an entry deprecated

If an entry is deprecated in upstream Luau, add a `deprecated` string
with the suggested replacement:

```typescript
"math.pow": {
  arity: 2,
  pure: true,
  deprecated:
    "`math.pow(a, b)` is deprecated in Luau. Use the `^` exponentiation operator instead (`a ^ b`).",
  fn: (_, [a, b]) => Math.pow(a, b),
},
```

The runtime still dispatches the call — we keep deprecated entries
for source compatibility with imported Luau code — but the lowerer
emits an Information-severity LSP diagnostic tagged
`DiagnosticTag.Deprecated` (= 2), which editors render
strikethrough.

### After adding the entry

1. Update this file's status table.
2. Add a runtime test (`src/tests/luau-conformance/Stdlib.test.ts` or
   the relevant feature test). For deprecated entries, also add a
   case in `src/tests/luau-conformance/DeprecatedStdLib.test.ts`.

No grammar, lowerer, or runtime-engine changes needed for entries
that fit the registry shape. Categories in the _Special cases_
section above need additional infra first.
