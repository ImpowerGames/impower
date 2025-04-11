export const parseSVGViewBoxAttribute = (svgElement: SVGElement) => {
  const viewBoxAttr = svgElement.getAttribute("viewBox") || "";
  const parts = viewBoxAttr
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts && parts.length === 4 && parts.every((n) => !isNaN(n))) {
    const [, , width, height] = parts;
    if (width != null && height != null) {
      return { width, height };
    }
  }
  return { width: 0, height: 0 };
};
