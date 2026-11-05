import { readColor } from "../../../packages/sparkdown/src/morph/color";

const RULE_BLOCK = /([^{}]+)\{([^}]*)\}/g;
const BG_DECLARATION = /(?:^|[;\s])--bg:\s*([^;]+);/;
const THEME_SELECTOR = /^\[data-theme="([a-z-]+)"\]$/;
const THEME_COLOR_META =
  /(<meta name="theme-color" content=")[^"]*(" data-theme-colors=')[^']*(')/;

export const DEFAULT_DARK_THEME = "charcoal";

const hexChannel = (value: number) =>
  Math.round(value).toString(16).padStart(2, "0");

const opaqueHex = (value: string): string => {
  const read = readColor(value);
  if (read?.kind !== "color" || read.color[3] !== 1) {
    throw new Error(
      `--bg must be an opaque hex, rgb() or hsl() colour, not ${value}`,
    );
  }
  const [r, g, b] = read.color;
  return `#${hexChannel(r)}${hexChannel(g)}${hexChannel(b)}`;
};

export const themeColors = (themeCss: string): Record<string, string> => {
  const colors: Record<string, string> = {};
  for (const [, selectorList, body] of themeCss.matchAll(RULE_BLOCK)) {
    const value = body!.match(BG_DECLARATION)?.[1]?.trim();
    if (!value) {
      continue;
    }
    for (const selector of selectorList!.split(",")) {
      const theme = selector.trim().match(THEME_SELECTOR)?.[1];
      if (theme) {
        colors[theme] = opaqueHex(value);
      }
    }
  }
  if (!colors[DEFAULT_DARK_THEME]) {
    throw new Error(
      `The theme stylesheet declares no --bg for ${DEFAULT_DARK_THEME}`,
    );
  }
  return colors;
};

export const withThemeColor = (
  documentHtml: string,
  colors: Record<string, string>,
): string => {
  if (!THEME_COLOR_META.test(documentHtml)) {
    throw new Error(
      "The document has no theme-color meta tag with a data-theme-colors attribute",
    );
  }
  return documentHtml.replace(
    THEME_COLOR_META,
    `$1${colors[DEFAULT_DARK_THEME]}$2${JSON.stringify(colors)}$3`,
  );
};

export const withManifestColors = (manifest: string, color: string): string =>
  `${JSON.stringify(
    { ...JSON.parse(manifest), theme_color: color, background_color: color },
    null,
    2,
  )}\n`;
