import Graphic from "../types/graphic.js";

const REGEX_ARG_SEPARATOR = /[ ]+/;

const QUOTE_REGEX = /([\\]["]|["])/g;

const normalizeQuotes = (str: string): string => {
  return str.replace(QUOTE_REGEX, "'");
};

const getAttribute = (str: string, name: string): string | undefined => {
  const regex = new RegExp(`${name}[ ]*=[ ]*[']([^']+)[']`);
  const matches = str.match(regex);
  if (!matches) {
    return undefined;
  }
  return matches[1];
};

const parseGraphic = (value: string): Graphic => {
  const v = normalizeQuotes(value).trim();
  const svgString = v.slice(v.indexOf("<svg "), v.indexOf("</svg>") + 1);
  const graphic: Graphic = {};
  svgString.split("<path ").forEach((token) => {
    if (token.startsWith("<svg ")) {
      const viewBox = getAttribute(token, "viewBox") || "";
      const [_x, _y, vWidth, vHeight] = viewBox.split(REGEX_ARG_SEPARATOR);
      const width = getAttribute(token, "width");
      const height = getAttribute(token, "height");
      graphic.width = width || vWidth;
      graphic.height = height || vHeight;
    } else {
      const d = getAttribute(token, "d");
      const fill = getAttribute(token, "fill");
      const stroke = getAttribute(token, "stroke");
      const strokeWidth = getAttribute(token, "stroke-width");
      const strokeLinejoin = getAttribute(token, "stroke-linejoin");
      const strokeLinecap = getAttribute(token, "stroke-linecap");
      if (!graphic.shapes) {
        graphic.shapes = [];
      }
      graphic.shapes.push({
        d,
        fill,
        stroke,
        strokeWidth,
        strokeLinejoin,
        strokeLinecap,
      });
    }
  });
  return graphic;
};

export default parseGraphic;
