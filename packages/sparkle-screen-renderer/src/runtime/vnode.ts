export interface VElement {
  tag: string | "fragment" | "children-slot" | "content-slot";
  props: Record<string, string>;
  children: VNode[];

  key?: string;

  builtin?: string;
  template?: HTMLTemplateElement;

  contentAttr?: string;
  attrsHost?: true;
  classHost?: true;
}
export type VNode = string | VElement;
