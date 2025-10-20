const ENCODED_CHARS_REGEX = /#|"|\s+/g;

const encodeChar = (s: string) => (s == "#" ? "%23" : s === '"' ? "'" : " ");

export const encodeSVG = (svg: string) => {
  return svg.replace(ENCODED_CHARS_REGEX, encodeChar);
};

export const buildSVGSource = (svg: string) => {
  const mime = "image/svg+xml";
  const encoded = svg.replace(ENCODED_CHARS_REGEX, encodeChar);
  return `data:${mime},${encoded}`;
};
