export interface VElement {
  tag: string;
  props: Record<string, string>;
  children: VNode[];
  /** diff-only metadata – never rendered to the DOM */
  key?: string;
  contentAttr?: string;
  attrsHost?: true;
  classHost?: true;
}
export type VNode = string | VElement;
