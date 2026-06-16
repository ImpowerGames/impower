# Reactive Sparkle UI — Language & Engine Specification

**Status:** Draft for review · v1 · 2026-06-16
**Scope:** the `screen` / `component` / `style` / `animation` / `theme` sublanguage of Sparkdown ("Sparkle"), made fully reactive.
**Audience of the *language*:** non-technical game authors. **Audience of *this doc*:** us.

> This is a design spec, not yet an implementation. Sections marked **[DECISION]** are
> genuine forks with a recommendation; please redline. Sections marked **[DIVERGES]**
> change behaviour that exists in the repo today and imply a migration.

---

## 1. Goal & principles

Authors describe UI as a readable, indented outline; the engine keeps it in sync with
game state automatically. From the existing Sparkle docs, the promises we are committing to:

- **Interpolation auto-updates:** `text "You have {player.hp} HP"` re-renders whenever
  `player.hp` changes — no author wiring.
- **Events do things:** `button "Use" @click=use_item` runs game logic.
- **Control flow is dynamic:** `if` / `for` / `match` add and remove UI as state changes.
- **Structure first, style second:** the tree says *what/where*; `style` blocks say *how it looks*.
- **Built for games, not webpages:** menus, HUDs, dialogs, inventories.

Design principles that constrain every decision below:

1. **Engine-side reactivity.** The reactive graph and the element tree live in the engine
   (TypeScript, beside the Luau interpreter). The renderer is a dumb executor of an
   abstract message protocol. This is what lets the same logic target DOM today and Unity
   UI Toolkit / USS later. No browser API, no `new Function`, in the reactive core.
2. **Luau is the only expression language.** Every `{expr}`, condition, iterable, and event
   handler is compiled and evaluated through the Luau interpreter, never JS.
3. **Encode structure in the grammar, not the lowerer** (the codebase "Golden Rule"):
   `elseif`/`else` are grouped *under* their `if`; `case` *under* its `match`. No
   render-time sibling-index walking.
4. **Reuse the canonical styling vocabulary.** Selectors, breakpoints, prop→CSS come from
   `sparkle-style-transformer` + `spark-dom`. We write zero new copies (the old prototype
   forked them — see §13).

---

## 2. Where this sits in the pipeline

```
.sd source
  │  grammar (definitions/yaml/sparkdown.language-grammar.yaml)
  ▼
parse tree
  │  lowerer (packages/sparkdown/src/compiler/lower/lowerers/lowerLuauUI.ts, …)
  ▼
Sparkle AST  +  compiled Luau binding expressions     ← §6 (this is the new artifact)
  │  engine (packages/spark-engine/.../ui/UIModule.ts)
  ▼
reactive element tree  ──emits──▶  ElementMessage protocol  ── consumed by ──▶ renderer
                                   (Create/Update/Destroy/Observe/Move)         · web: spark-web-player UIManager → DOM
                                                                                · unity (future): VisualElement + USS
```

Today the lowerer flattens UI bodies to a **static** struct in `program.context`, and the
engine builds the DOM once. The reactive version preserves the dynamic parts of the body as
compiled expressions + binding descriptors, and the engine re-evaluates them when their
dependencies change. See the companion roadmap; v1 ships on the existing `program.context`
path and migrates to runtime Luau objects only after reactivity is verified.

---

## 3. Locked decisions (from prior discussion)

| # | Decision | Source |
|---|----------|--------|
| L1 | Block header is `keyword NAME [as PARENT] with … end`. `as` = inherits. | current grammar + formatter |
| L2 | `screen` / `component` / `style` / `animation` / `theme` are top-level keywords (not `define`). | grammar |
| L3 | Reactivity is **engine-side**, emitting the `ElementMessage` protocol. | this session |
| L4 | Expressions evaluate through **Luau**, not JS. | this session |
| L5 | Build grammar + lowerer **from scratch**; the `sparkle-screen-renderer` prototype is **reference only**. | user, this session |
| L6 | **One-way** binding (`{expr}` → UI). Form controls write back only via explicit `@input` / `@change`. | user, this session |
| L7 | `@event=` accepts a **named fn**, a **call with args**, **and an inline closure** `{ … }`. | user, this session |
| L8 | Reactive runtime is a **full rewrite** of the prototype runtime (see audit). | review verdict, this session |

---

## 4. Surface syntax

### 4.1 Block headers

```
screen    NAME [as PARENT] with … end
component NAME [as PARENT] with … end
style     NAME [as PARENT] with … end
animation NAME with … end
theme     NAME with … end
```

- `NAME` is a Luau identifier (snake_case recommended for authors).
- `as PARENT` makes this block inherit from another block of the same kind, or from a
  builtin root (`as button`, `as screen`).
