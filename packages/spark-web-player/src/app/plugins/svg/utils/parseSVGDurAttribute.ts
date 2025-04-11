export const parseSVGDurAttribute = (
  animateElement: SVGAnimateElement | SVGElement
): number => {
  const durAttr = animateElement.getAttribute("dur") || "";
  const dur = durAttr.trim();
  const ms = dur.endsWith("ms")
    ? Number(dur.replace("ms", ""))
    : dur.endsWith("s")
    ? Number(dur.replace("s", "")) * 1000
    : 0;
  const durationInSeconds = ms / 1000;
  return durationInSeconds;
};
