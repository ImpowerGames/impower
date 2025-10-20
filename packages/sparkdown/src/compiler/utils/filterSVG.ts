import { Node, parse, stringify, traverse } from "../../txml/txml";
import { filterMatchesName } from "./filterMatchesName";

export const filterSVG = (
  svg: string,
  filter: { includes: unknown[]; excludes: unknown[] },
  filterableTag = "filter",
  defaultTag = "default"
) => {
  const document = parse(svg);
  traverse(document, (n: Node, index, _d, _p, parent) => {
    if (typeof n === "object" && n) {
      const id = n.attributes["id"];
      if (id && filterMatchesName(id, filter, filterableTag, defaultTag)) {
        if (parent && typeof parent === "object") {
          parent.children[index] = null;
        }
      }
    }
  });
  return stringify(document, { quote: "'", selfClosingTags: ["path"] });
};
