// Types for the vendored idiomorph.js. Covers the surface this package uses:
// `Idiomorph.morph`, with the callbacks it passes.

export interface IdiomorphCallbacks {
  beforeNodeAdded?: (node: Node) => boolean | void;
  afterNodeAdded?: (node: Node) => void;
  beforeNodeMorphed?: (oldNode: Node, newNode: Node) => boolean | void;
  afterNodeMorphed?: (oldNode: Node, newNode: Node) => void;
  beforeNodeRemoved?: (node: Node) => boolean | void;
  afterNodeRemoved?: (node: Node) => void;
  beforeAttributeUpdated?: (
    attributeName: string,
    node: Element,
    mutationType: "update" | "remove",
  ) => boolean | void;
}

export interface IdiomorphOptions {
  morphStyle?: "innerHTML" | "outerHTML";
  ignoreActive?: boolean;
  ignoreActiveValue?: boolean;
  head?: {
    style?: "merge" | "append" | "morph" | "none";
    block?: boolean;
    ignore?: boolean;
    shouldPreserve?: (element: Element) => boolean;
    shouldReAppend?: (element: Element) => boolean;
    shouldRemove?: (element: Element) => boolean;
    afterHeadMorphed?: (head: Element, options: unknown) => void;
  };
  callbacks?: IdiomorphCallbacks;
}

declare const Idiomorph: {
  morph(
    oldNode: Node,
    newContent: Node | string,
    options?: IdiomorphOptions,
  ): Node[] | undefined;
  defaults: IdiomorphOptions;
};

export default Idiomorph;
