import { DOMParser, Element, Node } from "@xmldom/xmldom";

const populateChildren = (root: Element) => {
  const result: Element[] = [];
  const traverse = (node: Node) => {
    if ("tagName" in node) {
      (node as any).children = Array.from(node.childNodes).filter(
        (c) => "tagName" in c
      );
    }
    // Traverse all child nodes
    for (const child of node.childNodes) {
      traverse(child);
    }
  };
  traverse(root);
  return result;
};

const makeSVGParserCompatible = (root: Element) => {
  populateChildren(root);
  (root as any).querySelectorAll = <K extends keyof SVGElementTagNameMap>(
    selectors: K
  ): NodeListOf<SVGElementTagNameMap[K]> => {
    return root.getElementsByTagName(selectors) as unknown as NodeListOf<
      SVGElementTagNameMap[K]
    >;
  };
  return root as unknown as SVGElement;
};

export const parseSVG = (svg: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const svgEl = makeSVGParserCompatible(doc.documentElement!);
  return svgEl;
};
