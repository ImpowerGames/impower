import { Graphic } from "../types/Graphic";

export const generateGraphicSvg = (graphic: Graphic): string => {
  const pattern = graphic?.pattern;
  const width = graphic?.width ?? 32;
  const height = graphic?.height ?? 32;
  const shapes = graphic?.shapes || [];
  let paths = "";
  shapes.forEach(
    ({
      path,
      fillColor,
      fillOpacity,
      strokeColor,
      strokeOpacity,
      strokeWeight,
      strokeJoin,
      strokeCap,
    }) => {
      const validFillColor = fillColor ?? "none";
      const validFillOpacity = fillOpacity ?? 1;
      const validStrokeColor = strokeColor ?? "none";
      const validStrokeOpacity = strokeOpacity ?? 1;
      const validStrokeWeight = strokeWeight ?? 1;
      const validStrokeJoin = strokeJoin ?? "miter";
      const validStrokeCap = strokeCap ?? "round";
      const fill = `fill="${validFillColor}" fill-opacity="${validFillOpacity}"`;
      const stroke = `stroke="${validStrokeColor}" stroke-opacity="${validStrokeOpacity}" stroke-width="${validStrokeWeight}" stroke-linejoin="${validStrokeJoin}" stroke-linecap="${validStrokeCap}"`;
      paths += `<path d="${path}" ${fill} ${stroke}/>`;
    }
  );
  if (pattern) {
    const translateX = graphic?.transform?.position?.x ?? 0;
    const translateY = graphic?.transform?.position?.y ?? 0;
    const rotateZ = graphic?.transform?.rotation?.z ?? 0;
    const scaleX = graphic?.transform?.scale?.x ?? 1;
    const scaleY = graphic?.transform?.scale?.y ?? 1;
    const scaleZ = graphic?.transform?.scale?.z ?? 1;
    const translate = `translate(${translateX} ${translateY})`;
    const rotate = `rotate(${rotateZ})`;
    const scale = `scale(${scaleX * scaleZ} ${scaleY * scaleZ})`;
    const patternTransform = `${translate} ${rotate} ${scale}`;
    const svgOpen = `<svg id="patternId" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`;
    const defsOpen = `<defs>`;
    const patternOpen = `<pattern id="a" patternUnits="userSpaceOnUse" width="${width}" height="${height}" patternTransform="${patternTransform}">`;
    const patternClose = `</pattern>`;
    const defsClose = `</defs>`;
    const rect = `<rect width="100%" height="100%" fill="url(#a)"/>`;
    const svgClose = `</svg>`;
    return `${svgOpen}${defsOpen}${patternOpen}${paths}${patternClose}${defsClose}${rect}${svgClose}`;
  }
  const svgOpen = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  const svgClose = `</svg>`;
  return `${svgOpen}${paths}${svgClose}`;
};
