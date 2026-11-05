import { readColor } from "../../../packages/sparkdown/src/morph/color";

const ROOT_BLOCK = /:root\b[^{]*\{([^}]*)\}/;
const BG_DECLARATION = /(?:^|[;\s])--bg:\s*([^;]+);/;
const THEME_COLOR_META = /(<meta name="theme-color" content=")[^"]*(")/;

const hexChannel = (value: number) =>
  Math.round(value).toString(16).padStart(2, "0");

export const themeColor = (themeCss: string): string => {
  const value = themeCss
    .match(ROOT_BLOCK)?.[1]
    ?.match(BG_DECLARATION)?.[1]
    ?.trim();
  if (!value) {
    throw new Error("The theme stylesheet declares no --bg on :root");
  }
  const read = readColor(value);
  if (read?.kind !== "color" || read.color[3] !== 1) {
    throw new Error(`--bg must be an opaque hex, rgb() or hsl() colour, not ${value}`);
  }
  const [r, g, b] = read.color;
  return `#${hexChannel(r)}${hexChannel(g)}${hexChannel(b)}`;
};

export const withThemeColor = (documentHtml: string, color: string): string => {
  if (!THEME_COLOR_META.test(documentHtml)) {
    throw new Error("The document has no theme-color meta tag");
  }
  return documentHtml.replace(THEME_COLOR_META, `$1${color}$2`);
};

export const withManifestColors = (manifest: string, color: string): string =>
  `${JSON.stringify(
    { ...JSON.parse(manifest), theme_color: color, background_color: color },
    null,
    2,
  )}\n`;
