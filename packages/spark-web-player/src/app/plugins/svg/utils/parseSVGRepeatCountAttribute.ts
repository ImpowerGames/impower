export const parseSVGRepeatCountAttribute = (
  animateElement: SVGAnimateElement | SVGElement
): number => {
  const repeatCountAttr = animateElement.getAttribute("repeatCount");
  const repeatCount =
    repeatCountAttr == null
      ? 1
      : repeatCountAttr === "indefinite"
      ? Infinity
      : Number(repeatCountAttr);
  return repeatCount;
};
