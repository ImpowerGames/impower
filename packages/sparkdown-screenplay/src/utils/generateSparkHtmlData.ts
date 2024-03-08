import { SparkToken } from "../../../sparkdown/src/types/SparkToken";
import { Typesetter } from "../classes/Typesetter";
import { STATIC_CSS } from "../constants/STATIC_CSS";
import { STATIC_FONTS } from "../constants/STATIC_FONTS";
import { STATIC_HTML } from "../constants/STATIC_HTML";
import { SparkScreenplayConfig } from "../types/SparkScreenplayConfig";
import { encodeBase64 } from "./encodeBase64";
import { generateSparkMainHtml } from "./generateSparkMainHtml";
import { generateSparkTitleHtml } from "./generateSparkTitleHtml";

export const generateSparkHtmlData = (
  frontMatter: Record<string, string[]> | undefined,
  tokens: SparkToken[],
  config?: SparkScreenplayConfig,
  fonts?: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  }
): string => {
  let rawHtml: string = STATIC_HTML;

  const typesetter = new Typesetter();
  const frontMatterSpans = frontMatter
    ? typesetter.formatFrontMatter(frontMatter)
    : undefined;
  const bodySpans = tokens ? typesetter.formatBody(tokens, config) : undefined;

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

  const titleHtml =
    config?.screenplay_print_title_page && frontMatterSpans
      ? generateSparkTitleHtml(frontMatterSpans, "            ")
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

  const mainHtml = bodySpans
    ? generateSparkMainHtml(bodySpans, "            ")
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
