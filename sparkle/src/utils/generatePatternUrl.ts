export const generatePatternUrl = (
  shapes: {
    d: string;
    fill?: string;
    stroke?: string;
    strokeWeight?: number;
    strokeJoin?: string;
    strokeCap?: string;
  }[],
  angle = 0,
  zoom = 1,
  width = 32,
  height = 32
): string => {
  let paths = "";
  shapes.forEach(({ d, fill, stroke, strokeWeight, strokeJoin, strokeCap }) => {
    const validStroke = stroke ?? "#000";
    const validStrokeWeight = strokeWeight ?? 1;
    const validStrokeJoin = strokeJoin ?? "miter";
    const validStrokeCap = strokeCap ?? "round";
    const fillProp = fill ? `fill="${fill}" ` : "";
    const strokeProps = `stroke="${validStroke}" stroke-width="${validStrokeWeight}" stroke-linejoin="${validStrokeJoin}" stroke-linecap="${validStrokeCap}" `;
    const dProp = `d="${d}" `;
    paths += `<path ${strokeProps}${fillProp}${dProp}/>`;
  });
  const rotate = `rotate(${angle})`;
  const scale = `scale(${zoom})`;
  const patternTransform = `${scale} ${rotate}`;
  const svgOpen = `<svg id="patternId" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`;
  const defsOpen = `<defs>`;
  const patternOpen = `<pattern id="a" patternUnits="userSpaceOnUse" width="${width}" height="${height}" patternTransform="${patternTransform}">`;
  const patternClose = `</pattern>`;
  const defsClose = `</defs>`;
  const rect = `<rect width="100%" height="100%" fill="url(#a)"/>`;
  const svgClose = `</svg>`;
  const svg = `${svgOpen}${defsOpen}${patternOpen}${paths}${patternClose}${defsClose}${rect}${svgClose}`;
  return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
};