- Body indentation is significant and preserved by the formatter.

### 4.2 Element lines

The atom of a `screen`/`component` body is an **element line**:

```
<tag>[.class[.class…]] [ "content {interp}" ] [ #prop=value … ] [ @event=handler … ] [:]
```

- **`tag`** — a builtin (`text`, `button`, `row`, `image`, …; §7) or an authored
  `component`. A bare authored component name renders that component (`my_card` ≡ `my_card()`).
- **`.class`** — dotted CSS classes that `style` blocks target (`button.primary.large`).
  Tag-as-class: the tag name is itself a class, so `style button with …` styles every button.
- **`"content"`** — quoted text content (for text-like elements) or `src`/value for
  `image`/`mask`. May contain `{interp}` (§4.4). Exactly one content string per line.
- **`#prop=value`** — an inline style/attribute (the inline equivalent of a `style` rule).
  `value` is a literal, a `"quoted string"`, or `{expr}` for a dynamic value.
- **`@event=handler`** — an event binding (§4.5).
- **trailing `:`** — opens a child block; children are the more-indented lines below.
  Leaf elements omit the `:`.

> **[DECISION D1] Container delimiter.** Two consistent options for "this element has
> children": **(a)** trailing `:` (matches the current `.sd` fixtures and the old docs,
> explicit, already formatter-friendly), or **(b)** pure indentation, no colon (a recorded
> earlier preference: "nest by indentation only"). **Recommend (a)** — the `:` is cheap,
> disambiguates leaf vs container locally, and is already what real fixtures use.

Example:

```
screen inventory with
  column.panel #gap=16:
    text.title "Inventory"
    row:
      button "Use"  @click=use_item
      button "Drop" @click=drop_item
end
```

### 4.3 Named structural elements

A leading name turns a generic container into a named, styleable node (this is the
dialogue/stage pattern the production `ui.sd` uses):

```
screen main with
  stage:
    backdrop:
      image "black"
    portrait:
      mask shadow_1
      image
end
```

`stage` / `backdrop` / `portrait` are builtin structural styles (§7). `mask shadow_1` is a
`mask` element carrying class `shadow_1`. `image "black"` is an `image` whose source is
`black`.

> **[DIVERGES — D2] Content delimiter.** The wired struct grammar writes element content as
> `image = "black"` (a `key = value` property). The (dead) element grammar and the docs use
> adjacency: `image "black"`. **Recommend adjacency** (`tag "content"`) — it reads better,
> matches the docs non-technical users will see, and cleanly separates *content* (quoted,
> positional) from *props* (`#k=v`) and *events* (`@e=h`). This re-migrates the existing
> `ui.sd` (the migration pipeline already exists). `=` stays for `style` properties and
> `#prop=value` inline props.

### 4.4 Interpolation

`{ luau_expression }` inside content or a prop value is a **reactive binding**:

```
text "Level {player.level} — {player.hp}/{player.max_hp} HP"
image  src={player.portrait}
row    #background-color={team_color}
```

- The braces' contents are compiled as a Luau expression and re-evaluated when any state it
  reads changes (§8). A content string may mix literal text and multiple `{…}` spans.
- **Literal braces:** `{{` and `}}` emit literal `{` / `}`. (Needed because some CSS/struct
  values legitimately contain braces.)

> **[DECISION D3] Brace policy.** Confirm `{…}` = reactive Luau, `{{`/`}}` = literal. The
> alternative (require a sigil like `${…}` for dynamic) is more explicit but noisier and
> contradicts the docs. **Recommend `{…}` reactive.**

### 4.5 Events

```
button "Save"   @click=save                      # named function
button "Hit"    @click=take_damage(10)           # call with arguments
button "Reset"  @click={ score = 0; combo = 0 }  # inline closure (statements)
field           @input={ name = event.value }    # closure reading the event
```

- **Handler forms** (per L7): a bare function name, a call `fn(args)`, or an inline
  closure `{ statements }`. All three compile to a Luau callable.
- Inside an inline closure, `event` is in scope (the DOM/Unity event payload: `event.value`,
  `event.checked`, `event.key`, …). Loop/`for` bindings and component params are also in scope.
- Running a handler mutates Luau state; the engine then flushes affected bindings in the same
  turn (§8). Handler errors are trapped (`CallLuauFunctionProtected`) and surfaced as a
  diagnostic — they never abort the story.

> **[DECISION D4] First-class events for v1.** Recommend `click`, `input`, `change`,
> `submit`, `focus`, `blur`, `keydown`. Others pass through as raw event names. Confirm the set.

### 4.6 Control flow

Per the recorded preference, logic uses **Luau keywords** (not colon blocks), so one mental
model spans function bodies and UI:

