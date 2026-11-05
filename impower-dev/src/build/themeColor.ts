const ROOT_BLOCK = /:root\b[^{]*\{([^}]*)\}/;
const BG_DECLARATION = /(?:^|[;\s])--bg:\s*([^;]+);/;
const HEX = /^#[0-9a-f]{6}$/i;
const HSL = /^hsl\(\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/;
const THEME_COLOR_META = /(<meta name="theme-color" content=")[^"]*(")/;

const channel = (value: number) =>
  Math.round(value * 255)
    .toString(16)
    .padStart(2, "0");

const hslToHex = (hue: number, saturation: number, lightness: number) => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  return `#${channel(r + offset)}${channel(g + offset)}${channel(b + offset)}`;
};

export const themeColor = (themeCss: string): string => {
  const value = themeCss
    .match(ROOT_BLOCK)?.[1]
    ?.match(BG_DECLARATION)?.[1]
    ?.trim();
  if (!value) {
    throw new Error("The theme stylesheet declares no --bg on :root");
  }
  if (HEX.test(value)) {
    return value.toLowerCase();
  }
  const hsl = value.match(HSL);
  if (!hsl) {
    throw new Error(`--bg must be a hex or hsl() colour, not ${value}`);
  }
  return hslToHex(
    Number(hsl[1]),
    Number(hsl[2]) / 100,
    Number(hsl[3]) / 100,
  );
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
