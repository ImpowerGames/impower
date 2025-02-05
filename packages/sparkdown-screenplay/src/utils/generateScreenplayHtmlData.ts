import ScreenplayTypesetter from "../classes/ScreenplayTypesetter";
import { STATIC_CSS } from "../constants/STATIC_CSS";
import { STATIC_FONTS } from "../constants/STATIC_FONTS";
import { STATIC_HTML } from "../constants/STATIC_HTML";
import { ScreenplayConfig } from "../types/ScreenplayConfig";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { encodeBase64 } from "./encodeBase64";
import { generateScreenplayMainHtml } from "./generateScreenplayMainHtml";
import { generateScreenplayTitleHtml } from "./generateScreenplayTitleHtml";

export const generateScreenplayHtmlData = (
  tokens: ScreenplayToken[],
  config?: ScreenplayConfig,
  fonts?: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  }
): string => {
  let rawHtml: string = STATIC_HTML;

  const typesetter = new ScreenplayTypesetter();
  const spans = typesetter.compose(tokens, config);

  if (fonts && Object.keys(fonts).length > 0) {
    rawHtml = rawHtml.replace(
      "$FONTS$",
      `<style>
      ${STATIC_FONTS.split("\n").join("\n      ")}
    </style>`
    );
    if (fonts?.normal) {
      rawHtml = rawHtml.replace("$COURIERPRIME$", encodeBase64(fonts.normal));
    }
    if (fonts?.bold) {
      rawHtml = rawHtml.replace(
        "$COURIERPRIME-BOLD$",
        encodeBase64(fonts.bold)
      );
    }
    if (fonts?.italic) {
      rawHtml = rawHtml.replace(
        "$COURIERPRIME-ITALIC$",
        encodeBase64(fonts.italic)
      );
    }
    if (fonts?.bolditalic) {
      rawHtml = rawHtml.replace(
        "$COURIERPRIME-BOLD-ITALIC$",
        encodeBase64(fonts.bolditalic)
      );
    }
  } else {
    rawHtml = rawHtml.replace("$FONTS$", "");
  }

  rawHtml = rawHtml.replace(
    "$CSS$",
    `<style>
      ${STATIC_CSS.split("\n").join("\n      ")}
    </style>`
  );

  const titleHtml = config?.screenplay_print_title_page
    ? generateScreenplayTitleHtml(spans, "            ")
    : "";
  if (titleHtml) {
    rawHtml = rawHtml.replace(
      "$TITLEPAGE$",
      `<div class="page">
          <div class="innerpage title-grid">
            ${titleHtml}
          </div>
        </div>`
    );
  } else {
    rawHtml = rawHtml.replace("$TITLEPAGE$", "");
  }

  const mainHtml = spans
    ? generateScreenplayMainHtml(spans, "            ")
    : "";
  if (mainHtml) {
    rawHtml = rawHtml.replace(
      "$MAINPAGE$",
      `<div class="page">
          <div class="innerpage">
            ${mainHtml}
          </div>
        </div>`
    );
  } else {
    rawHtml = rawHtml.replace("$MAINPAGE$", "");
  }

  return rawHtml;
};