```
if player.dead then
  text "GAME OVER"
elseif player.hp < 10 then
  text.warning "Low health!"
else
  text "HP: {player.hp}"
end

for item in player.inventory do
  row:
    text "{item.name}"
    button "Use" @click={ use_item(item) }
else
  text "Your bag is empty."
end

match player.class do
case "knight"
  text "⚔ Knight"
case "mage"
  text "✦ Mage"
else
  text "Adventurer"
end
```

- **`if` / `elseif` / `else` / `end`** — `elseif`/`else` are grammar children of the `if`.
- **`for <bindings> in <expr> do … [else …] end`** — one binding = value; two = `key, value`
  (over a table). The optional `else` renders when the iterable is empty.
- **`match <expr> do  case <value> …  [else …]  end`** — `case` arms are grammar children of
  the `match`; first match wins; `else` is the default. (`match` aligns with Sparkdown's
  existing `match` if present; otherwise it is defined here for UI.)

> **[DECISION D5] Control-flow delimiter.** Recommend Luau keywords (`then`/`do`/`end`) as
> above (recorded earlier choice). The old docs/prototype use colon+indent (`if x:`). Keyword
> form is more consistent with Sparkdown logic but visually heavier than the docs. Confirm.

> **[DECISION D6] Numeric repeat.** The prototype had `repeat n` (exposing `index`). Luau's
> `repeat … until` would clash. Recommend dropping `repeat` in favour of Luau numeric `for`:
> `for i = 1, n do … end`. Confirm.

### 4.7 Components & slots

```
component stat_row(label, value) with
  row.stat:
    text.label "{label}"
    text.value "{value}"
end

component card(title) with
  box.card:
    text.card_title "{title}"
    slot            # default slot: where children passed to <card> land
    slot footer     # named slot
end

screen sheet with
  card "Inventory":
    text "10 / 20 slots"      # fills the default slot
    fill footer:
      button "Sort" @click=sort_bag
end
```

- **Parameters** `component name(p1, p2)` are in scope inside the body as reactive values.
- **`slot [name]`** marks where caller-provided children render. **`fill [name]`** (caller
  side) targets a named slot; unnamed children fill the default slot. Unmatched fills emit a
  diagnostic (the prototype silently dropped them).

### 4.8 `style`, `animation`, `theme`

`style` blocks keep the CSS-like body that exists today (this part is already good):

```
style dialogue with
  height = 100%
  @screen-size(sm):
    width = 100%
  > text:
    color = black
    font-size = 3cqh
end
```

- `key = value` properties; `> selector:` nested rules; `@pseudo`/`@breakpoint:` directives.
- Selectors, pseudo-aliases (`@hovered`→`:hover`), breakpoints, and `prop→CSS` come from
  `spark-dom`/`sparkle-style-transformer` (§7).
- Style values are evaluated **once** at compile/first-render (they rarely change per frame).
  Dynamic styling is expressed inline on elements (`#prop={expr}`) or via toggled classes,
  not by re-running `style` blocks. *(v1 scope.)*

`animation` and `theme` keep their current struct shape; they are static authoring config and
not reactive in v1.

---

## 5. The styling vocabulary (reference, not redefined)

The single sources of truth, imported — never copied:

- `packages/sparkle-style-transformer/src/constants/STYLE_TRANSFORMERS.ts` — ~130 canonical
  props (layout, corner, border, anchor, spacing, flex/grid children, text*, background*,
  effects, transform, transition, animation, form-control CSS vars).
- `STYLE_ALIASES.ts` / `CSS_ALIASES.ts` — short forms (`c`,`m`,`p`,`w`,`h`,`bg-color`,…) and
  web-name aliases (`display`→`displayed`, `gap`→`child-gap`).
- `packages/spark-dom/src/utils/getStyleContent.ts` — `getCSSSelector` (pseudo-aliases, `>>`
  descendant, `#a=v`→`[a=v]`, breakpoints), `getStyleContent` (struct→CSS).
- `getCssEquivalent` — prop→CSS, including 1→many expansions.

**Bindable (dynamic) surfaces:** element text/content, `value`/`checked`/`src`, and any
numeric/color style prop (`width`, `opacity`, `text-color`, `translate`, …).
**Static surfaces:** selectors, pseudo-aliases, breakpoints, `animation`/`theme`/`font` defs.

