import { Color } from "../types/color";

export const COLOR_REGEX =
  /^(fg|bg|neutral|primary|success|warning|danger|gray|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)$/;

export const isColor = (obj: unknown): obj is Color => {
  if (typeof obj !== "string") {
    return false;
  }
  return Boolean(obj.match(COLOR_REGEX));
};
