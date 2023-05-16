import { Graphic } from "../types/graphic";

const REGEX_ENCODE_CHARS = /[(#)]/g;

const encodeSvg = (svg: string) =>
  `url("data:image/svg+xml,${svg.replace(REGEX_ENCODE_CHARS, (c) =>
    encodeURIComponent(c)
  )}")`;

export const generateGraphicUrl = (
  pattern: Graphic,
  tiling = true,
  angle = 0,
  zoom = 1
): string => {
  let paths = "";
  const width = pattern.width;
  const height = pattern.height;
  const shapes = pattern.shapes;
  if (shapes) {
    shapes.forEach(
      ({ d, fill, stroke, strokeWidth, strokeLinejoin, strokeLinecap }) => {
        const validD = d ?? "";
        const validFill = fill ?? "none";
        const validStroke = stroke ?? "black";
        const validStrokeLineCap = strokeLinecap ?? "round";
        const fillProp = `fill='${validFill}'`;
        const strokeProp = `stroke='${validStroke}'`;
        const strokeWidthProp = strokeWidth
          ? `stroke-width='${strokeWidth}' `
          : "";
        const strokeLineJoinProp = strokeLinejoin
          ? `stroke-linejoin='${strokeLinejoin}' `
          : "";
        const strokeLineCapProp = validStrokeLineCap
          ? `stroke-linecap='${validStrokeLineCap}'`
          : "";
        const strokeLineProps = `${strokeWidthProp}${strokeLineJoinProp}${strokeLineCapProp}`;
        const dProp = `d='${validD}'`;
        paths += `<path ${fillProp} ${strokeProp} ${strokeLineProps} ${dProp}/>`;
      }
    );
  }
  if (tiling) {
    const rotate = `rotate(${angle})`;
    const scale = `scale(${zoom})`;
    const patternTransform = `${rotate} ${scale}`;
    const svgOpen = `<svg id='patternId' width='100%' height='100%' xmlns='http://www.w3.org/2000/svg'>`;
    const defsOpen = `<defs>`;
    const patternOpen = `<pattern id='a' patternUnits='userSpaceOnUse' width='${width}' height='${height}' patternTransform='${patternTransform}'>`;
    const patternClose = `</pattern>`;
    const defsClose = `</defs>`;
    const rect = `<rect width='100%' height='100%' fill='url(#a)'/>`;
    const svgClose = `</svg>`;
    const svg = `${svgOpen}${defsOpen}${patternOpen}${paths}${patternClose}${defsClose}${rect}${svgClose}`;
    return encodeSvg(svg);
  }
  const svgOpen = `<svg width='${width}' height='${height}' xmlns='http://www.w3.org/2000/svg'>`;
  const svgClose = `</svg>`;
  const svg = `${svgOpen}${paths}${svgClose}`;
  return encodeSvg(svg);
};