> **[BUG — B1] Breakpoint mismatch.** `getStyleContent.DEFAULT_BREAKPOINTS` is
> `xs400 sm600 md960 lg1280 xl1920`, but `uiBuiltinDefinitions().config.ui.breakpoints` is
> `xs400 sm640 md768 lg1024 xl1280`. These must be one source of truth. **Recommend** the
> engine `config.ui.breakpoints` wins and `getStyleContent` takes them as a parameter (it
> already accepts a `breakpoints` arg — just always pass the engine's).

> **[DECISION D7] Inline `#prop` vocabulary.** Inline props should use the same names as
> `style` props (sparkle spelling, `-`/`_` both accepted). Recommend de-aliasing inline props
> to canonical names at lower time (as Phase-1 `style` already does). Confirm.

---

## 6. The AST (typed, discriminated union)

Replaces the prototype's untyped `SparkleNode { args: Record<string, any> }` (which let
real bugs compile — e.g. reading a never-written `args.base`). Every dynamic value is a
**compiled Luau expression handle**, not a raw string.

```ts
/** A compiled Luau expression + the source span, produced by the lowerer.
 *  `evaluate(scope)` runs it through the interpreter; `deps` is filled by the
 *  reactive runtime via read-tracking (§8), not the compiler. */
interface Binding {
  exprId: string;        // handle into the compiled-expression table
  source: string;        // original text, for diagnostics
  span: Span;
}

/** Text/content = ordered literal + binding spans ("Lv {a} of {b}"). */
type ContentPart = { kind: "literal"; text: string } | { kind: "binding"; binding: Binding };

type PropValue =
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "binding"; binding: Binding };

interface EventBinding {
  event: string;                 // "click" | "input" | ...
  handler:
    | { kind: "ref"; name: string }                 // @click=save
    | { kind: "call"; binding: Binding }            // @click=take(10)
    | { kind: "closure"; binding: Binding };        // @click={ ... }
}

type SparkleNode =
  | ScreenNode | ComponentNode | StyleNode | AnimationNode | ThemeNode  // roots
  | ElementNode
  | IfNode | ForNode | MatchNode
  | SlotNode | FillNode;

interface ScreenNode    { kind: "screen";    name: string; extends?: string; children: BodyNode[] }
interface ComponentNode { kind: "component"; name: string; extends?: string; params: string[]; children: BodyNode[] }
interface StyleNode     { kind: "style";     name: string; extends?: string; rules: StyleRule[] }
interface AnimationNode { kind: "animation"; name: string; /* keyframes/timing struct */ }
interface ThemeNode     { kind: "theme";     name: string; /* token struct */ }

type BodyNode = ElementNode | IfNode | ForNode | MatchNode | SlotNode | FillNode;

interface ElementNode {
  kind: "element";
  tag: string;                   // builtin or component name
  classes: string[];             // dotted classes
  name?: string;                 // leading structural name (stage/backdrop/…)
  content?: ContentPart[];       // "..." with interpolation
  props: Record<string, PropValue>;
  events: EventBinding[];
  params?: PropValue[];          // component call args: my_card(x, y)
  children: BodyNode[];
}

interface IfNode {
  kind: "if";
  branches: { condition: Binding; children: BodyNode[] }[];  // [if, elseif, elseif…]
  else?: BodyNode[];
}
interface ForNode {
  kind: "for";
  bindings: string[];            // [value] | [key, value] | numeric [i]
  numeric?: { from: Binding; to: Binding; step?: Binding };
  each?: Binding;                // table/list source (omitted for numeric)
  key?: Binding;                 // explicit item key for reconciliation (else identity/index)
  children: BodyNode[];
  else?: BodyNode[];             // rendered when empty
}
interface MatchNode {
  kind: "match";
  expr: Binding;
  cases: { value: Binding; children: BodyNode[] }[];
  else?: BodyNode[];
}
interface SlotNode { kind: "slot"; name?: string }
interface FillNode { kind: "fill"; name?: string; children: BodyNode[] }
```

Notes:
- **Branches are nested** (`IfNode.branches`, `MatchNode.cases`) — the grammar groups them;
  the lowerer never reconstructs control flow from sibling position.
- `Binding` is the *only* carrier of author Luau; the reactive runtime tracks its deps.

---

## 7. Builtins inventory

Two existing inventories must be reconciled. The **engine** (`uiBuiltinDefinitions.ts`)
defines structural styles used by the running game; the **prototype** defined widget
templates. v1 builtins = the union the reactive screens need.

**Structural / text (exist as engine styles today):** `screen`, `stage`, `backdrop`,
`portrait`, `choices`, `choice`, `textbox` (+ `textbox_background`, `textbox_content`),
`character_info`/`character_name`/`character_parenthetical`, `title`, `heading`,
`transitional`, `dialogue`, `action`, `continue_indicator`, `row`, `column`, `stack`,
`overlay`, `text`, `stroke`, `image`, `mask`, `object`, `loading_bar`/`loading_fill`.

