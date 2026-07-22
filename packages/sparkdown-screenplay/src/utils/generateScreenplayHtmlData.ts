import ScreenplayTypesetter from "../classes/ScreenplayTypesetter";
import { STATIC_CSS } from "../constants/STATIC_CSS";
import { STATIC_FONTS } from "../constants/STATIC_FONTS";
import { STATIC_HTML } from "../constants/STATIC_HTML";
import { ScreenplayConfig } from "../types/ScreenplayConfig";
import { ScreenplayToken } from "../types/ScreenplayToken";
import { encodeBase64 } from "./encodeBase64";
import { generateScreenplayMainHtml } from "./generateScreenplayMainHtml";
import { generateScreenplayTitleHtml } from "./generateScreenplayTitleHtml";

/**
 * Optional hook that embeds only the emoji a script actually uses, as inline
 * vector SVG. Supplied by callers that have the emoji font (see
 * `createEmojiHtmlInliner` in @impower/sparkdown-screenplay-pdf); kept as a
 * local interface so this package needs no font tooling dependency.
 */
export interface EmojiHtmlInliner {
  inline(html: string): string;
  styleAndDefs(): string;
}

export const generateScreenplayHtmlData = (
  tokens: ScreenplayToken[],
  config?: ScreenplayConfig,
  fonts?: {
    normal?: ArrayBuffer | Uint8Array;
    bold?: ArrayBuffer | Uint8Array;
    italic?: ArrayBuffer | Uint8Array;
    bolditalic?: ArrayBuffer | Uint8Array;
  },
  emoji?: EmojiHtmlInliner,
): string => {
  let rawHtml: string = STATIC_HTML;

  const typesetter = new ScreenplayTypesetter();
  const spans = typesetter.compose(tokens, config);

  if (fonts && Object.keys(fonts).length > 0) {
    rawHtml = rawHtml.replace(
      "$FONTS$",
      `<style>
      ${STATIC_FONTS.split("\n").join("\n      ")}
    </style>`,
    );
    if (fonts?.normal) {
      rawHtml = rawHtml.replace("$COURIERPRIME$", encodeBase64(fonts.normal));
    }
    if (fonts?.bold) {
      rawHtml = rawHtml.replace(
        "$COURIERPRIME-BOLD$",
        encodeBase64(fonts.bold),
      );
    }
    if (fonts?.italic) {
      rawHtml = rawHtml.replace(
        "$COURIERPRIME-ITALIC$",
        encodeBase64(fonts.italic),
      );
    }
    if (fonts?.bolditalic) {
      rawHtml = rawHtml.replace(
        "$COURIERPRIME-BOLD-ITALIC$",
        encodeBase64(fonts.bolditalic),
      );
    }
  } else {
    rawHtml = rawHtml.replace("$FONTS$", "");
  }

  rawHtml = rawHtml.replace(
    "$CSS$",
    `<style>
      ${STATIC_CSS.split("\n").join("\n      ")}
    </style>`,
  );

  let titleHtml = config?.screenplay_print_title_page
    ? generateScreenplayTitleHtml(spans, "            ")
    : "";
  if (emoji && titleHtml) {
    titleHtml = emoji.inline(titleHtml);
  }
  if (titleHtml) {
    rawHtml = rawHtml.replace(
      "$TITLEPAGE$",
      `<div class="page">
          <div class="innerpage title-grid">
            ${titleHtml}
          </div>
        </div>`,
    );
  } else {
    rawHtml = rawHtml.replace("$TITLEPAGE$", "");
  }

  let mainHtml = spans
    ? generateScreenplayMainHtml(spans, "            ")
    : "";
  if (emoji && mainHtml) {
    mainHtml = emoji.inline(mainHtml);
  }
  if (mainHtml) {
    rawHtml = rawHtml.replace(
      "$MAINPAGE$",
      `<div class="page">
          <div class="innerpage">
            ${mainHtml}
          </div>
        </div>`,
    );
  } else {
    rawHtml = rawHtml.replace("$MAINPAGE$", "");
  }

  // Embed the used-emoji styles (must come after inline() has run over both
  // the title and main HTML so every used glyph is registered).
  if (emoji) {
    const emojiStyle = emoji.styleAndDefs();
    if (emojiStyle) {
      rawHtml = rawHtml.replace("</head>", `  ${emojiStyle}\n  </head>`);
    }
  }

  return rawHtml;
};
