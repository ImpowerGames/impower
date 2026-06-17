import { type SparkRange } from "./SparkRange";

/**
 * The reactive Sparkle UI AST (spec §6: docs/sparkle/reactive-sparkle-spec.md).
 *
 * Produced by the lowerer alongside the static `screens`/`components`/`styles`
 * channels (which stay until the reactive runtime consumes this AST). Replaces
 * the prototype's untyped `SparkleNode { args: Record<string, any> }`.
 *
 * Every dynamic value is a {@link Binding} — a handle to a compiled Luau
 * expression — never a raw string. The reactive runtime (Phase 3+) fills each
 * binding's `deps` via read-tracking; the compiler only produces the handle.
 */

/**
 * A compiled Luau expression + its source span, produced by the lowerer.
 * `exprId` indexes the compiled-expression table the runtime evaluates;
 * `source` is the original author text, kept for diagnostics.
 */
export interface Binding {
  exprId: string;
  source: string;
  span: SparkRange;
  /**
   * Enclosing `for`-loop variable names (outermost-first) the evaluator takes as
   * parameters, present only for bindings lowered inside a `for` loop. The
   * evaluator is `__binding_N(<params…>) return <expr> end`; the reactive runtime
   * passes each iteration's loop values as args (loop locals can't be read as
   * globals — see {@link LowerContext.sparkleLoopVars}). Omitted (nullary) for
   * top-level bindings.
   */
  params?: string[];
}

/** Text/content = ordered literal + binding spans (`"Lv {a} of {b}"`). */
export type ContentPart =
  | { kind: "literal"; text: string }
  | { kind: "binding"; binding: Binding };

/** An inline `#prop=value`: a literal, or a `{expr}` reactive binding. */
export type PropValue =
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "binding"; binding: Binding };

/** An `@event=handler` binding. */
export interface EventBinding {
  /** Canonical event name: "click" | "input" | "change" | ... */
  event: string;
  handler:
    | { kind: "ref"; name: string } // @click=save
    | { kind: "call"; binding: Binding } // @click=take(10)
    | { kind: "closure"; binding: Binding }; // @click={ ... }
}

/** Body-level nodes that can appear inside a screen/component element tree. */
export type BodyNode =
  | ElementNode
  | IfNode
  | ForNode
  | MatchNode
  | SlotNode
  | FillNode;

/** Root block nodes + body nodes. */
export type SparkleNode =
  | ScreenNode
  | ComponentNode
  | StyleNode
  | AnimationNode
  | ThemeNode
  | BodyNode;

export interface ScreenNode {
  kind: "screen";
  name: string;
  extends?: string;
  children: BodyNode[];
}

export interface ComponentNode {
  kind: "component";
  name: string;
  extends?: string;
  params: string[];
  children: BodyNode[];
}

export interface StyleNode {
  kind: "style";
  name: string;
  extends?: string;
  /** Style rules stay a structured map (D10); kept opaque here for v1. */
  rules: unknown;
}

export interface AnimationNode {
  kind: "animation";
  name: string;
  /** Keyframes/timing struct (static authoring config, not reactive in v1). */
  keyframes: unknown;
}

export interface ThemeNode {
  kind: "theme";
  name: string;
  /** Token struct (static authoring config, not reactive in v1). */
  tokens: unknown;
}

export interface ElementNode {
  kind: "element";
  /** Builtin tag (text/button/row/image/…) or an authored component name. */
  tag: string;
  /** Dotted CSS classes (`button.primary.large`). */
  classes: string[];
  /** Leading structural name (`stage`/`backdrop`/…), if any. */
  name?: string;
  /** Quoted content with interpolation; absent for content-less elements. */
  content?: ContentPart[];
  /** Inline `#prop=value` style/attribute props, keyed by canonical name. */
  props: Record<string, PropValue>;
  events: EventBinding[];
  /** Component-call args (`my_card(x, y)`), if this tag is a component call. */
  params?: PropValue[];
  children: BodyNode[];
}

export interface IfNode {
  kind: "if";
  /** [if, elseif, elseif…] — grammar-grouped, never reconstructed from siblings. */
  branches: { condition: Binding; children: BodyNode[] }[];
  else?: BodyNode[];
}

export interface ForNode {
  kind: "for";
  /** [value] | [key, value] | numeric [i]. */
  bindings: string[];
  /** Numeric `for i = from, to[, step]`; mutually exclusive with `each`. */
  numeric?: { from: Binding; to: Binding; step?: Binding };
  /** Table/list source (omitted for numeric form). */
  each?: Binding;
  /** Explicit item key for reconciliation; else identity/index (Phase 4). */
  key?: Binding;
  children: BodyNode[];
  /** Rendered when the iterable is empty. */
  else?: BodyNode[];
}

export interface MatchNode {
  kind: "match";
  expr: Binding;
  /** `case` arms — grammar-grouped; first match wins. */
  cases: { value: Binding; children: BodyNode[] }[];
  else?: BodyNode[];
}

export interface SlotNode {
  kind: "slot";
  name?: string;
}

export interface FillNode {
  kind: "fill";
  name?: string;
  children: BodyNode[];
}