**Layout/text generic:** `box` (generic container), `span`, `scroller`, `label`, `divider`.

**Interactive widgets (NEW — prototype-only today, need engine styles + templates):**
`button`, `link`, `field`/`input` (text), `slider` (range), `checkbox`, `dropdown`/`option`.

Each builtin declares its **surfaces**:

| builtin | content surface | value/checked surface | notes |
|---|---|---|---|
| `text`, `stroke`, `label`, `span` | text | — | content = text node |
| `image`, `mask` | `src` | — | content = image source |
| `button`, `link` | text | — | + `@click` |
| `field`/`input` | label text | `value` (one-way; write-back via `@input`) | |
| `slider` | label text | `value`,`min`,`max` → `--_fill-percentage` (computed engine-side, **not** an inline `oninput`) | |
| `checkbox` | label text | `checked` (write-back via `@change`) | |
| `dropdown`/`option` | label / option text | selected value | |
| `box`,`row`,`column`,`stack`,`scroller`,`overlay` | — (children) | — | layout containers |

> **[DECISION D8] Widget builtins source.** The new interactive widgets need engine-side
> default styles (in `uiBuiltinDefinitions.ts`) and structural templates. **Recommend**
> porting the prototype's `builtins.ts` HTML templates into engine builtin *definitions*
> (data, not DOM) so both web and Unity can realize them. Confirm scope for v1 (e.g. ship
> `button`/`field`/`checkbox`/`slider` first; `dropdown` later).

---

## 8. Reactivity contract

### 8.1 What is reactive

Each dynamic author construct becomes one **effect**:

- a `{interp}` in content/prop → re-emits a targeted `UpdateElement{content|style|attributes}`;
- an `if`/`match` → mounts/unmounts the selected branch (`Create`/`Destroy`);
- a `for` → keyed list reconciliation (`Create`/`Destroy`/`Move`);
- an `@event` → on fire, runs the Luau handler, then flushes.

### 8.2 Dependency tracking (engine-side)

When an effect evaluates its `Binding` through the Luau interpreter, the runtime records
which state it read; on the next change to that state, only that effect re-runs.

- **Reads** are captured at the two interpreter read paths (global read; table-field index
  read). **Writes** invalidate at the two write paths (global `SetGlobal`; terminal
  table-field set).
- **The missing primitive:** table-field writes (`player.hp = 5`) fire **no** notification
  today (whole-global reassignment is the only existing signal). v1's hard prerequisite is a
  fine-grained change emitter at those write sites. *(Interim fallback: re-evaluate all
  bindings of a shown screen on the existing per-turn `onDidContinue` boundary — correct but
  coarse; upgrade to per-field tracking for performance.)*

> **[DECISION D9] Start coarse or fine?** Recommend shipping P1–P3 on the coarse
> `onDidContinue` re-eval (no interpreter surgery), then add the fine-grained change bus once
> the end-to-end path is proven. Confirm.

### 8.3 Flush boundary

Effects re-run in the engine's existing coalescing window
(`StartVariableObservation`/`CompleteVariableObservation`, drained just before
`onDidContinue`). An `@event` handler that fires outside a `Continue` burst is wrapped in its
own observation bracket so its writes coalesce and flush once. Effects run in dependency
order, at most once per turn — no glitches, no feedback loops.

### 8.4 Keyed list reconciliation

