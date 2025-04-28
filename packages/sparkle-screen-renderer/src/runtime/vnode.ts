export interface VElement {
  tag: string | "fragment" | "children-slot" | "content-slot";
  props: Record<string, string>;
  children: VNode[];

  /** used for key diffing */
  key?: string;

  /** name of builtin this node originates from (if any) */
  builtin?: string;
  /** the pre-compiled <template> for that builtin */
  template?: HTMLTemplateElement;

  /* flags that tell us if node is meant to host certain dynamic data */
  contentAttr?: string;
  attrsHost?: true;
  classHost?: true;
}
export type VNode = string | VElement;
