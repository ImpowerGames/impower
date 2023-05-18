import Graphic from "../types/graphic.js";

const generateCSSGraphic = (
  graphic: Graphic,
  args: string[]
): { graphic: Graphic; angle: number; zoom: number } => {
  const angleIndex = args.findIndex((v) => v.endsWith("deg"));
  const angleValue = Number(args[angleIndex]?.replace("deg", ""));
  const angle = !Number.isNaN(angleValue) ? angleValue : 0;
  const zoomIndex = args.findIndex((v) => v.endsWith("%"));
  const zoomValue = Number(args[zoomIndex]?.replace("%", ""));
  const zoom = !Number.isNaN(zoomValue) ? zoomValue / 100 : 1;
  const strokeIndex = args.findIndex(
    (v) => !Number.isNaN(Number(v)) || v.endsWith("px")
  );
  const strokeWidthValue = Number(args[strokeIndex]?.replace("px", ""));
  const strokeWidth = !Number.isNaN(strokeWidthValue)
    ? strokeWidthValue
    : undefined;
  const colorsIndex = Math.max(0, angleIndex, zoomIndex, strokeIndex) + 1;
  const colors = colorsIndex < args.length ? args.slice(colorsIndex) : [];
  return {
    graphic: {
      ...graphic,
      shapes: graphic.shapes?.map((s, i) => ({
        ...s,
        stroke: s.stroke ? colors[i] ?? s.stroke : s.stroke,
        strokeWidth: s.stroke ? strokeWidth ?? s.strokeWidth : s.strokeWidth,
      })),
    },
    angle,
    zoom,
  };
};

export default generateCSSGraphic;
