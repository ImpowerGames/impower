/*!
 * svelte-svg-patterns <https://github.com/catchspider2002/svelte-svg-patterns>
 *
 * Copyright (c) 2021 pattern.monster
 * Released under the MIT license.
 *
 * Website: https://pattern.monster
 */

import { Pattern } from "../types/Pattern";

export const generatePatternSvg = (
  pattern: Pattern,
  id: string = "a",
  width: number | string = "100%",
  height: number | string = "100%"
): string => {
  const zoom = pattern.zoom;
  const angle = pattern.angle;
  const fillColor = pattern.colors[0] || "#00000000";
  const strokeColors = pattern.colors.slice(1);
  const graphic = pattern.graphic;
  const graphicWidth = graphic.width ?? 32;
  const graphicHeight = graphic.height ?? 32;
  const graphicPaths = graphic.paths || [];
  const x = graphic.transform?.position?.x || 0;
  const y = graphic.transform?.position?.y || 0;
  const strokeWeight = graphic.stroke?.on
    ? graphic.stroke.weight
    : pattern.weight;
  const strokeJoin = graphic.stroke?.on ? graphic.stroke.join : "miter";
  const strokeCap = graphic.stroke?.on ? graphic.stroke.cap : "round";
  let paths = "";
  graphicPaths.forEach((d, i) => {
    const index = i % strokeColors.length;
    let color = strokeColors[index] || "#FFFFFF";
    const transform =
      x !== 0 || y !== 0 ? `transform="translate(${x},${y})` : "";
    const stroke = `stroke="${color}" fill="none" stroke-width="${strokeWeight}" stroke-linejoin="${strokeJoin}" stroke-linecap="${strokeCap}"`;
    paths += `<path d="${d}" ${transform} ${stroke}/>`;
  });
  const svgOpen = `<svg id="patternId" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  const defsOpen = `<defs>`;
  const patternOpen = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${graphicWidth}" height="${graphicHeight}" patternTransform="scale(${zoom}) rotate(${angle})">`;
  const fill = `<rect x="0" y="0" width="100%" height="100%" fill="${fillColor}"/>`;
  const patternClose = `</pattern>`;
  const defsClose = `</defs>`;
  const rect = `<rect width="100%" height="100%" fill="url(#${id})"/>`;
  const svgClose = `</svg>`;
  return `${svgOpen}${defsOpen}${patternOpen}${paths}${patternClose}${defsClose}${fill}${rect}${svgClose}`;
};
