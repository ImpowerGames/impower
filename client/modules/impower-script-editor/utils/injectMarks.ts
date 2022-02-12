import { Element } from "../classes/Element";
import { TreeElement } from "../classes/TreeElement";

export function injectMarks(
  elements: (Element | TreeElement)[],
  marks: Element[]
): (Element | TreeElement)[] {
  if (!marks.length) {
    return elements;
  }
  if (!elements.length) {
    return marks;
  }
  const elts = elements.slice();
  let eI = 0;
  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i];
    while (eI < elts.length && elts[eI].to < mark.to) eI += 1;
    if (eI < elts.length && elts[eI].from < mark.from) {
      const e = elts[eI];
      if (e instanceof Element)
        elts[eI] = new Element(
          e.type,
          e.from,
          e.to,
          injectMarks(e.children, [mark])
        );
    } else {
      elts.splice((eI += 1), 0, mark);
    }
  }
  return elts;
}
