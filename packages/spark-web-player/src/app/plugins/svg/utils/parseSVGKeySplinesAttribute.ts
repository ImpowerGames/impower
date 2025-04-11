export const parseSVGKeySplinesAttribute = (
  animateElement: SVGAnimateElement | SVGElement
): [number, number, number, number][] => {
  const valuesAttr = animateElement.getAttribute("values") || "";
  const keySplinesAttr = animateElement.getAttribute("keySplines") || "";
  const values = valuesAttr.split(";");
  const keySplines = keySplinesAttr
    ? keySplinesAttr
        .split(";")
        .map(
          (spline) =>
            spline.split(" ").map((numStr) => Number(numStr)) as [
              number,
              number,
              number,
              number
            ]
        )
    : values.map(() => [0, 0, 1, 1] as [number, number, number, number]);
  return keySplines;
};
