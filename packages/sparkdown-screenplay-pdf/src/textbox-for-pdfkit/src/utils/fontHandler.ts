const fontKit = require("fontkit");

export const getFontAscent = (font: string, fontSize: number) => {
  let ascentPerPoint = 0;
  switch (font) {
    case "Courier":
    case "Courier-Bold":
    case "Courier-Oblique":
    case "Courier-BoldOblique":
      ascentPerPoint = 629 / 1000;
      break;
    case "Helvetica":
    case "Helvetica-Bold":
    case "Helvetica-Oblique":
    case "Helvetica-BoldOblique":
      ascentPerPoint = 718 / 1000;
      break;
    case "Times-Roman":
    case "Times-Bold":
    case "Times-Italic":
    case "Times-BoldItalic":
      ascentPerPoint = 683 / 1000;
      break;
    case "Symbol":
    case "ZapfDingbats":
      ascentPerPoint = 500 / 1000;
      break;
    default:
      const fontInfo = fontKit.openSync(font);
      ascentPerPoint =
        "fonts" in fontInfo
          ? (fontInfo.fonts[0]?.ascent ?? 0) /
            (fontInfo.fonts[0]?.unitsPerEm ?? 0)
          : fontInfo.ascent / fontInfo.unitsPerEm;
  }

  return fontSize * ascentPerPoint;
};