`for` maintains `key → { itemScope, mountedNodeIds }`. On change: create new keys, destroy
missing keys, **move** retained keys (don't rebuild) — preserving focus/scroll/IME/animation.
This requires a `Move` op in the protocol (see §9). The prototype's positional differ is
explicitly **not** carried (it corrupts on variable-length fragments).

---

## 9. Emit target (the message protocol)

The reactive runtime emits abstract, id-keyed deltas — never DOM ops. The existing protocol
(`packages/spark-engine/.../ui/classes/messages/`) is the right foundation and we keep it:

- `CreateElement { parent, element(id), type, name, content, style, attributes }`
- `UpdateElement { element(id), content?, style?, attributes? }`
- `DestroyElement { element(id) }`
- `ObserveElement { element(id), event, stopPropagation, once }` → `EventMessage` back
- `MoveElement { element(id), parent, beforeId? }` — **NEW**, for keyed `for` reorders.

A web `UIManager` turns these into DOM; a future Unity manager turns them into
`VisualElement` + `IStyle`. **The protocol assessment (2026-06-16) confirms the id-keyed
element-tree shape maps cleanly onto Unity** (`id→VisualElement` dict,
`Add`/`RemoveFromHierarchy`, `RegisterCallback`) — that is the protocol's biggest asset, and
the user's original instinct (renderer behind a message protocol so Unity reuses the stream)
is sound. Three sets of findings reshape how we build on it.

### 9.1 Reshape BEFORE the reactive layer (cheap now, wide migration later)

Verdict: **restructure-before-reactive.** Transport is currently a *direct in-process
synchronous call* (the worker boundary is an unimplemented TODO), so per-message cost is ~0
today — you cannot profile it. The decision is against the FUTURE worker/Unity serialization
cost, which the reactive layer's per-binding volume will hit hard. Four changes, each already
justified by today's code:

1. **[D11] Batch envelope.** Add one `ui/batch { messages: UIMessage[] }` *notification*
   carrying an ordered array of existing op params (reuse `CreateElementParams` etc. tagged
   with their method — do **not** invent a new op union yet; add `move` only when keyed `for`
   needs it). Flush boundary = a **synchronous emit burst** (end of the current call stack /
   microtask), **NOT** the per-beat flush: `text.write`/`image.write` straddle
   `await animateElements()` (`UIModule.ts:1099-1106`), so creates and post-animation destroys
   are different time slices. Precedent exists twice: `AnimateElementsMessage.effects[]` and
   `audio/update` (`UpdateAudioPlayersMessage`).
2. **[D12] Notifications, not requests (+ fixes a real leak).** Create/Update/Destroy/Observe/
   Unobserve return nothing the engine uses (it mints ids itself). Make them notifications
   (folding into the batch does this automatically). This also fixes a **live bug**: `observe`/
   `unobserve` never send a response, so their resolve/reject callbacks in `Connection`
   (`Connection.ts:128-151`) **leak forever per observed element** — reactive observe churn
   multiplies it. Keep `AnimateElements` (and `audio/update`) as real requests.
3. **[D13] Consumer id→element map.** `UIManager.getElement` does `querySelector('#'+id)`
   per op (`UIManager.ts:29-34`). Replace with a `Map<id, element>` populated on create,
   deleted on destroy. O(1), free correctness, and the only lookup primitive that ports to
   Unity (there is no `querySelector` in UI Toolkit).
4. **[D10 — revised] Keep style structured on the wire; name it `StyleMap`.** Correction to
   the earlier draft: per-element `style` is *already* a typed `Record<string,string|number|null>`
   — the cssText is built consumer-side (`UIManager.ts:57-71`). So nothing to "convert"; the
   action is to **preserve that seam** (it's exactly where a USS transformer slots in) and
   **name the type `StyleMap`** now, so the reactive layer is authored against it and the
   vocabulary can be tightened later (§9.2) as a *type-only* change. Also drop the per-element
   `breakpoints` field (duplicated on every Create/Update today) — carry it once via
   `SetThemeMessage`.

Plus a **bug fix regardless [B2]:** `setEventListener` (`UIModule.ts:854-862`) emits the same
`{style}` UpdateElement **twice** per observed element.

*Explicitly NOT done now (premature for small trees):* hoisting `getCssEquivalent`'s alias
tables — opportunistic cleanup, not a pre-reactive gate.

#### 9.1.1 Text (and instructions) realized renderer-side — [D14]

Today the engine (`UIModule.Text.process`, `UIModule.ts:941-1035`) turns a typewriter
`TextInstruction[]` into hundreds of DOM spans (`text_line`/`text_word`/`text_space`/
`text_letter`), emitting one `CreateElement` **per glyph** plus a per-glyph reveal animation —
the single highest-volume UI path and the source of the §9.2 inline-layout port risk.

**Decision:** ship the `TextInstruction[]` over the wire and let each renderer realize it.
A new `ui/write-text { target, instructions: TextInstruction[], instant }` (or a unified
`ui/instructions`) replaces the per-glyph emission. The **web** consumer owns the
span/whitespace/text-align decomposition + the per-char reveal (move `process()` +
`getAnimationDefinition`/`enqueueAnimation` out of `spark-engine/UIModule` into
`spark-web-player/UIManager`, backed by `spark-dom` helpers). A **Unity** consumer builds a
`TextElement`/label and drives the reveal from the per-char `after`/`over`/`ease` timing
(rich-text tags cover bold/italic/color; the inline-span layout never crosses the wire).

Why this is the right shape:
- **Follows the existing audio precedent.** `audio/update` already ships an `AudioInstruction[]`
  and lets the audio manager build players; text should mirror it. The interpreter's output is
  already `Instructions { text/image/audio: Record<target, Instruction[]> }` — we forward that
  semantic output instead of pre-building DOM.
- **Biggest message-volume win available.** One message per text write instead of N per-glyph
  creates **and** N per-glyph animations (the reveal is driven from the timing already inside
  each instruction).
- **Removes the §9.2 #1 port risk** by relocating the inline-layout heuristic to the web
  consumer (where `display:inline` is fine); it no longer needs a USS analog.
- `image: Record<target, ImageInstruction[]>` is the analogous next candidate; do text first
  (highest volume + the named risk).

Caveats: (a) the engine stops minting per-letter ids / a per-letter virtual sub-tree — confirmed
safe: only the `text_*` style defs + the builder reference those names, and the engine targets
the `text`/`stroke` content element and rebuilds it wholesale; (b) the `stroke` faux-outline
duplicate is built consumer-side from the same instructions; (c) `TextInstruction.style` still
carries web-leaning fields (`inset`/`white_space`/`display`/`animation_*`) — neutralize
alongside the §9.2 `StyleMap` work, though the shape is already mostly portable; (d) this also
dissolves the await-straddle batch-boundary worry for text (the consumer owns text's
create→reveal→swap lifecycle), so text rides its own message, not the §9.1 `ui/batch`.

#### 9.1.2 Generalize: instructions realized renderer-side, structure stays abstract — [D15]

The D14 pattern generalizes to every *time-sequenced content stream* the interpreter emits per
beat (`Instructions { text, image, audio, load }`):
- **audio** already does this (`UpdateAudioPlayersMessage` ships `AudioInstruction[]`; the audio
  manager builds players) — the precedent.
- **text** = D14.
- **image** = next: `image.write` (`UIModule.ts:1529`) currently builds web-only DOM in the
  engine (layered images, background/mask spans, `> *` `translate: calc(0.5*(100cqw-100%))`
  centering, crossfade between layers). Ship `ImageInstruction[]`; the renderer builds it (web:
  background-image spans; Unity: VisualElement background / sprite). Same Unity win as text.
- **load** = forward `LoadInstruction[]` so the renderer owns preloading (web `<img>`/audio
  buffer warmup vs Unity asset load).

**Boundary — do NOT convert structure to instructions.** The screen/component *element tree*
stays on the abstract id-keyed element protocol (`Create/Update/Destroy/Observe/Move/Batch`) —
that IS the renderer-neutral representation and the protocol's biggest Unity asset. `style`
blocks become structured style rules (§9.2); `choices` are structural (buttons + events). The
test: *a persistent addressable thing* → element protocol; *a timed content sequence poured into
a target* → instruction array. After text + image land, the only genuinely web-locked piece left
is the `<style>` stylesheet-string cascade (§9.2).

Optionally collapse the per-type content messages into one per-beat
`ui/instructions { text?, image?, audio?, load? }` later (the interpreter already produces that
object). Don't unify now — per-type messages mirroring audio keep blast radius small;
consolidate once text+image+load all use the pattern.

### 9.2 Defer until Unity is a real consumer (seams placed now → type-only change later)

Genuinely Unity-shaped, touches the most code; doing it speculatively is premature:

- **Neutral style vocabulary:** normalize web-only values (`inset`→`top/right/bottom/left`,
  never `display:inline`, `url()`/`linear-gradient()`, `mask_image`). The **#1 Unity-port
  risk** is `Text.process`'s inline-span text layout (`UIModule.ts:982-1026`) — it relies on
  `display:inline`/`inline-block` + whitespace collapsing, which has **no USS analog** —
  **resolved by [D14]** (ship `TextInstruction[]`; the web consumer does span layout, Unity
  builds a text element), so this stops being an engine-emitted concern.
- **Structured stylesheet rules, not a CSS string.** `style` blocks today become a hidden
  `<style>` element whose textContent is a full stylesheet (`getStyleContent`: descendant
  combinators, `:hover`, `@media`/`@container`, `&`-nesting). **Unity cannot compile an
  arbitrary runtime stylesheet string**; USS lacks `@media`/`@container`/`&`-nesting/attribute
  selectors. This is the one part that does *not* port at all. Replace with
  `DefineStyleRules { rules: { selector:{classes,state?,breakpoint?}, declarations: StyleMap }[] }`;
  web reassembles `getStyleContent` from it, Unity maps class+state to `AddToClassList` against
  a pre-authored `.uss`. Isolated to `define…as style`; not a prerequisite for the reactive
  element/binding layer.
- **Type keyframes** as `{offset, style: StyleMap}[]` (today `any[]`); move fonts to a typed
  `RegisterFont` message (Unity loads font assets, not `@font-face`).
- **Resolve breakpoints engine-side** (Unity has no media queries).
- **Pin the event vocabulary** to pointer/keyboard/focus/wheel with documented Unity mappings;
  deprecate `mouse*` aliases.

---

## 10. Compiler responsibilities

The lowerer (rewritten from scratch, L5) must:

1. Parse element lines, control flow, slots via **new grammar rules** (activate/replace the
   dead `LuauUIElement`/`LuauUIAttribute`/`LuauUIContent`; add `if/for/match/slot/fill`).
   Preserve `LuauStructBodyLine`'s leading-indent capture the formatter relies on.
2. Produce the typed AST (§6).
3. Compile every `{expr}`, condition, iterable, `case` value, and `@event` handler into a
   Luau expression/closure (reuse the working display-text path
   `lowerExpressionFromContainer` / `LuauInterpolatedStringExpression`, which UI bodies
   currently bypass), yielding `Binding` handles.
4. De-alias inline `#prop` names to canonical sparkle names (D7).
5. Keep comment semantics correct in UI bodies (`--` is the comment; `//` is floor-division —
   inverse of display context).

---

## 11. Worked examples (proposed syntax)

**HUD (interpolation):**
```
screen hud with
  row.hud #gap=12:
    text "❤ {player.hp}/{player.max_hp}"
    text "⛀ {player.gold}"
end
```

**Settings (events + form controls, one-way):**
```
screen settings with
  column.menu #gap=16:
    text.title "Settings"
    slider   "Master Volume" #min=0 #max=100 value={volume} @input={ volume = event.value }
    checkbox "Mute Music" checked={music_muted} @change={ music_muted = event.checked }
    row #gap=16 #child-justify=space-between:
      button "Back"  @click=go_back
      button "Apply" @click=save_settings
end
```

**Inventory (control flow + keyed list):**
```
screen inventory with
  column.panel #gap=8:
    text.title "Inventory"
    for item in player.bag do
      row.item:
        image src={item.icon} #width=32 #height=32
        text "{item.name}"
        if item.equipped then
          text.tag "(equipped)"
        end
        button "Use" @click={ use_item(item) }
    else
      text.empty "Your bag is empty."
    end
end
```

---

## 12. Open decisions (consolidated)

| ID | Decision | Recommendation |
|----|----------|----------------|
| D1 | Container child delimiter | trailing `:` |
| D2 | Content delimiter `tag "x"` vs `tag = "x"` | adjacency `tag "x"` (re-migrates ui.sd) |
| D3 | `{…}` reactive, `{{`/`}}` literal | yes |
| D4 | First-class event set | click/input/change/submit/focus/blur/keydown |
| D5 | Control-flow delimiter | Luau keywords (`then`/`do`/`end`) |
| D6 | `repeat n` → numeric `for` | drop `repeat`, use `for i = 1, n do` |
| D7 | Inline `#prop` de-aliased to canonical | yes |
| D8 | Widget builtins scope for v1 | port templates as data; ship button/field/checkbox/slider first |
| D9 | Coarse `onDidContinue` re-eval first, fine-grained later | yes |
| D10 | Style on wire | already a typed map — keep structured, name it `StyleMap` |
| D11 | Batch envelope (`ui/batch`) | yes — flush on synchronous emit burst, not per-beat |
| D12 | Ops → notifications (not requests) | yes — also fixes the observe/unobserve callback leak |
| D13 | Consumer id→element map | yes — replace `querySelector('#id')` |
| D14 | Ship `TextInstruction[]`, realize text renderer-side | yes — one msg/write, kills per-glyph emission + the #1 Unity risk |
| D15 | Generalize instructions to `image`+`load` (audio done); structure stays on element protocol | yes — image next after text; unified per-beat envelope optional later |
| B1 | Reconcile breakpoint sets | engine `config.ui.breakpoints` wins |
| B2 | Duplicate UpdateElement emit in `setEventListener` | fix regardless |
| B3 | observe/unobserve never resolve → `Connection` callback leak | fix via D12 |

---

## 13. Divergences & migration impact

- **[DIVERGES]** Content via adjacency (D2) re-migrates `ui.sd` element content from
  `image = "x"` to `image "x"`. Scriptable via the existing migration pipeline.
- **[DIVERGES]** Element bodies stop being opaque `LuauStructBodyLine` text and gain real
  grammar nodes. The formatter must keep treating these blocks as indentation-significant;
  UI format snapshots (`screen-tree`/`component-tree`/`style-block`) will change.
- **Delete, don't fork:** remove the prototype's `css.ts` (a byte-for-byte fork of
  `getCSSSelector`); import from `spark-dom`. Kill the dead `populateUI`/`program.ui`/
  `VIEW_DEFINE_TYPES` bridge (never populated) or repurpose it for the new AST.

## 14. Non-goals (v1)

- Two-way binding (L6 — one-way + explicit handlers only).
- Reactive `style`/`animation`/`theme` blocks (static authoring config).
- Unity renderer (protocol must stay portable, but no Unity code in v1).
- Grid layout where Unity USS can't follow (deferred until USS supports it).
```
