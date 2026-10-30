import { type SparkRange } from "./SparkRange";

export interface Binding {
  exprId: string;
  source: string;
  span: SparkRange;
  params?: string[];
}

export type ContentPart =
  | { kind: "literal"; text: string }
  | { kind: "binding"; binding: Binding };

export type PropValue =
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "binding"; binding: Binding }
  | { kind: "content"; content: ContentPart[] };

export interface EventBinding {
  event: string;
  handler:
    | { kind: "ref"; name: string }
    | { kind: "call"; binding: Binding }
    | { kind: "closure"; binding: Binding };
}

export type BodyNode =
  | ElementNode
  | IfNode
  | ForNode
  | MatchNode
  | SlotNode
  | FillNode;

export type SparkleNode =
  | LayoutNode
  | ScreenNode
  | ComponentNode
  | StyleNode
  | AnimationNode
  | ThemeNode
  | BodyNode;

export interface LayoutNode {
  kind: "layout";
  name: string;
  extends?: string;
  screen?: string;
  children: BodyNode[];
}

export interface ScreenNode {
  kind: "screen";
  name: string;
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
  rules: unknown;
}

export interface AnimationNode {
  kind: "animation";
  name: string;
  keyframes: unknown;
}

export interface ThemeNode {
  kind: "theme";
  name: string;
  tokens: unknown;
}

export interface ElementNode {
  kind: "element";
  tag: string;
  classes: string[];
  name?: string;
  content?: ContentPart[];
  props: Record<string, PropValue>;
  events: EventBinding[];
  params?: PropValue[];
  children: BodyNode[];
}

export interface IfNode {
  kind: "if";
  branches: { condition: Binding; children: BodyNode[] }[];
  else?: BodyNode[];
}

export interface ForNode {
  kind: "for";
  bindings: string[];
  numeric?: { from: Binding; to: Binding; step?: Binding };
  each?: Binding;
  key?: Binding;
  children: BodyNode[];
  else?: BodyNode[];
}

export interface MatchNode {
  kind: "match";
  expr: Binding;
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
