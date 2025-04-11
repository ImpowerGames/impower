export const parseSVGValuesAttribute = (
  animateElement: SVGAnimateElement | SVGElement
): string[] => {
  const valuesAttr = animateElement.getAttribute("values") || "";
  const values = valuesAttr.split(";");
  return values;
};
