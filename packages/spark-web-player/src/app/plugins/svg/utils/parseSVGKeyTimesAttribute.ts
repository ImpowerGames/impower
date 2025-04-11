export const parseSVGKeyTimesAttribute = (
  animateElement: SVGAnimateElement | SVGElement
): number[] => {
  const valuesAttr = animateElement.getAttribute("values");
  const keyTimesAttr = animateElement.getAttribute("keyTimes") || "";
  const values = valuesAttr?.split(";") ?? [0];
  const keyTimes = keyTimesAttr
    ? keyTimesAttr.split(";").map((numStr) => Number(numStr))
    : values.map((_, i) => i / values.length);
  return keyTimes;
};
