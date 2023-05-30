import Graphic from "../types/graphic.js";

const REGEX_SINGLE_QUOTE = /[(')]/g;

const encodeSvg = (svg: string) => {
  const normalizedSvg = svg.replace(REGEX_SINGLE_QUOTE, '"');
  const encodedSvg = encodeURIComponent(normalizedSvg);
  return `url('data:image/svg+xml,${encodedSvg}')`;
};

const generateGraphicUrl = (
  pattern: Graphic,
  tiling: boolean,
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
        const fillProp = validFill ? `fill='${validFill}'` : "";
        const strokeProp = validStroke ? `stroke='${validStroke}'` : "";
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
        const dProp = validD ? `d='${validD}'` : "";
        paths += `<path ${fillProp} ${strokeProp} ${strokeLineProps} ${dProp}/>`;
      }
    );
  }
  if (tiling) {
    const rotate = `rotate(${angle ?? 0})`;
    const scale = `scale(${zoom ?? 1})`;
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

export default generateGraphicUrl;
